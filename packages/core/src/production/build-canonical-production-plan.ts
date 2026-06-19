/**
 * build-canonical-production-plan.ts — Constructeur du plan de production canonique.
 *
 * RÈGLE ABSOLUE : c'est LA SEULE fonction qui doit construire un plan de
 * production. Tous les autres modules doivent appeler cette fonction.
 *
 * Façade — l'implémentation est découpée dans `_build-canonical-production-plan/*`.
 */

import {
  allocateContractualVisualSlots,
  consumeContractualSlot,
} from "./allocate-contractual-visual-slots";
import type {
  CanonicalBeatPlan,
  CanonicalChapterProductionPlan,
  CanonicalPanelPlan,
  PanelRole,
} from "./canonical-production-plan";
import { applyDistributedCutawayRhythmToPanels } from "./distributed-cutaway-rhythm";
import { normalizeOutline, type NormalizedOutline } from "./normalize-outline";
import { planRhythm, type RhythmConfig } from "./panel-rhythm-planner";
import { PRODUCTION_RULES, type ChapterFormat } from "./production-rules";

import { buildBeatPlan } from "./_build-canonical-production-plan/build-beat";
import {
  buildPanelPlan,
  generatePanelId,
} from "./_build-canonical-production-plan/build-panel";
import { computeCanonicalProductionMetrics } from "./_build-canonical-production-plan/metrics";
import { qaCanonicalProductionPlanWithAutoRepair } from "./_build-canonical-production-plan/qa";
import { assignPanelTextAnchors } from "./_build-canonical-production-plan/text-anchors";
import type { BuildCanonicalPlanInput } from "./_build-canonical-production-plan/types";

export type { BuildCanonicalPlanInput } from "./_build-canonical-production-plan/types";
export { computeCanonicalProductionMetrics } from "./_build-canonical-production-plan/metrics";
export { assignPanelTextAnchors } from "./_build-canonical-production-plan/text-anchors";
export {
  autoRepairCanonicalPlan,
  qaCanonicalProductionPlan,
  qaCanonicalProductionPlanWithAutoRepair,
} from "./_build-canonical-production-plan/qa";

