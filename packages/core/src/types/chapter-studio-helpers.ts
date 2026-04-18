/**
 * chapter-studio — helpers (builders, readiness, status, snapshot, legacy bridge).
 *
 * Extraits de `chapter-studio.ts` pour séparer les schémas/types des fonctions
 * pures qui les manipulent. Le fichier `chapter-studio.ts` reste la source
 * de vérité pour les schémas Zod et les types `z.infer`. Ce module consomme
 * ces schémas/types et expose toutes les fonctions utilitaires associées.
 *
 * Aucune cycle d'import : les helpers importent depuis `./chapter-studio`,
 * mais `./chapter-studio` n'importe pas depuis ce fichier. Le `types/index.ts`
 * ré-exporte les deux.
 */

import type { ApprovedChapterOutline } from "./approved-outline";
import {
  chapterImageCountSchema,
  chapterStudioSnapshotSchema,
  productionOutlineSchema,
  productionPlanSchema,
  type ChapterImageCount,
  type ChapterReadinessIssue,
  type ChapterReadinessReport,
  type ChapterStudioData,
  type ChapterStudioSnapshot,
  type ChapterStudioStatus,
  type ChapterStudioStep,
  type EditorialOutline,
  type ProductionOutline,
  type ProductionPlan,
  type ProductionPlanAdjustment,
  type ProductionPlanPage,
} from "./chapter-studio";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sum(numbers: number[]) {
  return numbers.reduce((acc, value) => acc + value, 0);
}

export function buildProductionPlanFromOutline(
  outline: ProductionOutline,
  input?: {
    minimumImages?: number;
    maxPanelsPerPage?: number;
    lockedCharacters?: string[];
  },
): ProductionPlan {
  const minimumImages = Math.max(1, input?.minimumImages ?? 75);
  const maxPanelsPerPage = Math.max(3, input?.maxPanelsPerPage ?? 6);
  const panels = outline.beats.map((beat) => Math.max(1, beat.estimatedPanels));
  const estimatedImages = sum(panels);
  const pages: ProductionPlanPage[] = [];
  let pageNumber = 1;
  let currentPanels = 0;
  let currentBeatIds: string[] = [];
  let currentCriticalCount = 0;

  for (const beat of outline.beats) {
    const beatPanels = Math.max(1, beat.estimatedPanels);
    if (currentPanels > 0 && currentPanels + beatPanels > maxPanelsPerPage) {
      pages.push({
        pageNumber,
        beatIds: currentBeatIds,
        panelCount: currentPanels,
        imageTarget: currentPanels,
        criticalPanelCount: currentCriticalCount,
      });
      pageNumber += 1;
      currentPanels = 0;
      currentBeatIds = [];
      currentCriticalCount = 0;
    }

    currentPanels += beatPanels;
    currentBeatIds.push(beat.beatId);
    if (beat.criticality === "high" || beat.criticality === "critical") {
      currentCriticalCount += 1;
    }
  }

  if (currentPanels > 0) {
    pages.push({
      pageNumber,
      beatIds: currentBeatIds,
      panelCount: currentPanels,
      imageTarget: currentPanels,
      criticalPanelCount: currentCriticalCount,
    });
  }

  const criticalPanels = outline.beats
    .filter((beat) => beat.criticality === "high" || beat.criticality === "critical")
    .map((beat) => beat.beatId);

  const compressionRisks = outline.beats
    .filter((beat) => beat.estimatedPanels <= 2 && beat.indispensabilityScore >= 75)
    .map((beat) => `${beat.beatId}: beat dense avec peu de panels estimés`);

  return enforceMinimumChapterImages(
    {
      pageCount: pages.length,
      pages,
      panelsPerPage: pages.map((page) => page.panelCount),
      estimatedImages,
      targetImages: estimatedImages,
      minimumImages,
      criticalPanels,
      lockedCharacters: input?.lockedCharacters ?? [],
      compressionRisks,
      enrichmentAdjustments: [],
      imageBudgetStatus: estimatedImages < minimumImages ? "under_target" : "on_target",
    },
    outline,
  );
}

