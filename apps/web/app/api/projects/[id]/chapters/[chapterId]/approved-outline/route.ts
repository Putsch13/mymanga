import { NextResponse } from "next/server";
import {
  approvedOutlineSchema,
  PREMIUM_PANEL_RANGE,
  productionOutlineSchema,
  productionPlanSchema,
  isHeroRole,
  isPipelineV3PremiumOnlyEnabled,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  type PanelBlueprintPremium,
  type ProductionOutline,
  type ProductionPlan,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";
import { buildChapterStructuredRuntimePrismaFields, patchChapterStudioSnapshot, readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import {
  buildPremiumChapterContractFromApprovedOutline,
  reconcileIncomingPremiumContract,
} from "@/lib/premium-chapter-contract";
import { premiumCharacterStudioSelect, toCharacterRowsForDnaHydration } from "@/lib/premium-character-studio-select";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  // Charger le projet pour les métadonnées premium (genre, tone, hero)
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { primaryGenre: true, tone: true, format: true },
  });
  const projectCharacters = await prisma.character.findMany({
    where: { projectId },
    select: premiumCharacterStudioSelect,
  });
  const body = await req.json();
  const approvedOutline = approvedOutlineSchema.parse(body.approvedOutline);
  const existingOutline = asRecord(chapter.outline);
  const studio = asRecord(existingOutline.studio);
  const studioData = asRecord(studio.data);
  const characterSelection = asRecord(studioData.characterSelection);
  const snapshotHeroCharacterId =
    typeof characterSelection.heroCharacterId === "string" && characterSelection.heroCharacterId.length > 0
      ? characterSelection.heroCharacterId
      : null;

  const snapshotSecondaryHeroCharacterId =
    typeof characterSelection.secondaryHeroCharacterId === "string"
    && characterSelection.secondaryHeroCharacterId.trim().length > 0
      ? characterSelection.secondaryHeroCharacterId.trim()
      : null;

  if (!snapshotHeroCharacterId) {
    console.warn(`[approved-outline] missing chapter heroCharacterId chapterId=${chapterId}`);
  }

  const activeCharacterIds = Array.isArray(characterSelection.activeCharacterIds)
    ? characterSelection.activeCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  if (
    snapshotHeroCharacterId
    && activeCharacterIds.length > 0
    && !activeCharacterIds.includes(snapshotHeroCharacterId)
  ) {
    console.error(
      `[approved-outline] HERO_NOT_IN_ACTIVE_CAST chapterId=${chapterId} projectId=${projectId} ` +
        `heroCharacterId=${snapshotHeroCharacterId} activeCharacterIds=${JSON.stringify(activeCharacterIds)} ` +
        "— le snapshot chapitre désigne un héros absent du cast actif ; corrigez la sélection studio.",
    );
  }

  const fallbackHeroCharacterId =
    projectCharacters.find((c) => isHeroRole(c.roleType))?.id ?? null;
  const heroCharacterId = snapshotHeroCharacterId ?? fallbackHeroCharacterId;
  const usedFallbackHeroCharacterId =
    snapshotHeroCharacterId === null
    && fallbackHeroCharacterId !== null
    && heroCharacterId === fallbackHeroCharacterId;

  const heroPremiumMeta: Record<string, unknown> = {
    heroCharacterId,
    snapshotHeroCharacterId,
    usedFallbackHeroCharacterId,
  };

  const providedProductionOutline = body.productionOutline;
  const providedProductionPlan = body.productionPlan;

  // P2.1 — on transmet le `minimumImages` réel du chapitre au builder premium.
  // Fallback = minimum produit (70), jamais la cible 72.
  const chapterMinimumImages = typeof (chapter as { minimumImages?: number | null }).minimumImages === "number"
    && (chapter as { minimumImages?: number | null }).minimumImages! > 0
    ? (chapter as { minimumImages: number }).minimumImages
    : PREMIUM_PANEL_RANGE.min;

  // Toujours reconstruire le contrat premium côté serveur pour validation
  const projectFormat =
    typeof project?.format === "string" && project.format.toLowerCase() === "webtoon"
      ? ("webtoon" as const)
      : ("manga" as const);

  const studioSnapshotForContract = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
  });

  const rebuiltContract = await buildPremiumChapterContractFromApprovedOutline({
    approvedOutline,
    chapterId,
    projectId,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    projectFormat,
    heroCharacterId,
    projectGenre: project?.primaryGenre ?? null,
    projectTone: project?.tone ?? null,
    minimumPanels: chapterMinimumImages,
    studioSnapshot: studioSnapshotForContract,
    secondaryHeroCharacterId: snapshotSecondaryHeroCharacterId,
  });

  // Si productionOutline + productionPlan sont fournis (depuis generate/page.tsx), les persister après réconciliation.
  let resolvedProductionOutline: ProductionOutline = rebuiltContract.productionOutline;
  let resolvedProductionPlan: ProductionPlan = rebuiltContract.productionPlan;
  let premiumMeta: unknown;

  if (providedProductionOutline && providedProductionPlan) {
    // Contrat fourni par le client — valider les schémas puis réconcilier avec le serveur
    const parsedOutline = productionOutlineSchema.safeParse(providedProductionOutline);
    const parsedPlan = productionPlanSchema.safeParse(providedProductionPlan);

    if (parsedOutline.success && parsedPlan.success) {
      // Réconcilier : le serveur gagne sur les champs premium visuels
      const reconciled = reconcileIncomingPremiumContract({
        approvedOutline,
        incomingProductionOutline: parsedOutline.data,
        incomingProductionPlan: parsedPlan.data,
        rebuiltContract,
      });
      resolvedProductionOutline = reconciled.productionOutline;
      resolvedProductionPlan = reconciled.productionPlan;
      const reconciledPlan = reconciled.productionPlan;
      premiumMeta = {
        source: reconciled.productionOutline.source,
        premiumReadinessScore: reconciledPlan.premiumReadinessScore,
        panelBlueprintsCount: Array.isArray(reconciledPlan.panelBlueprints) ? reconciledPlan.panelBlueprints.length : 0,
        heroCenterRatio: reconciledPlan.heroCenterRatio,
        focusDistribution: reconciledPlan.focusDistribution,
        propCoverage: reconciledPlan.propCoverage,
        enemyCoverage: reconciledPlan.enemyCoverage,
        npcCoverage: reconciledPlan.npcCoverage,
        cutawayCoverage: reconciledPlan.cutawayCoverage,
        dialogueAnchorCoverage: reconciledPlan.dialogueAnchorCoverage,
        reconciled: true,
        ...heroPremiumMeta,
      };
      console.info(
        `[approved-outline] reconciled chapterId=${chapterId} ` +
        `incomingBeats=${parsedOutline.data.beats.length} rebuiltBeats=${rebuiltContract.productionOutline.beats.length} ` +
        `panelBlueprintsCount=${Array.isArray(reconciledPlan.panelBlueprints) ? reconciledPlan.panelBlueprints.length : 0} ` +
        `premiumReadinessScore=${reconciledPlan.premiumReadinessScore ?? "n/a"}`,
      );
    } else {
      // Payload client invalide — utiliser directement le contrat serveur
      resolvedProductionOutline = rebuiltContract.productionOutline;
      resolvedProductionPlan = rebuiltContract.productionPlan;
      premiumMeta = {
        source: rebuiltContract.productionOutline.source,
        premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
        panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
        heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
        focusDistribution: rebuiltContract.coverage.focusDistribution,
        propCoverage: rebuiltContract.coverage.propCoverage,
        enemyCoverage: rebuiltContract.coverage.enemyCoverage,
        npcCoverage: rebuiltContract.coverage.npcCoverage,
        cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
        dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
        fallback: "server_rebuilt_invalid_client",
        ...heroPremiumMeta,
      };
    }
  } else {
    // Pas de contrat client — utiliser directement le contrat serveur
    resolvedProductionOutline = rebuiltContract.productionOutline;
    resolvedProductionPlan = rebuiltContract.productionPlan;
    premiumMeta = {
      source: rebuiltContract.productionOutline.source,
      premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
      panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
      heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
      focusDistribution: rebuiltContract.coverage.focusDistribution,
      propCoverage: rebuiltContract.coverage.propCoverage,
      enemyCoverage: rebuiltContract.coverage.enemyCoverage,
      npcCoverage: rebuiltContract.coverage.npcCoverage,
      cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
      dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
      ...heroPremiumMeta,
    };
  }

  // P0 — Alignement estimate/launch : ré-hydrater characterVisualDna sur le plan
  // résolu (réconciliation client peut livrer des blueprints sans DNA complet).
  {
    const planRecord = asRecord(resolvedProductionPlan);
    const rawBps = Array.isArray(planRecord.panelBlueprints)
      ? (planRecord.panelBlueprints as PanelBlueprintPremium[])
      : [];
    if (rawBps.length > 0) {
      const canons = studioSnapshotForContract.data.characterCanons ?? [];
      const characterCanonsById: Record<string, import("@manga-ai-studio/core").CharacterCanon> = {};
      for (const c of canons) {
        characterCanonsById[c.characterId] = c;
      }
      const hydratedBps = (() => {
        let bps = hydrateBlueprintsWithCharacterDna({
          blueprints: rawBps,
          characters: toCharacterRowsForDnaHydration(projectCharacters),
          characterCanonsById: Object.keys(characterCanonsById).length > 0 ? characterCanonsById : undefined,
          characterCanons: canons.length > 0 ? canons : null,
          strict: isPipelineV3PremiumOnlyEnabled(),
          ...(snapshotSecondaryHeroCharacterId
            ? { coProtagonistCharacterIds: [snapshotSecondaryHeroCharacterId] as const }
            : {}),
        });
        if (rebuiltContract.visualWorldContract) {
          const strictVw = isPipelineV3PremiumOnlyEnabled();
          bps = hydrateBlueprintsWithEnvironmentDna({
            blueprints: bps,
            visualWorld: rebuiltContract.visualWorldContract,
            strict: strictVw,
          });
          bps = hydrateBlueprintsWithPropDna({
            blueprints: bps,
            visualWorld: rebuiltContract.visualWorldContract,
            strict: strictVw,
          });
          bps = hydrateBlueprintsWithNpcDna({
            blueprints: bps,
            visualWorld: rebuiltContract.visualWorldContract,
            strict: strictVw,
          });
        }
        return bps;
      })();
      resolvedProductionPlan = {
        ...planRecord,
        panelBlueprints: hydratedBps,
      } as ProductionPlan;
      if (premiumMeta && typeof premiumMeta === "object") {
        (premiumMeta as Record<string, unknown>).panelBlueprintsCount = hydratedBps.length;
      }
    }
  }

  // P0.5 — Option B : marquer explicitement le snapshot comme `launchBlocked`
  // quand le contrat reconstruit côté serveur reste incomplet (panelBlueprints
  // < minimumImages). On ne refuse pas 422 pour éviter de casser les flux
  // existants (éditions de beats, approbations partielles, etc.), mais on
  // remonte un warning fort dans `premiumMeta` pour que le front puisse
  // afficher une bannière "plan incomplet" au lieu de laisser le user
  // découvrir le problème au launch.
  const resolvedPlanRecord = asRecord(resolvedProductionPlan);
  const resolvedPanelBlueprints = Array.isArray(resolvedPlanRecord.panelBlueprints)
    ? (resolvedPlanRecord.panelBlueprints as PanelBlueprintPremium[])
    : [];
  const resolvedBlueprintCount = resolvedPanelBlueprints.length;
  const resolvedMinimumImages =
    typeof resolvedPlanRecord.minimumImages === "number" && resolvedPlanRecord.minimumImages > 0
      ? (resolvedPlanRecord.minimumImages as number)
      : PREMIUM_PANEL_RANGE.min;

  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const continuityPreflights = premiumOnly
    ? computePanelContinuityPreflights(resolvedPanelBlueprints, {
        strictEnvironmentLocationBinding: true,
        strictCharacterDnaBinding: true,
        strictPropVisualBinding: true,
      })
    : [];
  const continuityBlockers = premiumOnly
    ? continuityPreflightBlockingReasons(continuityPreflights)
    : [];

  (premiumMeta as Record<string, unknown>).continuityPreflight = {
    ok: continuityBlockers.length === 0,
    blockers: continuityBlockers,
    panelCount: continuityPreflights.length,
  };

  const launchBlockedIncomplete = resolvedBlueprintCount < resolvedMinimumImages;
  const launchBlockedContinuity = premiumOnly && continuityBlockers.length > 0;
  const launchBlocked = launchBlockedIncomplete || launchBlockedContinuity;

  const launchBlockedReason = !launchBlocked
    ? null
    : launchBlockedIncomplete && launchBlockedContinuity
      ? "incomplete_plan_and_continuity_preflight"
      : launchBlockedContinuity
        ? "continuity_preflight"
        : resolvedBlueprintCount === 0
          ? "missing_blueprints"
          : "incomplete_plan";

  if (launchBlocked) {
    (premiumMeta as Record<string, unknown>).launchBlocked = true;
    (premiumMeta as Record<string, unknown>).launchBlockedReason = launchBlockedReason;
    (premiumMeta as Record<string, unknown>).minimumImages = resolvedMinimumImages;
    console.warn(
      `[approved-outline] launch_blocked chapterId=${chapterId} projectId=${projectId} ` +
      `reason=${launchBlockedReason} ` +
      `panelBlueprintsCount=${resolvedBlueprintCount} minimumImages=${resolvedMinimumImages} ` +
      `continuityBlockers=${continuityBlockers.length} ` +
      `— le snapshot est persisté mais le studio doit bloquer le launch.`,
    );
  }

  console.info(
    `[approved-outline] PATCH chapterId=${chapterId} projectId=${projectId} ` +
    `beatCount=${approvedOutline.beats.length} ` +
    `panelBlueprintsCount=${(premiumMeta as Record<string, unknown>).panelBlueprintsCount ?? 0} ` +
    `premiumReadinessScore=${(premiumMeta as Record<string, unknown>).premiumReadinessScore ?? "n/a"} ` +
    `launchBlocked=${launchBlocked} continuity_ok=${continuityBlockers.length === 0} ` +
    `heroCenterRatio=${(premiumMeta as Record<string, unknown>).heroCenterRatio ?? "n/a"}`,
  );

  // ─── Construire characterSelection canonique pour persistance ───────────────
  // Si le héros a été déterminé (snapshot ou fallback), on le persiste pour que
  // les routes de lancement le retrouvent sans fallback à chaque fois.
  const resolvedActiveCharacterIds = activeCharacterIds.length > 0
    ? activeCharacterIds
    : [...new Set(approvedOutline.beats.flatMap((b) => b.characters ?? []))].filter(Boolean);

  const persistedCharacterSelection = {
    heroCharacterId: heroCharacterId ?? undefined,
    secondaryHeroCharacterId:
      typeof characterSelection.secondaryHeroCharacterId === "string"
      && characterSelection.secondaryHeroCharacterId.length > 0
        ? characterSelection.secondaryHeroCharacterId
        : undefined,
    coreCastCharacterIds: Array.isArray(characterSelection.coreCastCharacterIds)
      ? characterSelection.coreCastCharacterIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    activeCharacterIds: resolvedActiveCharacterIds,
    lockedCharacterIds: Array.isArray(characterSelection.lockedCharacterIds)
      ? characterSelection.lockedCharacterIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    speakingCharacterIds: Array.isArray(characterSelection.speakingCharacterIds)
      ? characterSelection.speakingCharacterIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    evolvingCharacterIds: Array.isArray(characterSelection.evolvingCharacterIds)
      ? characterSelection.evolvingCharacterIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    antagonistCharacterIds: Array.isArray(characterSelection.antagonistCharacterIds)
      ? characterSelection.antagonistCharacterIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    recurringNpcIds: Array.isArray(characterSelection.recurringNpcIds)
      ? characterSelection.recurringNpcIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
  };

  console.info(
    `[approved-outline] persisting_character_selection chapterId=${chapterId} ` +
    `heroCharacterId=${persistedCharacterSelection.heroCharacterId ?? "none"} ` +
    `activeCharacterIds=${persistedCharacterSelection.activeCharacterIds.length} ` +
    `usedFallback=${usedFallbackHeroCharacterId}`,
  );

  const studioSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {
      editorialOutline: {
        summary: approvedOutline.summary,
        validationNotes: [],
        // Tous les beats — plus de slice(0, 5)
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

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      ...buildChapterStructuredRuntimePrismaFields({
        snapshot: studioSnapshot,
        minimumImages: studioSnapshot.data.readinessReport?.imageCounts.minimumImages ?? studioSnapshot.data.productionPlan?.minimumImages ?? PREMIUM_PANEL_RANGE.min,
        generatedImages: chapter.generatedImages ?? 0,
        acceptedImages: chapter.acceptedImages ?? 0,
        rejectedImages: chapter.rejectedImages ?? 0,
        missingImages: chapter.missingImages ?? (studioSnapshot.data.readinessReport?.imageCounts.minimumImages ?? PREMIUM_PANEL_RANGE.min),
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
