import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildChapterReadinessReport,
  chapterStudioDataSchema,
  chapterStudioStepSchema,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { getOwnedChapter } from "@/lib/ownership";
import {
  buildCharacterCanonFromCharacter,
  buildChapterStructuredRuntimePrismaFields,
  buildLocationCanonFromLocation,
  buildProjectCanonFromProject,
  patchChapterStudioSnapshot,
  readChapterStudioSnapshotFromOutline,
} from "@/lib/chapter-studio";
import { mergePremiumProductionPlan } from "@/lib/premium-chapter-contract";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const patchSchema = z.object({
  data: chapterStudioDataSchema.partial(),
  currentStep: chapterStudioStepSchema.optional(),
  transitionReason: z.string().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      scenes: {
        include: {
          images: {
            select: { status: true },
          },
        },
      },
      project: {
        include: {
          settings: true,
          stylePacks: { orderBy: { version: "desc" }, take: 1 },
          storyBible: true,
          characters: {
            include: {
              visualRefs: {
                orderBy: { createdAt: "desc" },
                include: { mediaAsset: true },
              },
              // Nécessaire pour exposer completenessScore dans characterCanons
              // et alimenter le warning readiness "canonPack incomplet".
              canonPack: {
                select: { completenessScore: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          locations: {
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (!chapter) return notFound();

  const projectCanon = buildProjectCanonFromProject({
    visualStyle: chapter.project.visualStyle,
    tone: chapter.project.tone,
    settings: chapter.project.settings,
    bible: chapter.project.storyBible
      ? {
          summary: chapter.project.storyBible.summary,
          themes: chapter.project.storyBible.themes,
          worldRules: chapter.project.storyBible.worldRules,
          lockedCanon: chapter.project.storyBible.lockedCanon,
        }
      : null,
    stylePack: chapter.project.stylePacks[0]
      ? {
          renderFamily: chapter.project.stylePacks[0].renderFamily,
          lineWeight: chapter.project.stylePacks[0].lineWeight,
          shadingMode: chapter.project.stylePacks[0].shadingMode,
          contrastProfile: chapter.project.stylePacks[0].contrastProfile,
          anatomyBias: chapter.project.stylePacks[0].anatomyBias,
          backgroundDensity: chapter.project.stylePacks[0].backgroundDensity,
          cameraLanguage: chapter.project.stylePacks[0].cameraLanguage,
          negativeConstraints: chapter.project.stylePacks[0].negativeConstraints,
        }
      : null,
  });
  const characterCanons = chapter.project.characters.map((character) =>
    buildCharacterCanonFromCharacter({
      id: character.id,
      name: character.name,
      roleType: character.roleType,
      appearance: character.appearance,
      hairColor: character.hairColor,
      eyeColor: character.eyeColor,
      outfitDefault: character.outfitDefault,
      visualProfile: character.visualProfile,
      wardrobeProfile: character.wardrobeProfile,
      stableVisualDNA: character.stableVisualDNA,
      canonLocked: character.canonLocked,
      visualRefs: character.visualRefs,
      canonPack: character.canonPack ?? null,
    }),
  );
  const locationCanons = chapter.project.locations.map((location) =>
    buildLocationCanonFromLocation({
      id: location.id,
      name: location.name,
      type: location.type,
      description: location.description,
      metadata: location.metadata,
    }),
  );

  const hydratedSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {
      projectCanon,
      characterCanons,
      locationCanons,
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      transitionReason: "hydrate_studio_snapshot",
    },
  );
  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: {
      ...asRecord(chapter.outline),
      studio: hydratedSnapshot,
    },
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
    studioStatus: chapter.studioStatus,
    studioCurrentStep: chapter.studioCurrentStep,
    studioUpdatedAt: chapter.studioUpdatedAt,
    studioAutosaveVersion: chapter.studioAutosaveVersion,
    minimumImages: chapter.minimumImages,
    generatedImages: chapter.generatedImages,
    acceptedImages: chapter.acceptedImages,
    rejectedImages: chapter.rejectedImages,
    missingImages: chapter.missingImages,
    criticalPanelsCount: chapter.criticalPanelsCount,
    criticalPanelsBlocked: chapter.criticalPanelsBlocked,
    criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
    reviewBlockedReason: chapter.reviewBlockedReason,
  });
  const stack = getGenerationStackStatus();
  const allImages = chapter.scenes.flatMap((scene) => scene.images);

  return NextResponse.json({
    project: {
      id: chapter.project.id,
      title: chapter.project.title,
    },
    chapter: {
      id: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.status,
      summary: chapter.summary,
      userIntent: chapter.userIntent,
    },
    snapshot: {
      ...snapshot,
      data: {
        ...snapshot.data,
        readinessReport: snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot),
      },
    },
    generationContext: {
      stack,
      imageStats: {
        total: allImages.length,
        completed: allImages.filter((image) => image.status === "completed").length,
        failed: allImages.filter((image) => image.status === "failed" || image.status === "blocked").length,
        pending: allImages.filter((image) => image.status === "pending" || image.status === "planned").length,
      },
    },
    characterCatalog: chapter.project.characters.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType,
      imageUrl: c.visualRefs?.[0]?.mediaAsset?.publicUrl ?? null,
    })),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  const rawBody = await req.json();
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.error("[studio PATCH] schema validation failed:", JSON.stringify(parsed.error.issues.slice(0, 3)));
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const snapshot = patchChapterStudioSnapshot(chapter.outline, body.data, {
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
    currentStep: body.currentStep,
    transitionReason: body.transitionReason ?? "studio_patch",
  });

  const outlineRecord = asRecord(chapter.outline);

  // Préserver l'approvedOutline existant — ne jamais le régénérer via un builder legacy
  // Si le patch touche des champs premium structurants, le contrat sera recalculé
  // via /approved-outline lors de la prochaine validation explicite.
  const existingApprovedOutline = outlineRecord.approvedOutline;

  // Fusionner le productionPlan en préservant intégralement tous les champs premium.
  // Utilise mergePremiumProductionPlan qui applique PREMIUM_PRODUCTION_PLAN_KEYS.
  const existingStudio = asRecord(outlineRecord.studio);
  const existingStudioData = asRecord(existingStudio.data);
  const existingPP = existingStudioData.productionPlan as Record<string, unknown> | null | undefined;
  const incomingPP = snapshot.data.productionPlan as Record<string, unknown> | null | undefined;

  const mergedProductionPlan = mergePremiumProductionPlan(existingPP, incomingPP);

  const mergedSnapshot = {
    ...snapshot,
    data: {
      ...snapshot.data,
      productionPlan: mergedProductionPlan as never,
    },
  };

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      ...buildChapterStructuredRuntimePrismaFields({
        snapshot: mergedSnapshot,
        minimumImages: mergedSnapshot.data.readinessReport?.imageCounts.minimumImages,
        generatedImages: chapter.generatedImages ?? mergedSnapshot.data.readinessReport?.imageCounts.generatedImages ?? 0,
        acceptedImages: chapter.acceptedImages ?? mergedSnapshot.data.readinessReport?.imageCounts.acceptedImages ?? 0,
        rejectedImages: chapter.rejectedImages ?? mergedSnapshot.data.readinessReport?.imageCounts.rejectedImages ?? 0,
        missingImages: chapter.missingImages ?? mergedSnapshot.data.readinessReport?.imageCounts.missingImages ?? null,
        criticalPanelsCount: chapter.criticalPanelsCount ?? 0,
        criticalPanelsBlocked: chapter.criticalPanelsBlocked ?? 0,
        criticalPanelsMissingQa: chapter.criticalPanelsMissingQa ?? 0,
        reviewBlockedReason: chapter.reviewBlockedReason,
      }),
      title: body.data.intent?.workingTitle ?? chapter.title,
      userIntent: body.data.intent?.shortPitch ?? chapter.userIntent,
      outline: ({
        ...outlineRecord,
        studio: mergedSnapshot,
        ...(existingApprovedOutline ? { approvedOutline: existingApprovedOutline } : {}),
      } as unknown) as Prisma.InputJsonValue,
      summary:
        body.data.editorialOutline?.summary
        ?? body.data.productionOutline?.chapterGoal
        ?? chapter.summary,
      cliffhanger: body.data.productionOutline?.cliffhanger ?? chapter.cliffhanger,
    },
  });

  return NextResponse.json({
    ok: true,
    chapterId: updated.id,
    snapshot: mergedSnapshot,
    approvedOutline: existingApprovedOutline ?? null,
  });
}