export function enforceMinimumChapterImages(plan: ProductionPlan, outline?: ProductionOutline): ProductionPlan {
  if (plan.targetImages >= plan.minimumImages) {
    return productionPlanSchema.parse({
      ...plan,
      imageBudgetStatus: plan.targetImages > plan.minimumImages ? "over_target" : "on_target",
    });
  }

  const missing = plan.minimumImages - plan.targetImages;
  const adjustments: ProductionPlanAdjustment[] = [];
  const candidateBeats = outline?.beats
    ?.slice()
    .sort((a, b) => {
      const scoreA = a.indispensabilityScore + (a.criticality === "critical" ? 15 : a.criticality === "high" ? 8 : 0) - a.redundancyRisk;
      const scoreB = b.indispensabilityScore + (b.criticality === "critical" ? 15 : b.criticality === "high" ? 8 : 0) - b.redundancyRisk;
      return scoreB - scoreA;
    }) ?? [];

  for (let index = 0; index < missing; index += 1) {
    const beat = candidateBeats[index % Math.max(candidateBeats.length, 1)];
    adjustments.push({
      type:
        index % 5 === 0
          ? "establishing_shot"
          : index % 5 === 1
            ? "reaction_shot"
            : index % 5 === 2
              ? "transition_shot"
              : index % 5 === 3
                ? "beat_split"
                : "emotional_extension",
      beatId: beat?.beatId ?? null,
      reason: beat
        ? `Enrichissement narratif du beat ${beat.beatId} pour atteindre le minimum de ${plan.minimumImages} images`
        : `Enrichissement global pour atteindre le minimum de ${plan.minimumImages} images`,
      addedImages: 1,
    });
  }

  return productionPlanSchema.parse({
    ...plan,
    targetImages: plan.targetImages + missing,
    enrichmentAdjustments: [...plan.enrichmentAdjustments, ...adjustments],
    imageBudgetStatus: "on_target",
  });
}

export function normalizeChapterImageCounts(input?: Partial<ChapterImageCount> | null): ChapterImageCount {
  const normalized = chapterImageCountSchema.parse({
    estimatedImages: input?.estimatedImages ?? 0,
    targetImages: input?.targetImages ?? input?.estimatedImages ?? 0,
    minimumImages: input?.minimumImages ?? 75,
    generatedImages: input?.generatedImages ?? 0,
    acceptedImages: input?.acceptedImages ?? 0,
    rejectedImages: input?.rejectedImages ?? 0,
    missingImages: 0,
  });

  return {
    ...normalized,
    missingImages: Math.max(0, normalized.minimumImages - normalized.acceptedImages),
  };
}

