/**
 * P5.2 — Construit la réponse JSON finale d'un POST /estimate.
 *
 * Sortie 1:1 avec l'ancien handler : aucune transformation supplémentaire,
 * uniquement déplacement du shaping verbeux hors du handler.
 */
import { PREMIUM_PANEL_RANGE, type ProductionMetrics } from "@manga-ai-studio/core";

interface CreativityControls {
  noveltyLevel?: number;
  worldStrictness?: number;
  visualExoticism?: number;
  npcVariety?: number;
  environmentRichness?: number;
}

interface PreviewBeat {
  id: string;
  summary: string;
  characters: string[] | undefined;
  location: string;
  pageRole: string;
  turn: string | undefined;
  emotionalDelta: number;
  structuredBeat: unknown;
}

interface FinalStructuralQa {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details?: unknown;
}

interface ContractQaSummary {
  ok: boolean;
  blocking: string[];
  warnings: string[];
  repairable: string[];
  metrics: Record<string, unknown>;
}

interface ProgressionCheck {
  ok: boolean;
  issues: string[];
  progressionScore: number;
}

interface CanonicalPlanSummary {
  format: string;
  beatCount: number;
  metrics: ProductionMetrics;
  rhythm: unknown;
  qa: { valid: boolean; errors: string[]; warnings: string[] };
}

