import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth/get-app-user";
import { NPC_ONTOLOGY, resolveNpcWithAiFallback } from "@manga-ai-studio/world";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ctx.params;

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

  const scored = NPC_ONTOLOGY.map((entry) => {
    let score = 0;
    const targets = [...entry.tags, ...entry.universes, ...entry.tones, entry.label, entry.role ?? ""].map((s) => s.toLowerCase());
    for (const word of desc.split(/\s+/)) {
      if (word.length < 3) continue;
      for (const t of targets) {
        if (t.includes(word) || word.includes(t)) score++;
      }
    }
    if (entry.universes.some((u) => universe.includes(u.toLowerCase()))) score += 3;
    if (entry.tones.some((t) => tone.includes(t.toLowerCase()))) score += 2;
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const confidence = scored.length > 0 ? Math.min(scored[0]!.score / 10, 1) : 0;
  const best = scored[0]?.entry;

  if (best && confidence > 0.4) {
    return NextResponse.json({
      strategy: scored.length > 1 ? "catalog_blend" : "catalog_match",
      confidence,
      topMatch: {
        label: best.label,
        visualCues: best.visualCues,
        interactionHooks: best.interactionHooks,
      },
      promptFragment: best.visualCues.slice(0, 3).join(", "),
      narrativeHook: best.interactionHooks[Math.floor(Math.random() * best.interactionHooks.length)] ?? "",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (best) {
      return NextResponse.json({
        strategy: "catalog_fallback",
        confidence,
        topMatch: {
          label: best.label,
          visualCues: best.visualCues,
          interactionHooks: best.interactionHooks,
        },
        promptFragment: best.visualCues.slice(0, 2).join(", "),
        narrativeHook: best.interactionHooks[0] ?? "",
      });
    }
    return NextResponse.json({
      strategy: "ai_generated",
      confidence: 0,
      topMatch: {
        label: body.rawDescription.slice(0, 40),
        visualCues: [],
        interactionHooks: [],
      },
      promptFragment: body.rawDescription,
      narrativeHook: "Un personnage intriguant : " + body.rawDescription.slice(0, 60),
    });
  }

  try {
    const aiNpc = await resolveNpcWithAiFallback(
      { rawDescription: body.rawDescription, universe, tone, sceneLocation: body.sceneLocation },
      async (messages) => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            response_format: { type: "json_object" },
            max_tokens: 400,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}`);
        const data = await res.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content ?? "{}";
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
      promptFragment: aiNpc.promptFragment,
      narrativeHook: aiNpc.narrativeHook,
    });
  } catch {
    if (best) {
      return NextResponse.json({
        strategy: "catalog_fallback",
        confidence,
        topMatch: {
          label: best.label,
          visualCues: best.visualCues,
          interactionHooks: best.interactionHooks,
        },
        promptFragment: best.visualCues.slice(0, 2).join(", "),
        narrativeHook: best.interactionHooks[0] ?? "",
      });
    }
    return NextResponse.json({ error: "resolution_failed" }, { status: 500 });
  }
}