export function buildChapterReadinessReport(snapshot: ChapterStudioSnapshot): ChapterReadinessReport {
  const completedSteps: ChapterStudioStep[] = [];
  const blockerItems: ChapterReadinessIssue[] = [];
  const warningItems: ChapterReadinessIssue[] = [];

  const addBlocker = (issue: ChapterReadinessIssue) => {
    blockerItems.push(issue);
  };

  const addWarning = (issue: ChapterReadinessIssue) => {
    warningItems.push(issue);
  };

  if (snapshot.data.intent?.shortPitch && snapshot.data.intent.shortPitch.trim().length >= 5) completedSteps.push("intent");
  else addBlocker({
    id: "missing_intent",
    step: "intent",
    field: "studio-short-pitch",
    message: "Décris ce qui se passe dans ce chapitre (champ Pitch — au moins 5 caractères).",
    ctaLabel: "Remplir le pitch",
    action: "focus_field",
  });

  if (snapshot.data.narrativeContract) completedSteps.push("narrative_contract");
  else addBlocker({
    id: "missing_narrative_contract",
    step: "narrative_contract",
    field: "studio-emotional-goal",
    message: "Le contrat narratif est manquant.",
    ctaLabel: "Renseigner le contrat narratif",
    action: "focus_field",
  });

  if (snapshot.data.characterSelection?.heroCharacterId) completedSteps.push("characters");
  else addBlocker({
    id: "missing_hero_character",
    step: "characters",
    field: "studio-hero-character",
    message: "Le héros principal du chapitre doit être sélectionné.",
    ctaLabel: "Choisir le héros",
    action: "focus_field",
  });

  if (snapshot.data.chapterCanon?.currentLocation) completedSteps.push("canon");
  else addBlocker({
    id: "missing_chapter_location",
    step: "canon",
    field: "studio-location",
    message: "Le canon actif du chapitre doit préciser le décor principal.",
    ctaLabel: "Préciser le décor",
    action: "focus_field",
  });

  const hasEditorialOutline = (snapshot.data.editorialOutline?.beats?.length ?? 0) > 0;
  const productionBeatsCount = snapshot.data.productionOutline?.beats?.length ?? 0;
  const hasProductionOutline = productionBeatsCount >= 10;

  if (hasEditorialOutline) {
    completedSteps.push("editorial_outline");
  } else if (hasProductionOutline) {
    completedSteps.push("editorial_outline");
    addWarning({
      id: "missing_editorial_outline",
      step: "editorial_outline",
      field: null,
      message: "Le résumé éditorial n’a pas été généré, mais le plan détaillé est prêt.",
      ctaLabel: "Régénérer",
      action: "generate_outline",
    });
  } else {
    addBlocker({
      id: "missing_editorial_outline",
      step: "editorial_outline",
      field: null,
      message: "L’outline éditorial n’est pas prêt.",
      ctaLabel: "Générer outline & plan",
      action: "generate_outline",
    });
  }

  if (hasProductionOutline) {
    completedSteps.push("production_outline");
  } else if (productionBeatsCount > 0) {
    completedSteps.push("production_outline");
    addWarning({
      id: "production_outline_too_short",
      step: "production_outline",
      field: null,
      message: `L’outline de production a ${productionBeatsCount} beat(s), idéalement 10+.`,
      ctaLabel: "Régénérer l’outline de production",
      action: "generate_outline",
    });
  } else {
    addBlocker({
      id: "production_outline_too_short",
      step: "production_outline",
      field: null,
      message: "L’outline de production doit contenir au moins 10 beats.",
      ctaLabel: "Régénérer l’outline de production",
      action: "generate_outline",
    });
  }

  let imageCounts: ChapterImageCount;

  if (snapshot.data.productionPlan) {
    completedSteps.push("production_plan");
    imageCounts = normalizeChapterImageCounts({
      estimatedImages: snapshot.data.productionPlan.estimatedImages ?? 0,
      targetImages: snapshot.data.productionPlan.targetImages ?? 0,
      minimumImages: snapshot.data.productionPlan.minimumImages ?? 75,
      acceptedImages: snapshot.data.readinessReport?.imageCounts.acceptedImages ?? 0,
      generatedImages: snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0,
      rejectedImages: snapshot.data.readinessReport?.imageCounts.rejectedImages ?? 0,
    });
    if (imageCounts.targetImages < imageCounts.minimumImages) {
      addWarning({
        id: "production_plan_under_minimum_images",
        step: "production_plan",
        field: null,
        message: `Le plan vise ${imageCounts.targetImages} images (minimum conseillé : ${imageCounts.minimumImages}).`,
        ctaLabel: "Régénérer le plan",
        action: "generate_outline",
      });
    }
  } else {
    imageCounts = normalizeChapterImageCounts(null);
    addBlocker({
      id: "missing_production_plan",
      step: "production_plan",
      field: null,
      message: "Le plan de production n’a pas encore été calculé.",
      ctaLabel: "Générer outline & plan",
      action: "generate_outline",
    });
  }

  if ((snapshot.data.chapterCanon?.continuityNotes.length ?? 0) === 0) {
    addWarning({
      id: "missing_continuity_notes",
      step: "canon",
      field: "studio-continuity-notes",
      message: "Aucune note de continuité n’a été fournie pour le chapitre.",
      ctaLabel: "Ajouter une note de continuité",
      action: "focus_field",
    });
  }

  if ((snapshot.data.characterCanons ?? []).length === 0) {
    addWarning({
      id: "missing_character_canons",
      step: "characters",
      field: "studio-hero-character",
      message: "Aucun canon personnage détaillé n’est encore rattaché au chapitre.",
      ctaLabel: "Vérifier le casting",
      action: "focus_field",
    });
  }

  for (const canon of snapshot.data.characterCanons ?? []) {
    if (canon.importanceTier !== "MAIN_HERO" && canon.importanceTier !== "SECONDARY_CORE") continue;
    const visualTraitCount =
      canon.visualIdentity.length +
      canon.hairTraits.length +
      canon.eyeTraits.length +
      canon.faceTraits.length;
    if (visualTraitCount < 2) {
      addWarning({
        id: `missing_canon_pack_${canon.characterId}`,
        step: "characters",
        field: "studio-hero-character",
        message: `La fiche canon de ${canon.canonicalName} est incomplète (${visualTraitCount} trait(s) visuel(s)). Génère la fiche canon dans le studio personnage pour stabiliser le rendu visuel.`,
        ctaLabel: "Générer la fiche canon",
        action: "focus_field",
      });
    }
  }

  const preparationScore = clamp(
    100
      - blockerItems.length * 14
      - warningItems.length * 4
      + completedSteps.length * 6,
    0,
    100,
  );

  return {
    status: blockerItems.length > 0 ? "blocked" : warningItems.length > 0 ? "warning" : "ready",
    preparationScore,
    blockingIssues: blockerItems.map((issue) => issue.message),
    warnings: warningItems.map((issue) => issue.message),
    blockerItems,
    warningItems,
    completedSteps,
    imageCounts,
  };
}