export function buildCanonicalChapterProductionPlan(
  input: BuildCanonicalPlanInput,
): CanonicalChapterProductionPlan {
  const normalizedOutline = normalizeOutline(input.rawOutline);
  const rhythmPlan = planRhythm(normalizedOutline, input.rhythmConfig);

  const contractualSlots = allocateContractualVisualSlots(
    normalizedOutline.beats,
    input.visualWorld ?? null,
  );
  const consumedSlots = new Set<string>();

  const panels: CanonicalPanelPlan[] = [];
  const beatPlans: CanonicalBeatPlan[] = [];

  let globalPanelIndex = 0;
  let currentPage = 1;
  let panelInCurrentPage = 0;
  // ARCH-3 — format "simple" : 1 panel / page (storyboard rapide).
  // Webtoon : 75 panels / page (flux vertical continu).
  // Manga : 6 panels / page (grille classique).
  const panelsPerPage =
    input.format === "webtoon" ? 75 : input.format === "simple" ? 1 : 6;

  for (const beat of normalizedOutline.beats) {
    const distribution = rhythmPlan.beatDistributions.find((d) => d.beatId === beat.beatId);
    const panelCountForBeat = distribution?.adjustedPanelCount ?? 4;
    const cutawayCountForBeat = distribution?.cutawayCount ?? 0;

    const panelIdsForBeat: string[] = [];

    for (let i = 0; i < panelCountForBeat; i++) {
      const isCutaway = i >= panelCountForBeat - cutawayCountForBeat;
      const panelId = generatePanelId(beat.beatId, i);
      panelIdsForBeat.push(panelId);

      panelInCurrentPage++;
      if (panelInCurrentPage > panelsPerPage) {
        currentPage++;
        panelInCurrentPage = 1;
      }

      let panel = buildPanelPlan(
        panelId,
        beat,
        i,
        globalPanelIndex,
        currentPage,
        panelInCurrentPage,
        panelCountForBeat,
        isCutaway,
      );

      if (isCutaway) {
        const slot = consumeContractualSlot(contractualSlots, beat.beatId, consumedSlots);
        if (slot) {
          panel = {
            ...panel,
            role: slot.requiredRole as PanelRole,
            subjectFocus: slot.subjectFocus,
          };
        }
      }

      panels.push(panel);
      globalPanelIndex++;
    }

    beatPlans.push(
      buildBeatPlan(beat, panelIdsForBeat, input.knownNpcGroups, input.knownCharacters),
    );
  }

  const panelsDistributed = applyDistributedCutawayRhythmToPanels(panels, normalizedOutline);

  const partialPlanBare: CanonicalChapterProductionPlan = {
    chapterId: input.chapterId,
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    format: input.format,
    targetPanelCount: PRODUCTION_RULES.panelCount.target,
    minimumPanelCount: PRODUCTION_RULES.panelCount.minimum,
    maximumPanelCount: PRODUCTION_RULES.panelCount.maximum,
    idealPanelCount: PRODUCTION_RULES.panelCount.target,
    beatCount: beatPlans.length,
    pageCount: currentPage,
    beats: beatPlans,
    panels: panelsDistributed,
    rhythm: {
      cutawayMaxRatio: PRODUCTION_RULES.cutaway.maxRatio,
      actorDrivenMinRatio: PRODUCTION_RULES.actorDriven.minRatio,
      maxConsecutiveCutaways: PRODUCTION_RULES.cutaway.maxConsecutive,
      pattern: [...PRODUCTION_RULES.rhythm.preferredNarrativePattern],
      cutawayInsertionPolicy: PRODUCTION_RULES.rhythm.cutawayInsertionPolicy,
    },
    metrics: computeCanonicalProductionMetrics(panelsDistributed),
    qa: {
      valid: false,
      warnings: [],
      errors: [],
      details: {
        cutawayRatioOk: false,
        actorDrivenRatioOk: false,
        consecutiveCutawaysOk: false,
        beatCoverageOk: false,
        dialogueCoverageOk: false,
        panelCountOk: false,
      },
    },
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const partialPlan = assignPanelTextAnchors(partialPlanBare);
  console.info("[canonical-plan] built", {
    chapterId: input.chapterId,
    panels: partialPlan.panels.length,
  });
  const { plan: finalPlan, qa: qaResult } = qaCanonicalProductionPlanWithAutoRepair(partialPlan);

  return {
    ...finalPlan,
    qa: qaResult,
  };
}

export function safelyBuildCanonicalPlan(
  input: BuildCanonicalPlanInput,
): CanonicalChapterProductionPlan | null {
  try {
    return buildCanonicalChapterProductionPlan(input);
  } catch (error) {
    console.error("[build-canonical-production-plan] Failed to build plan:", error);
    return null;
  }
}

/** Alias CTO — métriques officielles à partir des panels canoniques. */
export const computeCanonicalPlanMetrics = computeCanonicalProductionMetrics;

/**
 * Rythme premium : même logique que `buildCanonicalChapterProductionPlan`
 * (outline normalisé → panels dans la plage 70–75 avec contraintes).
 */
export function planPremiumPanelRhythm(input: {
  outline: NormalizedOutline;
  format: ChapterFormat;
  rules?: Partial<RhythmConfig>;
}): CanonicalPanelPlan[] {
  return buildCanonicalChapterProductionPlan({
    chapterId: "rhythm-preview",
    projectId: "rhythm-preview",
    chapterNumber: 1,
    chapterTitle: "Rhythm preview",
    format: input.format,
    rawOutline: {
      source: input.outline.source,
      chapterGoal: input.outline.chapterGoal,
      cliffhanger: input.outline.cliffhanger,
      beats: input.outline.beats,
    },
    rhythmConfig: input.rules,
  }).panels;
}

