/**
 * build-canonical-production-plan.ts — Constructeur du plan de production canonique.
 *
 * RÈGLE ABSOLUE: C'est LA SEULE fonction qui doit construire un plan de production.
 * Tous les autres modules doivent appeler cette fonction.
 *
 * Elle prend un outline normalisé et produit un CanonicalChapterProductionPlan complet.
 */

import { PRODUCTION_RULES, type ChapterFormat } from "./production-rules";
import { normalizeOutline, type NormalizedOutline, type NormalizedBeat } from "./normalize-outline";
import {
  planRhythm,
  determinePanelRole,
  determinePanelTextPlan,
  type RhythmConfig,
} from "./panel-rhythm-planner";
import { runProductionPlanQa } from "./production-plan-qa";
import type {
  CanonicalChapterProductionPlan,
  CanonicalBeatPlan,
  CanonicalPanelPlan,
  ProductionMetrics,
  PanelRole,
  PanelTextPlan,
} from "./canonical-production-plan";

export interface BuildCanonicalPlanInput {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string;
  format: ChapterFormat;
  rawOutline: unknown;
  rhythmConfig?: Partial<RhythmConfig>;
}

function generatePanelId(beatId: string, panelIndex: number): string {
  return `${beatId}_panel_${panelIndex}`;
}

/** Métriques officielles à partir des panels canoniques (réutilisé par la QA sur blueprints premium). */
export function computeCanonicalProductionMetrics(panels: CanonicalPanelPlan[]): ProductionMetrics {
  const roleDistribution: Record<PanelRole, number> = {
    hero: 0, duo: 0, enemy: 0, reaction: 0, action: 0,
    environment: 0, prop: 0, npc: 0, group: 0, aftermath: 0,
    transition: 0, cutaway: 0, speaker: 0, listener: 0,
  };

  const shotDistribution: Record<string, number> = {};
  const focusDistribution: Record<string, number> = {};

  let cutawayCount = 0;
  let actorDrivenCount = 0;
  let dialogueAnchoredCount = 0;
  let dialogueFloatingCount = 0;
  let narrationCount = 0;
  let silentCount = 0;
  let sfxCount = 0;
  let maxConsecutiveCutaways = 0;
  let currentCutawayStreak = 0;

  for (const panel of panels) {
    roleDistribution[panel.role]++;

    shotDistribution[panel.shotType] = (shotDistribution[panel.shotType] ?? 0) + 1;
    focusDistribution[panel.subjectFocus] = (focusDistribution[panel.subjectFocus] ?? 0) + 1;

    if (panel.isCutaway) {
      cutawayCount++;
      currentCutawayStreak++;
      maxConsecutiveCutaways = Math.max(maxConsecutiveCutaways, currentCutawayStreak);
    } else {
      actorDrivenCount++;
      currentCutawayStreak = 0;
    }

    switch (panel.textPlan.mode) {
      case "dialogue":
        if (panel.textPlan.anchor?.speakerId) {
          dialogueAnchoredCount++;
        } else {
          dialogueFloatingCount++;
        }
        break;
      case "narration":
      case "thought":
        narrationCount++;
        break;
      case "sfx":
        sfxCount++;
        break;
      case "silent":
        silentCount++;
        break;
    }
  }

  const totalPanels = panels.length;
  const totalPages = new Set(panels.map((p) => p.pageNumber)).size;
  const totalBeats = new Set(panels.map((p) => p.beatId)).size;

  return {
    totalPanels,
    totalBeats,
    totalPages,
    cutawayCount,
    cutawayRatio: totalPanels > 0 ? cutawayCount / totalPanels : 0,
    actorDrivenCount,
    actorDrivenRatio: totalPanels > 0 ? actorDrivenCount / totalPanels : 1,
    heroCount: roleDistribution.hero,
    duoCount: roleDistribution.duo,
    enemyCount: roleDistribution.enemy,
    reactionCount: roleDistribution.reaction,
    actionCount: roleDistribution.action,
    environmentCount: roleDistribution.environment,
    propCount: roleDistribution.prop,
    npcCount: roleDistribution.npc,
    groupCount: roleDistribution.group,
    dialogueAnchoredCount,
    dialogueFloatingCount,
    narrationCount,
    silentCount,
    sfxCount,
    maxConsecutiveCutaways,
    focusDistribution,
    shotDistribution,
    roleDistribution,
  };
}

