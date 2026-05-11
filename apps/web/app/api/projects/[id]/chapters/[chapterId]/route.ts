import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { patchChapterStudioSnapshot } from "@/lib/chapter-studio";
import { sceneImageIncludedInCurrentRunReport } from "@/lib/chapter-studio/scene-image-filter";
import { extractChapterVisualContractFromOutline } from "@manga-ai-studio/workflow";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";

import { computeImageStats } from "./_chapter-route/image-stats";
import { buildPanelDebug } from "./_chapter-route/panel-debug";
import { extractSceneFallbacks } from "./_chapter-route/scene-fallbacks";
import { signAndProxySceneImages } from "./_chapter-route/sign-images";
import { asRecord, asRecordOrNull } from "./_chapter-route/types";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const patchSchema = z.object({
  title: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  cliffhanger: z.string().optional().nullable(),
  userIntent: z.string().optional().nullable(),
  storyboard: z.unknown().optional(),
  script: z.unknown().optional(),
  outline: z.unknown().optional(),
  status: z.string().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();

  const [chapter, memorySnapshot, activeJob] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, projectId },
      include: {
        scenes: {
          orderBy: { sceneNumber: "asc" },
          include: {
            keyframes: {
              where: { selected: true },
              orderBy: { version: "desc" },
              take: 1,
              select: {
                id: true,
                imageUrl: true,
                metadata: true,
              },
            },
            images: {
              orderBy: { panelNumber: "asc" },
              select: {
                id: true,
                panelNumber: true,
                imageUrl: true,
                persistedUrl: true,
                status: true,
                provider: true,
                model: true,
                consistencyScore: true,
                prompt: true,
                metadata: true,
                generationRunId: true,
                userValidatedAt: true,
                retryCount: true,
                falTraces: {
                  orderBy: { createdAt: "desc" },
                  take: 6,
                  select: {
                    id: true,
                    status: true,
                    mode: true,
                    provider: true,
                    model: true,
                    requestId: true,
                    jobId: true,
                    requestPayload: true,
                    timings: true,
                    refsUsed: true,
                    lorasUsed: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.memorySnapshot.findFirst({
      where: { chapterId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findFirst({
      where: { chapterId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, output: true, createdAt: true },
    }),
  ]);

  if (!chapter) return notFound();

  // P1.14 — Filtrer les images hors du run courant (sauf panels validés utilisateur)
  // pour éviter de mélanger ancien run, nouveau storyboard, panels pending.
  const filteredScenes = chapter.scenes.map((scene) => ({
    ...scene,
    images: scene.images.filter((img) => sceneImageIncludedInCurrentRunReport(img, chapter)),
  }));

  // P0.4 — helper central (allowlist stricte + HMAC). Fini les listes de
  // hosts dupliquées par route.
  const { signedCount, proxiedCount } = await signAndProxySceneImages(filteredScenes);
  const totalImages = filteredScenes.flatMap((s) => s.images).length;
  console.log(`[chapter-route] images=${totalImages} signed=${signedCount} proxied=${proxiedCount}`);

  const allImages = filteredScenes.flatMap((s) => s.images);
  const imageStats = computeImageStats(allImages);
  const studioSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {},
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      transitionReason: "reader_hydration",
    },
  );
  if (studioSnapshot.data.readinessReport) {
    studioSnapshot.data.readinessReport.imageCounts = {
      ...studioSnapshot.data.readinessReport.imageCounts,
      generatedImages: imageStats.total,
      acceptedImages: imageStats.completed,
      rejectedImages: imageStats.failed,
      missingImages: Math.max(
        0,
        studioSnapshot.data.readinessReport.imageCounts.minimumImages - imageStats.completed,
      ),
    };
  }

  const outlineRecord = asRecord(chapter.outline);
  const scriptRecord = asRecord(chapter.script);
  const sceneFallbacks = extractSceneFallbacks(filteredScenes);
  const firstImageMeta = filteredScenes
    .flatMap((scene) => scene.images)
    .map((image) => asRecordOrNull(image.metadata))
    .find((meta): meta is Record<string, unknown> => meta !== null);
  const panelDebug = buildPanelDebug(filteredScenes);

  // P0.8 : un chapitre flaggé "ready_for_render" sans `narrativeCommitId`
  // indique un narrative-pass crashé au milieu (Tx A OK mais Tx B ou D
  // jamais committée sur un schéma déjà migré). On remonte l'info au client
  // pour qu'il puisse afficher un état "à régénérer" plutôt qu'un chapitre
  // incomplet présenté comme prêt.
  const chapterNarrativeCommitId =
    (chapter as { narrativeCommitId?: string | null }).narrativeCommitId ?? null;
  const isStaleReady =
    chapter.status === "ready_for_render" && chapterNarrativeCommitId === null;

  const projectFormat = (project.format === "webtoon" ? "webtoon" : "manga") as "manga" | "webtoon";

  return NextResponse.json({
    chapter: { ...chapter, scenes: filteredScenes },
    projectFormat,
    isStaleReady,
    narrativeCommitId: chapterNarrativeCommitId,
    /** Contrat visuel chapitre (LLM), si présent dans `chapter.outline`. */
    chapterVisualContract: extractChapterVisualContractFromOutline(outlineRecord),
    studio: studioSnapshot,
    memorySnapshot,
    activeJob,
    imageStats,
    generationRunSummary:
      typeof outlineRecord.generationRunSummary === "object" && outlineRecord.generationRunSummary
        ? outlineRecord.generationRunSummary
        : null,
    generationDiagnostics: {
      operationalStatus:
        typeof outlineRecord.operationalStatus === "string"
          ? outlineRecord.operationalStatus
          : typeof scriptRecord.operationalStatus === "string"
            ? scriptRecord.operationalStatus
            : "FULLY_OPERATIONAL",
      degradedModes: Array.isArray(outlineRecord.degradedModes)
        ? outlineRecord.degradedModes
        : Array.isArray(scriptRecord.degradedModes)
          ? scriptRecord.degradedModes
          : [],
      outline:
        outlineRecord.generationDiagnostics &&
        typeof outlineRecord.generationDiagnostics === "object"
          ? outlineRecord.generationDiagnostics
          : null,
      dialogue:
        scriptRecord.generationDiagnostics &&
        typeof scriptRecord.generationDiagnostics === "object"
          ? scriptRecord.generationDiagnostics
          : null,
      sceneFallbacks,
      creativityControls:
        firstImageMeta && typeof firstImageMeta.effectiveCreativeControls === "object"
          ? firstImageMeta.effectiveCreativeControls
          : null,
      qualityReport:
        outlineRecord.qualityReport && typeof outlineRecord.qualityReport === "object"
          ? outlineRecord.qualityReport
          : scriptRecord.qualityReport && typeof scriptRecord.qualityReport === "object"
            ? scriptRecord.qualityReport
            : null,
      panelDebug,
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const existing = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!existing) return notFound();
  const body = patchSchema.parse(await req.json());

  if (body.status !== undefined) {
    return validationError(
      "Le statut chapitre ne peut plus être modifié via l'endpoint legacy. Utilise le workflow Chapter Studio.",
    );
  }

  const data: Prisma.ChapterUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.cliffhanger !== undefined) data.cliffhanger = body.cliffhanger;
  if (body.userIntent !== undefined) data.userIntent = body.userIntent;
  if (body.storyboard !== undefined) data.storyboard = toPrismaInputJson(body.storyboard);
  if (body.script !== undefined) data.script = toPrismaInputJson(body.script);
  if (body.outline !== undefined) data.outline = toPrismaInputJson(body.outline);

  const chapter = await prisma.chapter.update({
    where: { id: chapterId },
    data,
  });
  return NextResponse.json({ chapter });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    select: { id: true },
  });
  if (!chapter) return notFound();

  await prisma.chapter.delete({ where: { id: chapterId } });

  const remaining = await prisma.chapter.findMany({
    where: { projectId },
    orderBy: { chapterNumber: "asc" },
    select: { id: true },
  });
  await Promise.all(
    remaining.map((c, i) =>
      prisma.chapter.update({ where: { id: c.id }, data: { chapterNumber: i + 1 } }),
    ),
  );

  return NextResponse.json({ success: true, deletedId: chapterId });
}