export function resolveChapterStudioStatus(snapshot: ChapterStudioSnapshot): ChapterStudioStatus {
  const readinessReport = snapshot.data.readinessReport ?? buildChapterReadinessReport(snapshot);
  const qaReport = snapshot.data.qaReport;

  if ((snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0) > 0 && readinessReport.imageCounts.acceptedImages < readinessReport.imageCounts.minimumImages) {
    return "GENERATION_PARTIAL";
  }

  if (qaReport && readinessReport.imageCounts.acceptedImages >= readinessReport.imageCounts.minimumImages) {
    return qaReport.rejectedPanelCount > 0 ? "NEEDS_FIXES" : "COMPLETED";
  }

  if (readinessReport.imageCounts.generatedImages > 0) return "QA_REVIEW";
  if (snapshot.status === "GENERATING") return "GENERATING";
  if (readinessReport.status === "ready") return "READY_FOR_GENERATION";
  if (snapshot.data.productionPlan) return "PRODUCTION_PLAN_READY";
  if ((snapshot.data.productionOutline?.beats.length ?? 0) > 0) return "OUTLINE_PRODUCTION_READY";
  if ((snapshot.data.editorialOutline?.beats.length ?? 0) > 0) return "OUTLINE_EDITORIAL_READY";
  if (snapshot.data.chapterCanon) return "CANON_READY";
  if (snapshot.data.narrativeContract) return "NARRATIVE_CONTRACT_READY";
  return "DRAFT";
}

export function canTransitionChapterStudioStatus(
  from: ChapterStudioStatus,
  to: ChapterStudioStatus,
): boolean {
  const transitions: Record<ChapterStudioStatus, ChapterStudioStatus[]> = {
    DRAFT: ["NARRATIVE_CONTRACT_READY"],
    NARRATIVE_CONTRACT_READY: ["CANON_READY"],
    CANON_READY: ["OUTLINE_EDITORIAL_READY"],
    OUTLINE_EDITORIAL_READY: ["OUTLINE_PRODUCTION_READY"],
    OUTLINE_PRODUCTION_READY: ["PRODUCTION_PLAN_READY"],
    PRODUCTION_PLAN_READY: ["READY_FOR_GENERATION"],
    READY_FOR_GENERATION: ["GENERATING"],
    GENERATING: ["GENERATION_PARTIAL", "QA_REVIEW"],
    GENERATION_PARTIAL: ["GENERATING", "QA_REVIEW", "NEEDS_FIXES"],
    QA_REVIEW: ["NEEDS_FIXES", "COMPLETED"],
    NEEDS_FIXES: ["GENERATING", "QA_REVIEW", "COMPLETED"],
    COMPLETED: ["PUBLISHED"],
    PUBLISHED: [],
  };

  return transitions[from].includes(to);
}

