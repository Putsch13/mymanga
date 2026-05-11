/**
 * legacy-bridge.ts
 *
 * Pont entre le studio premium et l'ancien `ApprovedChapterOutline` :
 *   - `buildLegacyApprovedOutlineFromStudio`
 *   - `buildApprovedOutlineFromProductionOutline`
 *   - `buildProductionContractFromApprovedOutline`
 *   - `buildStudioSnapshotFromLegacy`
 *
 * Extrait de `chapter-studio-helpers.ts` (audit-v9, < 500 lignes/fichier).
 */

import type { ApprovedChapterOutline } from "../approved-outline";
import {
  productionOutlineSchema,
  type ChapterStudioSnapshot,
  type EditorialOutline,
  type ProductionOutline,
} from "../chapter-studio";
import { clamp } from "./_utils";
import { buildProductionPlanFromOutline } from "./production-plan";
import {
  createEmptyChapterStudioSnapshot,
  updateChapterStudioSnapshot,
} from "./snapshot";

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
        source:
          snapshot.data.productionOutline?.source === "legacy_adapted"
            ? "heuristic_fallback"
            : "generator_structured",
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
