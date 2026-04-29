import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import { resolveNpcWithAiFallback } from "@manga-ai-studio/world";
import { NPC_ONTOLOGY } from "@manga-ai-studio/world/legacy/npc-ontology";
import { detectSpeciesInDescription, resolveSpeciesArchetype } from "@manga-ai-studio/memory";
import { prisma } from "@manga-ai-studio/db";
import { pickDeterministicHook } from "@/lib/npc/pick-deterministic-hook";
import { safeNarrativeHook } from "@/lib/npc/safe-narrative-hook";

const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;

  // P0.3 — ownership check : jamais d'écriture archetype sur un projet
  // appartenant à un autre utilisateur. Convention homogène avec les autres
  // routes (cf. style-pack/route.ts) : on renvoie 404 pour ne pas divulguer
  // l'existence d'un projet tiers.
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return notFound();

  const body = await req.json() as {
    rawDescription: string;
    universe?: string;
    tone?: string;
    sceneLocation?: string;
  };

  if (!body.rawDescription || body.rawDescription.length < 3) {
    return NextResponse.json({ error: "rawDescription required (min 3 chars)" }, { status: 400 });
  }

  const desc = body.rawDescription.toLowerCase();
  const universe = (body.universe ?? "fantasy").toLowerCase();
  const tone = (body.tone ?? "épique").toLowerCase();

  const speciesLabel = detectSpeciesInDescription(body.rawDescription);

  if (speciesLabel) {
    try {
      const { traits, isNew } = await resolveSpeciesArchetype(prisma, {
        projectId,
        speciesLabel,
        universe,
        tone,
        sourceModel: openai ? "openai:gpt-4o-mini" : "fallback:no-openai",
        generateWithAI: async (prompt) => {
          if (!openai) return "{}";
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 500,
          });
          return completion.choices[0]?.message?.content ?? "{}";
        },
      });

      // AUDIT COMMIT 6 — on sépare explicitement le fragment visuel (utilisé
      // dans les prompts image) du hook narratif (jamais injecté dans
      // l'image). `promptFragment` reste pour la back-compat court-terme
      // mais les consumers doivent migrer vers `visualPromptFragment`.
      const visualPromptFragment = traits.promptFragment;
      const interactionHooks = [
        `Un membre de l'espèce ${speciesLabel} avec les traits distinctifs de la race`,
        `Variation individuelle sur la base commune de l'espèce`,
      ];
      return NextResponse.json({
        strategy: isNew ? "species_created" : "species_recalled",
        confidence: 0.95,
        isSpecies: true,
        speciesLabel,
        topMatch: {
          label: speciesLabel,
          visualCues: [traits.morphology, traits.skinTexture, ...traits.distinctiveMarkers.slice(0, 1)],
          interactionHooks,
        },
        visualPromptFragment,
        promptFragment: visualPromptFragment,
        interactionHooks,
        narrativeHook: `Un·e ${speciesLabel} avec les traits caractéristiques de son espèce.`,
      });
    } catch (err) {
      console.error("[npc-resolve] species resolution failed:", err);
    }
  }

  // IA d'abord quand OpenAI est disponible. `resolveNpcWithAiFallback` ne throw
  // pas (fallback Zod / LLM interne) ; ce try/catch reste une défense si le client
  // OpenAI ou un futur refactor lève une erreur synchrone.
  if (openai) {
    try {
      const aiNpc = await resolveNpcWithAiFallback(
        { rawDescription: body.rawDescription, universe, tone, sceneLocation: body.sceneLocation },
        async (messages) => {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            response_format: { type: "json_object" },
            max_tokens: 400,
          });
          return completion.choices[0]?.message?.content ?? "{}";
        },
      );

      return NextResponse.json({
        strategy: "ai_generated",
        confidence: 0.85,
        topMatch: {
          label: aiNpc.label,
          visualCues: aiNpc.visualCues,
          interactionHooks: aiNpc.interactionHooks,
        },
        visualPromptFragment: aiNpc.promptFragment,
        promptFragment: aiNpc.promptFragment,
        interactionHooks: aiNpc.interactionHooks,
        narrativeHook: aiNpc.narrativeHook,
      });
    } catch (err) {
      console.warn("[npc-resolve] ai_primary_failed", err);
      if (isPipelineV3PremiumOnlyEnabled()) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          {
            error: "ai_npc_resolution_failed",
            code: "NPC_AI_RESOLUTION_FAILED",
            message:
              "La résolution PNJ par IA a échoué en mode premium strict : le repli catalogue legacy est désactivé. " +
              "Vérifie OpenAI ou réessaie.",
            details: message.slice(0, 400),
          },
          { status: 502 },
        );
      }
    }
  }

  const scored = NPC_ONTOLOGY.map((entry) => {
    let score = 0;
    const words = desc.split(/\s+/).filter(w => w.length >= 3);

    if (entry.label.toLowerCase().split(/[\s/]+/).some(lw => words.some(w => lw.includes(w) || w.includes(lw)))) {
      score += 8;
    }
    if (entry.role && words.some(w => entry.role!.toLowerCase().includes(w) || w.includes(entry.role!.toLowerCase()))) {
      score += 6;
    }
    for (const word of words) {
      for (const tag of entry.tags) {
        if (tag.toLowerCase() === word) score += 4;
        else if (tag.toLowerCase().includes(word)) score += 2;
      }
    }
    if (entry.universes.some((u) => universe.includes(u.toLowerCase()))) score += 3;
    if (entry.tones.some((t) => tone.includes(t.toLowerCase()))) score += 2;

    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const confidence = scored.length > 0 ? Math.min(scored[0]!.score / 15, 1) : 0;
  const forceAI = !scored[0] || scored[0].score < 4;
  const best = scored[0]?.entry;

  const catalogMatchResponse = () => {
    if (!best || !(confidence > 0.3 && !forceAI)) return null;
    const deterministicHook = pickDeterministicHook(best.interactionHooks, {
      projectId,
      rawDescription: body.rawDescription,
      universe: body.universe,
      tone: body.tone,
      sceneLocation: body.sceneLocation,
    });
    const visualPromptFragment = best.visualCues.slice(0, 3).join(", ");
    return NextResponse.json({
      strategy: scored.length > 1 ? "catalog_blend" : "catalog_match",
      confidence,
      topMatch: {
        label: best.label,
        visualCues: best.visualCues,
        interactionHooks: best.interactionHooks,
      },
      visualPromptFragment,
      promptFragment: visualPromptFragment,
      interactionHooks: best.interactionHooks,
      narrativeHook: deterministicHook ?? "",
    });
  };

  const catalogFallbackResponse = () => {
    if (!best) return null;
    const visualPromptFragment = best.visualCues.slice(0, 2).join(", ");
    return NextResponse.json({
      strategy: "catalog_fallback",
      confidence,
      topMatch: {
        label: best.label,
        visualCues: best.visualCues,
        interactionHooks: best.interactionHooks,
      },
      visualPromptFragment,
      promptFragment: visualPromptFragment,
      interactionHooks: best.interactionHooks,
      narrativeHook: safeNarrativeHook(best.interactionHooks),
    });
  };

  const catalogMatch = openai ? null : catalogMatchResponse();
  if (catalogMatch) return catalogMatch;

  if (!openai) {
    const fb = catalogFallbackResponse();
    if (fb) return fb;
    return NextResponse.json({
      strategy: "ai_generated",
      confidence: 0,
      topMatch: {
        label: body.rawDescription.slice(0, 40),
        visualCues: [],
        interactionHooks: [],
      },
      visualPromptFragment: body.rawDescription,
      promptFragment: body.rawDescription,
      interactionHooks: [],
      narrativeHook: "Un personnage intriguant : " + body.rawDescription.slice(0, 60),
    });
  }

  const fbAfterAi = catalogFallbackResponse();
  if (fbAfterAi) return fbAfterAi;

  return NextResponse.json({ error: "resolution_failed" }, { status: 500 });
}