export function createEmptyChapterStudioSnapshot(): ChapterStudioSnapshot {
  return chapterStudioSnapshotSchema.parse({
    data: {
      characterCanons: [],
      locationCanons: [],
    },
  });
}

export function updateChapterStudioSnapshot(
  snapshot: ChapterStudioSnapshot | null | undefined,
  patch: Partial<ChapterStudioData>,
  input?: {
    currentStep?: ChapterStudioStep;
    transitionReason?: string;
  },
): ChapterStudioSnapshot {
  const base = snapshot ? chapterStudioSnapshotSchema.parse(snapshot) : createEmptyChapterStudioSnapshot();
  const merged = chapterStudioSnapshotSchema.parse({
    ...base,
    currentStep: input?.currentStep ?? base.currentStep,
    data: {
      ...base.data,
      ...patch,
      characterCanons: patch.characterCanons ?? base.data.characterCanons,
      locationCanons: patch.locationCanons ?? base.data.locationCanons,
    },
    updatedAt: new Date().toISOString(),
    autosaveVersion: base.autosaveVersion + 1,
  });

  const readinessReport = buildChapterReadinessReport(merged);
  const nextStatus = resolveChapterStudioStatus({
    ...merged,
    data: {
      ...merged.data,
      readinessReport,
    },
  });

  return {
    ...merged,
    status: nextStatus,
    data: {
      ...merged.data,
      readinessReport,
    },
    history:
      merged.status !== nextStatus && canTransitionChapterStudioStatus(merged.status, nextStatus)
        ? [
            ...merged.history,
            {
              from: merged.status,
              to: nextStatus,
              at: new Date().toISOString(),
              reason: input?.transitionReason ?? null,
            },
          ]
        : merged.history,
  };
}

export function buildLegacyApprovedOutlineFromStudio(
  snapshot: ChapterStudioSnapshot,
): ApprovedChapterOutline | null {
  const productionOutline = snapshot.data.productionOutline;
  if (!productionOutline) return null;

  return {
    summary: snapshot.data.editorialOutline?.summary ?? productionOutline.chapterGoal,
    cliffhanger: productionOutline.cliffhanger,
    beats: productionOutline.beats.map((beat) => ({
      id: beat.beatId,
      summary: beat.summary,
      characters: beat.involvedCharacters,
      location: beat.environmentContext[0] ?? snapshot.data.chapterCanon?.currentLocation ?? "Lieu à préciser",
      pageRole: beat.narrativeFunction,
      turn: beat.dramaticChange,
      emotionalDelta: clamp(Math.round((beat.indispensabilityScore - beat.redundancyRisk) / 25), -3, 3),
      structuredBeat: {
        source: snapshot.data.productionOutline?.source === "legacy_adapted" ? "heuristic_fallback" : "generator_structured",
        confidence: clamp((beat.indispensabilityScore - beat.redundancyRisk + 50) / 100, 0.2, 0.98),
        arcPromises: [],
        worldConsequences: [],
        setupPayoffHooks: [],
      },
    })),
    approvedAt: new Date().toISOString(),
    approvalVersion: `studio_${snapshot.autosaveVersion}`,
    source: "user_approved",
  };
}

/**
 * Construit un ApprovedChapterOutline depuis un ProductionOutline premium.
 * Contrairement à buildLegacyApprovedOutlineFromStudio, utilise TOUS les beats
 * et préserve les données premium (facts, props, obligations).
 */
