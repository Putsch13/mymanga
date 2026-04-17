import { NextResponse } from "next/server";
import { z } from "zod";
import { runChapterAutofill } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { chapterStudioDataSchema, chapterStudioSnapshotSchema } from "@manga-ai-studio/core";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";
import { repairGhostCharacters } from "@manga-ai-studio/core";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const schema = z.object({
  mode: z.enum([
    "brief",
    "cast_canon",
    "plan",
    "all_missing",
    "repair_readiness",
    // BUG-16 : réécriture ciblée d'un beat — nécessite targetBeatId, accepte userInstructions.
    "rewrite_beat",
  ]),
  force: z.boolean().optional().default(false),
  targetBeatId: z.string().optional(),
  userInstructions: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  // P1-6 : rate limit — autofill appelle l'IA sur brief/cast/plan (coûteux)
  const rl = await checkRateLimit(user.id, "chapter-autofill");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId, chapterId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      outline: true,
    },
  });
  if (!chapter) return notFound();

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide — mode autofill non reconnu." }, { status: 400 });
  }

  // BUG-16 : validation spécifique au mode rewrite_beat.
  if (body.mode === "rewrite_beat" && !body.targetBeatId) {
    return NextResponse.json(
      { error: "Le mode rewrite_beat nécessite un targetBeatId." },
      { status: 400 },
    );
  }

  const outlineRecord = (chapter.outline ?? {}) as Record<string, unknown>;
  const rawSnapshot = outlineRecord.studio ?? null;
  const snapshot = rawSnapshot
    ? (() => {
        try {
          return chapterStudioSnapshotSchema.parse(rawSnapshot);
        } catch {
          return null;
        }
      })()
    : null;

  const currentData = snapshot?.data
    ? chapterStudioDataSchema.parse(snapshot.data)
    : chapterStudioDataSchema.parse({});

  // Bloquer l'autofill "all_missing" uniquement si le pitch est vraiment absent
  // Seuil abaissé à 5 chars (cohérent avec buildChapterReadinessReport)
  if (body.mode === "all_missing") {
    const pitch = currentData.intent?.shortPitch?.trim() ?? "";
    if (pitch.length < 5) {
      console.warn(
        `[autofill] autofill_blocked_no_pitch chapterId=${chapterId} pitchLength=${pitch.length}`,
      );
      return NextResponse.json({
        ok: false,
        chapterId,
        mode: body.mode,
        blocked: true,
        blockedReason: "pitch_too_short",
        blockedMessage: "Remplis d'abord le pitch du chapitre (au moins 5 caractères) avant de demander une complétion IA.",
        suggestedPatch: {},
        appliedFields: [],
        unresolvedQuestions: [],
        confidence: 0,
        meta: null,
        debug: {
          hadSnapshot: snapshot !== null,
          hadIntent: false,
          contextCharacters: 0,
          contextRecentChapters: 0,
        },
      });
    }
  }

  const context = await buildProjectContext(prisma, projectId, currentData.intent?.shortPitch ?? null, {
    targetChapterId: chapterId,
    targetChapterNumber: chapter.chapterNumber,
  });

  if (!context) return notFound();

  console.log(
    `[autofill] autofill_started chapterId=${chapterId} mode=${body.mode} ` +
    `hadSnapshot=${snapshot !== null} hadIntent=${Boolean(currentData.intent?.shortPitch)} ` +
    `contextCharacters=${context.characters?.length ?? 0} ` +
    `contextRecentChapters=${context.recentChapters?.length ?? 0}`,
  );

  const result = await runChapterAutofill({
    mode: body.mode,
    currentData,
    context,
    force: body.force,
    targetBeatId: body.targetBeatId,
    userInstructions: body.userInstructions,
  });

  const appliedFields = result.appliedFields ?? [];
  const patchIsEmpty = !result.suggestedPatch || Object.keys(result.suggestedPatch).length === 0;

  if (patchIsEmpty || appliedFields.length === 0) {
    // Détecter la raison du patch vide
    let emptyReason = "Aucun champ vide détecté";
    const pitch = currentData.intent?.shortPitch?.trim() ?? "";
    if (pitch.length < 20) {
      emptyReason = "Le pitch du chapitre est trop court pour générer une complétion pertinente";
    } else if ((context.characters?.length ?? 0) === 0) {
      emptyReason = "Le contexte du projet est insuffisant (aucun personnage défini)";
    }
    console.warn(
      `[autofill] autofill_empty_patch chapterId=${chapterId} mode=${body.mode} reason="${emptyReason}"`,
    );
    return NextResponse.json({
      ok: true,
      chapterId,
      mode: body.mode,
      suggestedPatch: result.suggestedPatch ?? {},
      assumptions: result.assumptions,
      confidence: result.confidence,
      unresolvedQuestions: result.unresolvedQuestions,
      appliedFields,
      provenance: result.provenance,
      meta: result.meta,
      emptyPatch: true,
      emptyPatchReason: emptyReason,
      debug: {
        hadSnapshot: snapshot !== null,
        hadIntent: Boolean(currentData.intent?.shortPitch),
        contextCharacters: context.characters?.length ?? 0,
        contextRecentChapters: context.recentChapters?.length ?? 0,
      },
    });
  }

  // A1 : Réparer les personnages fantômes dans le patch avant sauvegarde
  if (result.suggestedPatch && typeof result.suggestedPatch === "object") {
    try {
      const knownCharacters = await prisma.character.findMany({
        where: { projectId },
        select: { id: true, name: true, roleType: true },
      });
      const knownCharacterIds = knownCharacters.map((c) => c.id);
      const patchOutline = result.suggestedPatch as { beats?: Array<Record<string, unknown>> };
      if (Array.isArray(patchOutline.beats) && patchOutline.beats.length > 0) {
        const repairResult = repairGhostCharacters(
          { beats: patchOutline.beats },
          knownCharacterIds,
          knownCharacters,
        );
        if (repairResult.ghostsFound > 0) {
          console.warn(
            `[autofill] ghost_repair chapterId=${chapterId} found=${repairResult.ghostsFound} resolved=${repairResult.ghostsResolved}`,
          );
        }
      }
    } catch (ghostErr) {
      console.error(`[autofill] ghost_repair_failed (non-blocking): ${ghostErr instanceof Error ? ghostErr.message : ghostErr}`);
    }
  }

  console.log(
    `[autofill] autofill_success chapterId=${chapterId} mode=${body.mode} ` +
    `appliedFields=${appliedFields.join(",")}`,
  );

  return NextResponse.json({
    ok: true,
    chapterId,
    mode: body.mode,
    suggestedPatch: result.suggestedPatch,
    assumptions: result.assumptions,
    confidence: result.confidence,
    unresolvedQuestions: result.unresolvedQuestions,
    appliedFields,
    provenance: result.provenance,
    meta: result.meta,
    emptyPatch: false,
    debug: {
      hadSnapshot: snapshot !== null,
      hadIntent: Boolean(currentData.intent?.shortPitch),
      contextCharacters: context.characters?.length ?? 0,
      contextRecentChapters: context.recentChapters?.length ?? 0,
    },
  });
}
