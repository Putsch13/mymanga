import { NextResponse } from "next/server";
import {
  approvedOutlineSchema,
  PREMIUM_PANEL_RANGE,
  buildDialogueContractFromBlueprints,
  isPipelineV3PremiumOnlyEnabled,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";

import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";
import {
  buildChapterStructuredRuntimePrismaFields,
  patchChapterStudioSnapshot,
  readChapterStudioSnapshotFromOutline,
} from "@/lib/chapter-studio";
import { buildPremiumChapterContractFromApprovedOutline } from "@/lib/premium-chapter-contract";
import { premiumCharacterStudioSelect } from "@/lib/premium-character-studio-select";

import {
  buildPersistedCharacterSelection,
  validateCastContractStrict,
} from "./_helpers/build-character-selection";
import { hydrateResolvedProductionPlan } from "./_helpers/hydrate-blueprints";
import { annotatePremiumMetaWithLaunchStatus } from "./_helpers/launch-blocked-meta";
import { resolveHeroAndCast } from "./_helpers/resolve-hero-and-cast";
import { resolveProductionContract } from "./_helpers/resolve-production-contract";
import { asRecord } from "./_helpers/utils";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { primaryGenre: true, tone: true, format: true },
  });
  const projectCharacters = await prisma.character.findMany({
    where: { projectId },
    select: premiumCharacterStudioSelect,
  });
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const charRefsForLabels = projectCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null as string | null,
    roleType: c.roleType,
  }));

  const body = await req.json();
  const approvedOutline = approvedOutlineSchema.parse(body.approvedOutline);

  const heroResult = resolveHeroAndCast({
    approvedOutline,
    chapterOutline: chapter.outline,
    chapterId,
    projectId,
    premiumOnly,
    projectCharacters,
    charRefsForLabels,
  });
  if (!heroResult.ok) return heroResult.response;
  const { selection } = heroResult;

  const heroPremiumMeta: Record<string, unknown> = {
    heroCharacterId: selection.heroCharacterId,
    snapshotHeroCharacterId: selection.snapshotHeroCharacterId,
    usedFallbackHeroCharacterId: selection.usedFallbackHeroCharacterId,
  };

  let studioSnapshotForContract = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
  });

  if (premiumOnly && studioSnapshotForContract.data.characterSelection) {
    studioSnapshotForContract = {
      ...studioSnapshotForContract,
      data: {
        ...studioSnapshotForContract.data,
        characterSelection: {
          ...studioSnapshotForContract.data.characterSelection,
          ...(selection.heroCharacterId
            ? { heroCharacterId: selection.heroCharacterId }
            : {}),
          ...(selection.secondaryHeroCharacterId
            ? { secondaryHeroCharacterId: selection.secondaryHeroCharacterId }
            : {}),
          activeCharacterIds: selection.resolvedActiveCharacterIds,
          coreCastCharacterIds: selection.coreCastFiltered,
          lockedCharacterIds: selection.lockedFiltered,
          speakingCharacterIds: selection.speakingFiltered,
          evolvingCharacterIds: selection.evolvingFiltered,
          antagonistCharacterIds: selection.antagonistFiltered,
          recurringNpcIds: selection.recurringNpcFiltered,
        },
      },
    };
  }

  // P2.1 — on transmet le `minimumImages` réel du chapitre au builder premium.
  // Fallback = minimum produit (70), jamais la cible 72.
  const chapterMinimumImages =
    typeof (chapter as { minimumImages?: number | null }).minimumImages === "number"
    && (chapter as { minimumImages?: number | null }).minimumImages! > 0
      ? (chapter as { minimumImages: number }).minimumImages
      : PREMIUM_PANEL_RANGE.min;

  const projectFormat =
    typeof project?.format === "string"
    && project.format.toLowerCase() === "webtoon"
      ? ("webtoon" as const)
      : ("manga" as const);

  const rebuiltContract = await buildPremiumChapterContractFromApprovedOutline({
    approvedOutline,
    chapterId,
    projectId,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    projectFormat,
    heroCharacterId: selection.heroCharacterId,
    projectGenre: project?.primaryGenre ?? null,
    projectTone: project?.tone ?? null,
    minimumPanels: chapterMinimumImages,
    studioSnapshot: studioSnapshotForContract,
    secondaryHeroCharacterId: selection.secondaryHeroCharacterId,
  });

  const { productionOutline: resolvedProductionOutline, productionPlan: rawResolvedPlan, premiumMeta } =
    resolveProductionContract({
      rebuiltContract,
      approvedOutline,
      providedProductionOutline: body.productionOutline,
      providedProductionPlan: body.productionPlan,
      heroPremiumMeta,
      chapterId,
    });

  const resolvedProductionPlan = hydrateResolvedProductionPlan({
    resolvedProductionPlan: rawResolvedPlan,
    studioSnapshotForContract,
    projectCharacters,
    visualWorldContract: rebuiltContract.visualWorldContract,
    secondaryHeroCharacterId: selection.secondaryHeroCharacterId,
    premiumMeta,
  });

  annotatePremiumMetaWithLaunchStatus({
    resolvedProductionPlan,
    premiumOnly,
    premiumMeta,
    chapterId,
    projectId,
  });

  console.info(
    `[approved-outline] PATCH chapterId=${chapterId} projectId=${projectId} `
    + `beatCount=${approvedOutline.beats.length} `
    + `panelBlueprintsCount=${premiumMeta.panelBlueprintsCount ?? 0} `
    + `premiumReadinessScore=${premiumMeta.premiumReadinessScore ?? "n/a"} `
    + `launchBlocked=${Boolean(premiumMeta.launchBlocked)} `
    + `heroCenterRatio=${premiumMeta.heroCenterRatio ?? "n/a"}`,
  );

  const persistedCharacterSelection = buildPersistedCharacterSelection(selection);

  const castContractError = validateCastContractStrict({
    chapterId,
    selection: persistedCharacterSelection,
    projectCharacters,
  });
  if (castContractError) return castContractError;

  console.info(
    `[approved-outline] persisting_character_selection chapterId=${chapterId} `
    + `heroCharacterId=${persistedCharacterSelection.heroCharacterId ?? "none"} `
    + `activeCharacterIds=${persistedCharacterSelection.activeCharacterIds.length} `
    + `usedFallback=${selection.usedFallbackHeroCharacterId}`,
  );

  const characterNameById = Object.fromEntries(
    projectCharacters.map((c) => [c.id, c.name]),
  );
  const planBlueprints = Array.isArray(resolvedProductionPlan.panelBlueprints)
    ? (resolvedProductionPlan.panelBlueprints as PanelBlueprintPremium[])
    : [];
  const chapterDialogueContract = buildDialogueContractFromBlueprints(
    chapterId,
    planBlueprints,
    characterNameById,
  );

  const studioSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {
      editorialOutline: {
        summary: approvedOutline.summary,
        validationNotes: [],
        beats: approvedOutline.beats.map((beat, index) => ({
          beatId: beat.id,
          label: `Bloc ${index + 1}`,
          summary: beat.summary,
          narrativePurpose: beat.pageRole,
          dramaticShift: beat.turn,
          involvedCharacters: beat.characters,
        })),
      },
      productionOutline: resolvedProductionOutline,
      productionPlan: resolvedProductionPlan,
      characterSelection: persistedCharacterSelection,
      visualWorldContract: rebuiltContract.visualWorldContract,
      chapterDialogueContract,
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      currentStep: "production_plan",
      transitionReason: "premium_approved_outline_saved",
    },
  );

  const existingOutline = asRecord(chapter.outline);
  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      ...buildChapterStructuredRuntimePrismaFields({
        snapshot: studioSnapshot,
        minimumImages:
          studioSnapshot.data.readinessReport?.imageCounts.minimumImages
          ?? studioSnapshot.data.productionPlan?.minimumImages
          ?? PREMIUM_PANEL_RANGE.min,
        generatedImages: chapter.generatedImages ?? 0,
        acceptedImages: chapter.acceptedImages ?? 0,
        rejectedImages: chapter.rejectedImages ?? 0,
        missingImages:
          chapter.missingImages
          ?? (studioSnapshot.data.readinessReport?.imageCounts.minimumImages
            ?? PREMIUM_PANEL_RANGE.min),
        criticalPanelsCount: chapter.criticalPanelsCount ?? 0,
        criticalPanelsBlocked: chapter.criticalPanelsBlocked ?? 0,
        criticalPanelsMissingQa: chapter.criticalPanelsMissingQa ?? 0,
        reviewBlockedReason: chapter.reviewBlockedReason,
      }),
      outline: ({
        ...existingOutline,
        approvedOutline,
        studio: studioSnapshot,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    chapterId: updated.id,
    approvedOutline,
    premiumMeta,
  });
}