export function buildApprovedOutlineFromProductionOutline(
  snapshot: ChapterStudioSnapshot,
): ApprovedChapterOutline | null {
  const productionOutline = snapshot.data.productionOutline;
  if (!productionOutline) return null;

  return {
    summary: snapshot.data.editorialOutline?.summary ?? productionOutline.chapterGoal,
    cliffhanger: productionOutline.cliffhanger,
    beats: productionOutline.beats.map((beat) => ({
      id: beat.beatId,
      summary: beat.summary,
      characters: beat.involvedCharacters,
      location: beat.environmentContext[0] ?? snapshot.data.chapterCanon?.currentLocation ?? "Lieu à préciser",
      pageRole: beat.narrativeFunction,
      turn: beat.dramaticChange,
      emotionalDelta: clamp(Math.round((beat.indispensabilityScore - beat.redundancyRisk) / 25), -3, 3),
      structuredBeat: {
        source: "generator_structured",
        confidence: clamp((beat.indispensabilityScore - beat.redundancyRisk + 50) / 100, 0.5, 0.98),
        arcPromises: [],
        worldConsequences: [],
        setupPayoffHooks: [],
      },
    })),
    approvedAt: new Date().toISOString(),
    approvalVersion: `premium_${snapshot.autosaveVersion}`,
    source: "user_approved",
  };
}

/**
 * Construit un contrat de production (productionOutline + productionPlan partiels)
 * depuis un ApprovedChapterOutline existant, sans recalcul premium complet.
 * Utilisé comme pont de compatibilité quand le contrat premium n'est pas disponible.
 */
export function buildProductionContractFromApprovedOutline(input: {
  approvedOutline: ApprovedChapterOutline;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
}): { productionOutline: ProductionOutline; fallbackUsed: true } {
  const productionOutline: ProductionOutline = productionOutlineSchema.parse({
    source: "legacy_adapted",
    chapterGoal: input.chapterSummary ?? input.approvedOutline.summary,
    cliffhanger: input.cliffhanger ?? input.approvedOutline.cliffhanger,
    beats: input.approvedOutline.beats.map((beat) => ({
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn,
      involvedCharacters: beat.characters,
      activeCanonConstraints: [],
      environmentContext: [beat.location],
      visualPriority: "high",
      estimatedPanels: 4,
      criticality: "medium",
      continuityDependencies: [],
      indispensabilityScore: 70,
      redundancyRisk: 20,
      infoGained: null,
      emotionProduced: null,
    })),
  });

  return { productionOutline, fallbackUsed: true };
}

export function buildStudioSnapshotFromLegacy(input: {
  approvedOutline?: ApprovedChapterOutline | null;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
}): ChapterStudioSnapshot {
  if (!input.approvedOutline) {
    return createEmptyChapterStudioSnapshot();
  }

  const editorialOutline: EditorialOutline = {
    summary: input.approvedOutline.summary,
    validationNotes: [],
    beats: input.approvedOutline.beats.slice(0, 5).map((beat, index) => ({
      beatId: beat.id,
      label: `Bloc ${index + 1}`,
      summary: beat.summary,
      narrativePurpose: beat.pageRole,
      dramaticShift: beat.turn,
      involvedCharacters: beat.characters,
    })),
  };

  const productionOutline: ProductionOutline = {
    source: "legacy_adapted",
    chapterGoal: input.chapterSummary ?? input.approvedOutline.summary,
    cliffhanger: input.cliffhanger ?? input.approvedOutline.cliffhanger,
    beats: input.approvedOutline.beats.map((beat) => ({
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn,
      involvedCharacters: beat.characters,
      activeCanonConstraints: [],
      environmentContext: [beat.location],
      visualPriority: "high",
      estimatedPanels: 4,
      criticality: "medium",
      continuityDependencies: [],
      indispensabilityScore: 70,
      redundancyRisk: 20,
      infoGained: null,
      emotionProduced: null,
    })),
  };

  return updateChapterStudioSnapshot(
    createEmptyChapterStudioSnapshot(),
    {
      intent: {
        chapterNumber: input.chapterNumber ?? null,
        workingTitle: input.chapterTitle ?? null,
        shortPitch: input.userIntent ?? input.chapterSummary ?? null,
        mainConflict: input.chapterSummary ?? null,
      },
      editorialOutline,
      productionOutline,
      productionPlan: buildProductionPlanFromOutline(productionOutline),
    },
    {
      currentStep: "production_plan",
      transitionReason: "legacy_outline_adapted",
    },
  );
}