export function buildEstimateResponse(args: {
  estimateMode: "existing_chapter" | "new_chapter";
  targetChapter: { id: string; status: string | null } | null;
  targetChapterNumber: number;
  requestedChapterNumber: number | null;
  estimatedTokens: number;
  creativityControls: CreativityControls | null | undefined;
  estimateContextExtras: {
    contextDigest: string;
    aiReadiness: unknown;
    premiumBlockingReasons: string[];
    canonicalPlan: CanonicalPlanSummary;
    continuityPreflight: {
      ok: boolean;
      blockers: string[];
      panelCount: number;
    };
    characterRefResolutionOk: boolean;
    finalStructuralQaValid: boolean;
    planReady: boolean;
  };
  contextPreview: {
    recentChapters: unknown;
    retrievedDocs: unknown;
    arcs: unknown;
    characters: unknown;
  };
  bundle: {
    plotOptions: unknown;
    creativeDirection: unknown;
    outline: { chapter_goal: string; cliffhanger: string };
  };
  previewVersion: unknown;
  previewBeats: PreviewBeat[];
  productionOutline: unknown;
  productionPlan: unknown;
  rawBlueprintCount: number;
  enrichedBlueprintCount: number;
  enrichmentApplied: boolean;
  enrichmentAddedCount: number;
  chapterMinimumImages: number;
  panelCountStatus: string;
  progressionCheck: ProgressionCheck;
  characterRefsUnresolved: string[];
  finalStructuralQa: FinalStructuralQa;
  finalStructuralQaMetrics: unknown;
  continuityBlockers: string[];
  continuityPanelCount: number;
  contractQa: ContractQaSummary;
}) {
  const {
    estimateMode,
    targetChapter,
    targetChapterNumber,
    requestedChapterNumber,
    estimatedTokens,
    creativityControls,
    estimateContextExtras,
    contextPreview,
    bundle,
    previewVersion,
    previewBeats,
    productionOutline,
    productionPlan,
    rawBlueprintCount,
    enrichedBlueprintCount,
    enrichmentApplied,
    enrichmentAddedCount,
    chapterMinimumImages,
    panelCountStatus,
    progressionCheck,
    characterRefsUnresolved,
    finalStructuralQa,
    finalStructuralQaMetrics,
    continuityBlockers,
    continuityPanelCount,
    contractQa,
  } = args;

  return {
    estimateMode,
    targetChapter: {
      id: targetChapter?.id ?? null,
      chapterNumber: targetChapterNumber,
      requestedChapterNumber,
      status: targetChapter?.status ?? null,
    },
    estimatedTokens,
    creativityControls: creativityControls ?? null,
    estimateContext: {
      targetChapterId: targetChapter?.id ?? null,
      targetChapterNumber,
      contextDigest: estimateContextExtras.contextDigest,
      creativityControlsUsed: creativityControls ?? null,
      estimateSource: estimateMode,
      estimatedAt: new Date().toISOString(),
      canonicalProductionPlan: {
        format: estimateContextExtras.canonicalPlan.format,
        beatCount: estimateContextExtras.canonicalPlan.beatCount,
        panelCount: estimateContextExtras.canonicalPlan.metrics.totalPanels,
        metrics: estimateContextExtras.canonicalPlan.metrics,
        rhythm: estimateContextExtras.canonicalPlan.rhythm,
        qa: estimateContextExtras.canonicalPlan.qa,
      },
      aiReadiness: estimateContextExtras.aiReadiness,
      premiumBlockingReasons: estimateContextExtras.premiumBlockingReasons,
      launchAlignedReady: estimateContextExtras.planReady,
      planStatus: estimateContextExtras.planReady ? "ready" : "incomplete",
      continuityPreflight: {
        ok: estimateContextExtras.continuityPreflight.ok,
        valid: estimateContextExtras.continuityPreflight.blockers.length === 0,
        blockers: estimateContextExtras.continuityPreflight.blockers,
        panelCount: estimateContextExtras.continuityPreflight.panelCount,
      },
      characterRefResolutionOk: estimateContextExtras.characterRefResolutionOk,
      finalStructuralQaValid: estimateContextExtras.finalStructuralQaValid,
    },
    contextPreview,
    plotOptions: bundle.plotOptions,
    creativeDirection: bundle.creativeDirection,
    outlinePreview: {
      summary: bundle.outline.chapter_goal,
      cliffhanger: bundle.outline.cliffhanger,
      approvalVersion: previewVersion,
      beats: previewBeats,
    },
    editorialOutline: {
      summary: bundle.outline.chapter_goal,
      validationNotes: [],
      beats: previewBeats.map((beat, index) => ({
        beatId: beat.id,
        label: `Bloc ${index + 1}`,
        summary: beat.summary,
        narrativePurpose: beat.pageRole,
        dramaticShift: beat.turn,
        involvedCharacters: beat.characters,
      })),
    },
    productionOutline,
    productionPlan,
    // P8 — planStatus STRICT : tout ce qui n'est pas dans la range premium
    // 70-75 (PREMIUM_PANEL_RANGE) est marqué `incomplete` et bloque le launch.
    planStatus: estimateContextExtras.planReady ? "ready" : "incomplete",
    rawBlueprintCount,
    enrichedBlueprintCount,
    enrichmentApplied,
    enrichmentAddedCount,
    minimumImages: chapterMinimumImages,
    premiumPanelRange: PREMIUM_PANEL_RANGE,
    panelCountStatus,
    planPresentation: {
      editorialLabel: "Résumé du chapitre (5 grands temps)",
      productionLabel: "Découpage détaillé pour la génération",
      editorialBeatCount: previewBeats.length,
      productionBeatCount: (productionOutline as { beats: unknown[] }).beats.length,
      explanation:
        "Le résumé macro sert à valider l'histoire. Le découpage détaillé sert à générer les panels.",
    },
    planWarnings: progressionCheck.ok ? [] : progressionCheck.issues,
    repairApplied: !progressionCheck.ok,
    repairReasons: progressionCheck.ok ? [] : progressionCheck.issues,
    progressionScore: progressionCheck.progressionScore,
    characterRefResolution: {
      ok: characterRefsUnresolved.length === 0,
      unresolved: characterRefsUnresolved,
    },
    finalStructuralQa: {
      valid: finalStructuralQa.valid,
      errors: finalStructuralQa.errors,
      warnings: finalStructuralQa.warnings,
      metrics: finalStructuralQaMetrics,
      details: finalStructuralQa.details,
    },
    continuityPreflight: {
      ok: estimateContextExtras.continuityPreflight.ok,
      valid: continuityBlockers.length === 0,
      blockers: continuityBlockers,
      panelCount: continuityPanelCount,
    },
    contractQa: {
      ok: contractQa.ok,
      blocking: contractQa.blocking,
      warnings: contractQa.warnings,
      repairable: contractQa.repairable,
      metrics: contractQa.metrics,
    },
  };
}
