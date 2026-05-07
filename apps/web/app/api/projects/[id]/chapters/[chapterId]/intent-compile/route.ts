import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { extractWorldEntitiesFromIntent } from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { compileChapterIntentUsecase, UsecaseFailure } from "@/server/usecases";
import { patchChapterStudioSnapshot } from "@/lib/chapter-studio";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";
import { upsertWorldEntities } from "@/lib/world-entities/upsert-world-entities";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const bodySchema = z.object({
  rawUserIntent: z.string().optional(),
  shortPitch: z.string().optional(),
  mustHappen: z.string().optional(),
  mustNot: z.string().optional(),
  wish: z.string().optional(),
  pacing: z.enum(["slow", "balanced", "fast"]).optional(),
  dialogueLevel: z.enum(["low", "medium", "high"]).optional(),
  endingType: z.string().optional(),
  /** When true (default), the compiled contract is persisted in the studio snapshot. */
  persist: z.boolean().optional().default(true),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const rl = await checkRateLimit(user.id, "chapter-intent-compile");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  try {
    const { contract, narrativeContract, usedAi } = await compileChapterIntentUsecase.execute({
      ...body,
      chapterId: chapter.id,
    });

    // P0 fix : persister le contrat dans le studioDraft pour que le readiness
    // dashboard et la launch route le voient via `snapshot.data.chapterIntentContract`.
    // Sans ça, le bouton "Analyser l'histoire" semblait ne rien faire.
    let persisted = false;
    if (body.persist !== false) {
      try {
        const snapshot = patchChapterStudioSnapshot(
          chapter.outline,
          {
            chapterIntentContract: contract,
          },
          {
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.title,
            chapterSummary: chapter.summary,
            cliffhanger: chapter.cliffhanger,
            userIntent: chapter.userIntent,
            transitionReason: "intent_compile_repair",
          },
        );

        const outlineRecord =
          chapter.outline && typeof chapter.outline === "object" && !Array.isArray(chapter.outline)
            ? (chapter.outline as Record<string, unknown>)
            : {};

        const nextOutline = {
          ...outlineRecord,
          studio: snapshot,
        };

        await prisma.chapter.update({
          where: { id: chapter.id },
          data: {
            outline: toPrismaInputJson(nextOutline),
            studioUpdatedAt: new Date(),
          },
        });
        persisted = true;
        console.info(
          `[intent-compile] persisted chapterId=${chapter.id} usedAi=${usedAi} narrativeContract=${narrativeContract != null}`,
        );
      } catch (persistErr) {
        // Ne pas bloquer l'utilisateur si la persistance échoue : il aura quand
        // même le contrat dans la réponse et pourra le sauvegarder via le wizard.
        console.error("[intent-compile] persist_failed", persistErr);
      }
    }

    // P1 FULL AUTO : extraire les entités monde (groupes PNJ, props/artefacts)
    // depuis l'intention utilisateur et les upserter en DB avec USER-WINS.
    // Cela alimente le pipeline + le wizard "Monde vivant" automatiquement.
    let worldEntitiesResult: {
      npcGroupsCreated: number;
      npcGroupsUpdated: number;
      npcGroupsSkippedUserEdited: number;
      worldPropsCreated: number;
      worldPropsUpdated: number;
      worldPropsSkippedUserEdited: number;
      source: "openai" | "heuristic_fallback";
      warnings: string[];
    } | null = null;
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true, primaryGenre: true, tone: true },
      });
      const existing = await Promise.all([
        prisma.npcGroup.findMany({ where: { projectId }, select: { slug: true } }),
        prisma.worldProp.findMany({ where: { projectId }, select: { slug: true } }),
      ]);
      const rawIntent =
        body.rawUserIntent
        ?? [body.shortPitch, body.mustHappen, body.mustNot, body.wish].filter(Boolean).join("\n")
        ?? chapter.userIntent
        ?? "";

      const extraction = await extractWorldEntitiesFromIntent({
        rawUserIntent: rawIntent,
        projectTitle: project?.title ?? null,
        projectGenre: project?.primaryGenre ?? null,
        projectTone: project?.tone ?? null,
        existingNpcGroupSlugs: existing[0].map((g) => g.slug),
        existingWorldPropSlugs: existing[1].map((p) => p.slug),
      });

      const upsertResult = await upsertWorldEntities({
        projectId,
        chapterId: chapter.id,
        source: extraction.source === "openai" ? "intent_compile_llm" : "intent_compile_heuristic",
        npcGroups: extraction.npcGroups,
        worldProps: extraction.worldProps,
      });

      worldEntitiesResult = {
        npcGroupsCreated: upsertResult.npcGroupsCreated,
        npcGroupsUpdated: upsertResult.npcGroupsUpdated,
        npcGroupsSkippedUserEdited: upsertResult.npcGroupsSkippedUserEdited,
        worldPropsCreated: upsertResult.worldPropsCreated,
        worldPropsUpdated: upsertResult.worldPropsUpdated,
        worldPropsSkippedUserEdited: upsertResult.worldPropsSkippedUserEdited,
        source: extraction.source,
        warnings: extraction.warnings,
      };
      console.info(
        `[intent-compile:world-entities] chapterId=${chapter.id} source=${extraction.source}`
        + ` npcGroups(+${upsertResult.npcGroupsCreated}/~${upsertResult.npcGroupsUpdated}/skip${upsertResult.npcGroupsSkippedUserEdited})`
        + ` worldProps(+${upsertResult.worldPropsCreated}/~${upsertResult.worldPropsUpdated}/skip${upsertResult.worldPropsSkippedUserEdited})`,
      );
    } catch (extractErr) {
      console.error("[intent-compile:world-entities] extraction_failed", extractErr);
    }

    return NextResponse.json({
      contract,
      narrativeContract,
      chapterId: chapter.id,
      usedAi,
      persisted,
      worldEntities: worldEntitiesResult,
    });
  } catch (err) {
    if (err instanceof UsecaseFailure && err.code === "INTENT_RAW_TOO_SHORT") {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}