function buildBeatPlan(
  beat: NormalizedBeat,
  panelIds: string[],
): CanonicalBeatPlan {
  return {
    beatId: beat.beatId,
    beatIndex: beat.beatIndex,
    summary: beat.summary,
    narrativeFunction: beat.narrativeFunction,
    dramaticChange: beat.dramaticChange,
    involvedCharacters: beat.involvedCharacters,
    environmentContext: beat.environmentContext,
    targetPanelCount: beat.estimatedPanels,
    actualPanelCount: panelIds.length,
    panelIds,
    hasDialogue: beat.hasDialogue,
    hasAction: beat.hasAction,
    hasEmotion: beat.hasEmotion,
    hasTension: beat.hasTension,
  };
}

function buildPanelPlan(
  panelId: string,
  beat: NormalizedBeat,
  panelIndexInBeat: number,
  globalPanelIndex: number,
  pageNumber: number,
  panelNumberInPage: number,
  totalPanelsInBeat: number,
  isCutaway: boolean,
): CanonicalPanelPlan {
  const role = determinePanelRole(beat, panelIndexInBeat, totalPanelsInBeat, isCutaway);
  const textPlanBase = determinePanelTextPlan(beat, role, isCutaway);
  const textPlan: PanelTextPlan = { ...textPlanBase, panelId };

  const isActorDriven = !isCutaway && ["hero", "duo", "enemy", "reaction", "action", "speaker", "listener", "group"].includes(role);

  return {
    panelId,
    beatId: beat.beatId,
    panelIndex: globalPanelIndex,
    pageNumber,
    panelNumberInPage,
    role,
    isCutaway,
    isActorDriven,
    purpose: beat.summary,
    shotType: isCutaway ? "wide" : "medium",
    cameraAngle: "eye_level",
    subjectFocus: beat.involvedCharacters[0] ?? "scene",
    secondaryFocus: beat.involvedCharacters[1],
    requiredCharacterIds: beat.involvedCharacters,
    mustShowCharacterIds: isCutaway ? [] : beat.involvedCharacters.slice(0, 2),
    mayShowCharacterIds: beat.involvedCharacters.slice(2),
    requiredEntityIds: beat.entities,
    mustShowEnemy: !!beat.opponent,
    requiredNpcCount: 0,
    requiredProps: beat.props.map((p) => ({
      id: `prop_${p}`,
      canonicalName: p,
      mustBeVisible: true,
    })),
    requiredLocationSignals: beat.locations,
    textPlan,
    criticality: beat.criticality,
    notes: [],
  };
}

export function buildCanonicalChapterProductionPlan(
  input: BuildCanonicalPlanInput,
): CanonicalChapterProductionPlan {
  const normalizedOutline = normalizeOutline(input.rawOutline);

  const rhythmPlan = planRhythm(normalizedOutline, input.rhythmConfig);

  const panels: CanonicalPanelPlan[] = [];
  const beatPlans: CanonicalBeatPlan[] = [];

  let globalPanelIndex = 0;
  let currentPage = 1;
  let panelInCurrentPage = 0;
  const panelsPerPage = input.format === "webtoon" ? 75 : 6;

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

      const panel = buildPanelPlan(
        panelId,
        beat,
        i,
        globalPanelIndex,
        currentPage,
        panelInCurrentPage,
        panelCountForBeat,
        isCutaway,
      );
      panels.push(panel);
      globalPanelIndex++;
    }

    beatPlans.push(buildBeatPlan(beat, panelIdsForBeat));
  }

  const metrics = computeCanonicalProductionMetrics(panels);

  const partialPlan: CanonicalChapterProductionPlan = {
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
    panels,
    rhythm: {
      cutawayMaxRatio: PRODUCTION_RULES.cutaway.maxRatio,
      actorDrivenMinRatio: PRODUCTION_RULES.actorDriven.minRatio,
      maxConsecutiveCutaways: PRODUCTION_RULES.cutaway.maxConsecutive,
      pattern: [...PRODUCTION_RULES.rhythm.defaultPattern],
      cutawayInsertionPolicy: PRODUCTION_RULES.rhythm.cutawayInsertionPolicy,
    },
    metrics,
    qa: { valid: false, warnings: [], errors: [], details: {} as any },
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const qaResult = runProductionPlanQa(partialPlan);

  return {
    ...partialPlan,
    qa: qaResult,
  };
}

export function safelyBuildCanonicalPlan(input: BuildCanonicalPlanInput): CanonicalChapterProductionPlan | null {
  try {
    return buildCanonicalChapterProductionPlan(input);
  } catch (error) {
    console.error("[build-canonical-production-plan] Failed to build plan:", error);
    return null;
  }
}
