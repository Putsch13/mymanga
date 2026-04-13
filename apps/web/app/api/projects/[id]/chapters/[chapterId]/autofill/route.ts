import { NextResponse } from "next/server";
import { z } from "zod";
import { runChapterAutofill } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { chapterStudioDataSchema, chapterStudioSnapshotSchema } from "@manga-ai-studio/core";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const schema = z.object({
  mode: z.enum(["brief", "cast_canon", "plan", "all_missing", "repair_readiness"]),
  force: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

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

  const body = schema.parse(await req.json());

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

  // Bloquer l'autofill "all_missing" si le pitch est vide
  if (body.mode === "all_missing") {
    const pitch = currentData.intent?.shortPitch?.trim() ?? "";
    if (pitch.length < 10) {
      console.warn(
        `[autofill] autofill_blocked_no_pitch chapterId=${chapterId} pitchLength=${pitch.length}`,
      );
      return NextResponse.json({
        ok: false,
        chapterId,
        mode: body.mode,
        blocked: true,
        blockedReason: "pitch_too_short",
        blockedMessage: "Ajoute d'abord un pitch de chapitre (au moins une phrase) avant de demander une complétion IA.",
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
