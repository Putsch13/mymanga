import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { toProxiedServerUrl } from "@/lib/images/proxy-url.server";
import { patchChapterStudioSnapshot } from "@/lib/chapter-studio";

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
                persistedUrl: true,      // URGENCE 2 : URL stable Supabase
                status: true,
                provider: true,
                model: true,
                consistencyScore: true,
                prompt: true,
                metadata: true,
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

  // P0.4 — helper central (allowlist stricte + HMAC). Fini les listes de
  // hosts dupliquées par route.
  let proxiedCount = 0;
  let signedCount = 0;
  await Promise.all(
    chapter.scenes.flatMap((scene) =>
      [
        ...scene.keyframes.map(async (keyframe) => {
          const original = keyframe.imageUrl;
          const signed = await signSupabaseUrlIfNeeded(keyframe.imageUrl);
          keyframe.imageUrl = toProxiedServerUrl(signed ?? original);
        }),
        ...scene.images.map(async (img) => {
          const original = img.imageUrl;
          const signed = await signSupabaseUrlIfNeeded(img.imageUrl);
          if (signed !== original) signedCount++;
          const proxied = toProxiedServerUrl(signed ?? original);
          if (proxied && proxied !== (signed ?? original)) proxiedCount++;
          img.imageUrl = proxied ?? signed ?? original;
          if ((img as { persistedUrl?: string | null }).persistedUrl) {
            const ps = await signSupabaseUrlIfNeeded((img as { persistedUrl?: string | null }).persistedUrl ?? null);
            (img as { persistedUrl?: string | null }).persistedUrl = toProxiedServerUrl(ps ?? (img as { persistedUrl?: string | null }).persistedUrl) ?? (img as { persistedUrl?: string | null }).persistedUrl;
          }
        }),
      ],
    ),
  );
  const totalImages = chapter.scenes.flatMap((s) => s.images).length;
  console.log(`[chapter-route] images=${totalImages} signed=${signedCount} proxied=${proxiedCount}`);

  // Statistiques images pour le reader
  const allImages = chapter.scenes.flatMap((s) => s.images);
  const imageStats = {
    total: allImages.length,
    completed: allImages.filter((i) => i.status === "completed" && i.imageUrl).length,
    failed: allImages.filter((i) => i.status === "failed" || i.status === "blocked").length,
    pending: allImages.filter((i) => i.status === "planned" || i.status === "pending").length,
  };
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
      missingImages: Math.max(0, studioSnapshot.data.readinessReport.imageCounts.minimumImages - imageStats.completed),
    };
  }

  const outlineRecord =
    chapter.outline && typeof chapter.outline === "object" && !Array.isArray(chapter.outline)
      ? (chapter.outline as Record<string, unknown>)
      : {};
  const scriptRecord =
    chapter.script && typeof chapter.script === "object" && !Array.isArray(chapter.script)
      ? (chapter.script as Record<string, unknown>)
      : {};
  const sceneFallbacks = chapter.scenes
    .map((scene) => {
      const meta =
        scene.metadata && typeof scene.metadata === "object" && !Array.isArray(scene.metadata)
          ? (scene.metadata as Record<string, unknown>)
          : {};
      const dialogueGeneration =
        meta.dialogueGeneration && typeof meta.dialogueGeneration === "object"
          ? (meta.dialogueGeneration as Record<string, unknown>)
          : null;
      return dialogueGeneration && dialogueGeneration.usedFallback === true
        ? {
            sceneId: scene.id,
            title: scene.title,
            reason:
              typeof dialogueGeneration.fallbackReason === "string"
                ? dialogueGeneration.fallbackReason
                : "Dialogue fallback used",
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const firstImageMeta = chapter.scenes
    .flatMap((scene) => scene.images)
    .map((image) =>
      image.metadata && typeof image.metadata === "object" && !Array.isArray(image.metadata)
        ? (image.metadata as Record<string, unknown>)
        : null,
    )
    .find((meta): meta is Record<string, unknown> => meta !== null);
  const panelDebug = chapter.scenes.flatMap((scene) =>
    scene.images.slice(0, 4).map((image) => {
      const meta =
        image.metadata && typeof image.metadata === "object" && !Array.isArray(image.metadata)
          ? (image.metadata as Record<string, unknown>)
          : {};
      const validationDetails =
        meta.validationDetails && typeof meta.validationDetails === "object"
          ? (meta.validationDetails as Record<string, unknown>)
          : {};
      const qualityScores =
        validationDetails.qualityScores && typeof validationDetails.qualityScores === "object"
          ? (validationDetails.qualityScores as Record<string, unknown>)
          : {};
      const visionAnalysis =
        validationDetails.visionAnalysis && typeof validationDetails.visionAnalysis === "object"
          ? (validationDetails.visionAnalysis as Record<string, unknown>)
          : {};
      const generationLog =
        meta.generationLog && typeof meta.generationLog === "object"
          ? (meta.generationLog as Record<string, unknown>)
          : {};
      const promptDebug =
        meta.promptDebug && typeof meta.promptDebug === "object"
          ? (meta.promptDebug as Record<string, unknown>)
          : {};
      // P0.4 — packet canonique persisté (source de vérité audit/review)
      const canonicalPacket =
        meta.canonicalPacket && typeof meta.canonicalPacket === "object"
          ? (meta.canonicalPacket as Record<string, unknown>)
          : null;
      const canonicalPacketValidation =
        meta.canonicalPacketValidation && typeof meta.canonicalPacketValidation === "object"
          ? (meta.canonicalPacketValidation as Record<string, unknown>)
          : null;
      const packetRerollPlans = Array.isArray(meta.packetRerollPlans)
        ? (meta.packetRerollPlans as Record<string, unknown>[])
        : [];
      const falStrategy =
        meta.falStrategy && typeof meta.falStrategy === "object"
          ? (meta.falStrategy as Record<string, unknown>)
          : {};
      const activeKeyframe = scene.keyframes[0] ?? null;
      return {
        sceneId: scene.id,
        panelId: image.id,
        panelNumber: image.panelNumber,
        status: image.status,
        provider: image.provider,
        model: image.model,
        keyframeId: activeKeyframe?.id ?? null,
        keyframeImageUrl: activeKeyframe?.imageUrl ?? null,
        workflow:
          typeof generationLog.workflow === "string"
            ? generationLog.workflow
            : typeof falStrategy.workflow === "string"
              ? falStrategy.workflow
              : null,
        prompt:
          typeof image.prompt === "string"
            ? image.prompt.slice(0, 700)
            : null,
        promptDebug: {
          finalPrompt:
            typeof promptDebug.finalPrompt === "string"
              ? promptDebug.finalPrompt.slice(0, 1500)
              : null,
          // P0.4 — expose le negative final et les métadonnées runtime.
          finalNegativePrompt:
            typeof promptDebug.finalNegativePrompt === "string"
              ? promptDebug.finalNegativePrompt.slice(0, 1000)
              : null,
          promptSource: typeof promptDebug.promptSource === "string" ? promptDebug.promptSource : null,
          usedPacket: promptDebug.usedPacket === true,
          packetVersion: typeof promptDebug.packetVersion === "string" ? promptDebug.packetVersion : null,
          provider: typeof promptDebug.provider === "string" ? promptDebug.provider : null,
          model: typeof promptDebug.model === "string" ? promptDebug.model : null,
          referencePolicy:
            typeof promptDebug.referencePolicy === "string" ? promptDebug.referencePolicy : null,
          width: typeof promptDebug.width === "number" ? promptDebug.width : null,
          height: typeof promptDebug.height === "number" ? promptDebug.height : null,
          refsCount: typeof promptDebug.refsCount === "number" ? promptDebug.refsCount : null,
          lorasCount: typeof promptDebug.lorasCount === "number" ? promptDebug.lorasCount : null,
          seed: typeof promptDebug.seed === "number" ? promptDebug.seed : null,
          origin: typeof promptDebug.origin === "string" ? promptDebug.origin : null,
          requestedAt: typeof promptDebug.requestedAt === "string" ? promptDebug.requestedAt : null,
          retryMode: typeof promptDebug.retryMode === "string" ? promptDebug.retryMode : null,
          retryAttemptIndex:
            typeof promptDebug.retryAttemptIndex === "number" ? promptDebug.retryAttemptIndex : null,
          promptWarnings: Array.isArray(promptDebug.warnings)
            ? (promptDebug.warnings as string[])
            : Array.isArray(promptDebug.promptWarnings)
              ? (promptDebug.promptWarnings as string[])
              : [],
        },
        // P0.4 — packet canonique brut + validation + reroll plans pour la review UI
        canonicalPacket: canonicalPacket
          ? {
              packetVersion:
                typeof canonicalPacket.packetVersion === "string" ? canonicalPacket.packetVersion : null,
              imageIntentType:
                typeof canonicalPacket.imageIntentType === "string"
                  ? canonicalPacket.imageIntentType
                  : null,
              dominantSubjectKind:
                typeof canonicalPacket.dominantSubjectKind === "string"
                  ? canonicalPacket.dominantSubjectKind
                  : null,
              heroPresenceMode:
                typeof canonicalPacket.heroPresenceMode === "string"
                  ? canonicalPacket.heroPresenceMode
                  : null,
              contentRating:
                typeof canonicalPacket.contentRating === "string"
                  ? canonicalPacket.contentRating
                  : null,
              finalEnglishStructuredPrompt:
                typeof canonicalPacket.finalEnglishStructuredPrompt === "string"
                  ? (canonicalPacket.finalEnglishStructuredPrompt as string).slice(0, 1500)
                  : null,
              negativePromptEnglish:
                typeof canonicalPacket.negativePromptEnglish === "string"
                  ? (canonicalPacket.negativePromptEnglish as string).slice(0, 1000)
                  : null,
              modelRoutingDecision:
                canonicalPacket.modelRoutingDecision &&
                typeof canonicalPacket.modelRoutingDecision === "object"
                  ? (canonicalPacket.modelRoutingDecision as Record<string, unknown>)
                  : null,
              providerPayload:
                canonicalPacket.providerPayload &&
                typeof canonicalPacket.providerPayload === "object"
                  ? (canonicalPacket.providerPayload as Record<string, unknown>)
                  : null,
              buildWarnings: Array.isArray(canonicalPacket.buildWarnings)
                ? (canonicalPacket.buildWarnings as string[])
                : [],
            }
          : null,
        canonicalPacketValidation,
        packetRerollPlans: packetRerollPlans.slice(-5),
        referencePolicy:
          typeof generationLog.referencePolicy === "string"
            ? generationLog.referencePolicy
            : typeof falStrategy.referencePolicy === "string"
              ? falStrategy.referencePolicy
              : null,
        panelCategory:
          typeof generationLog.panelCategory === "string"
            ? generationLog.panelCategory
            : typeof falStrategy.panelCategory === "string"
              ? falStrategy.panelCategory
              : null,
        sceneComplexityScore:
          typeof generationLog.sceneComplexityScore === "number"
            ? generationLog.sceneComplexityScore
            : typeof falStrategy.sceneComplexityScore === "number"
              ? falStrategy.sceneComplexityScore
              : null,
        environmentCritical:
          falStrategy.environmentCritical === true,
        continuityCritical:
          falStrategy.continuityCritical === true,
        releaseScore: typeof qualityScores.releaseScore === "number" ? qualityScores.releaseScore : image.consistencyScore ?? null,
        backgroundPresenceScore:
          typeof qualityScores.backgroundPresenceScore === "number" ? qualityScores.backgroundPresenceScore : null,
        interactionScore:
          typeof qualityScores.interactionScore === "number" ? qualityScores.interactionScore : null,
        styleConsistencyScore:
          typeof qualityScores.styleConsistencyScore === "number" ? qualityScores.styleConsistencyScore : null,
        visionScore:
          typeof qualityScores.visionScore === "number" ? qualityScores.visionScore : null,
        visionEnabled: visionAnalysis.enabled === true,
        visionFindings:
          Array.isArray(visionAnalysis.findings)
            ? visionAnalysis.findings
            : [],
        rerollCount: typeof meta.rerollCount === "number" ? meta.rerollCount : 0,
        rerollKind: typeof meta.rerollKind === "string" ? meta.rerollKind : null,
        scenePass: typeof meta.scenePass === "string" ? meta.scenePass : null,
        imageSize: typeof generationLog.imageSize === "string" ? generationLog.imageSize : null,
        issues:
          Array.isArray(validationDetails.issues)
            ? validationDetails.issues
            : [],
        traces: image.falTraces.map((trace) => ({
          id: trace.id,
          status: trace.status,
          mode: trace.mode,
          provider: trace.provider,
          model: trace.model,
          requestId: trace.requestId,
          jobId: trace.jobId,
          refsUsed: Array.isArray(trace.refsUsed) ? trace.refsUsed : [],
          lorasUsed: Array.isArray(trace.lorasUsed) ? trace.lorasUsed : [],
          timings:
            trace.timings && typeof trace.timings === "object" && !Array.isArray(trace.timings)
              ? trace.timings
              : null,
          requestPayload:
            trace.requestPayload && typeof trace.requestPayload === "object" && !Array.isArray(trace.requestPayload)
              ? trace.requestPayload
              : null,
        })),
      };
    }),
  );

  // P0.8 : un chapitre flaggé "ready_for_render" sans `narrativeCommitId`
  // indique un narrative-pass crashé au milieu (Tx A OK mais Tx B ou D
  // jamais committée sur un schéma déjà migré). On remonte l'info au client
  // pour qu'il puisse afficher un état "à régénérer" plutôt qu'un chapitre
  // incomplet présenté comme prêt.
  const chapterNarrativeCommitId = (chapter as { narrativeCommitId?: string | null }).narrativeCommitId ?? null;
  const isStaleReady =
    chapter.status === "ready_for_render" && chapterNarrativeCommitId === null;

  return NextResponse.json({
    chapter,
    isStaleReady,
    narrativeCommitId: chapterNarrativeCommitId,
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
      degradedModes:
        Array.isArray(outlineRecord.degradedModes)
          ? outlineRecord.degradedModes
          : Array.isArray(scriptRecord.degradedModes)
            ? scriptRecord.degradedModes
            : [],
      outline:
        outlineRecord.generationDiagnostics && typeof outlineRecord.generationDiagnostics === "object"
          ? outlineRecord.generationDiagnostics
          : null,
      dialogue:
        scriptRecord.generationDiagnostics && typeof scriptRecord.generationDiagnostics === "object"
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
    return validationError("Le statut chapitre ne peut plus être modifié via l'endpoint legacy. Utilise le workflow Chapter Studio.");
  }

  const data: Prisma.ChapterUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.cliffhanger !== undefined) data.cliffhanger = body.cliffhanger;
  if (body.userIntent !== undefined) data.userIntent = body.userIntent;
  if (body.storyboard !== undefined) data.storyboard = body.storyboard as Prisma.InputJsonValue;
  if (body.script !== undefined) data.script = body.script as Prisma.InputJsonValue;
  if (body.outline !== undefined) data.outline = body.outline as Prisma.InputJsonValue;

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
      prisma.chapter.update({ where: { id: c.id }, data: { chapterNumber: i + 1 } })
    )
  );

  return NextResponse.json({ success: true, deletedId: chapterId });
}
