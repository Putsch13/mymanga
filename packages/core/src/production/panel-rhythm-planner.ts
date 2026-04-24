/**
 * panel-rhythm-planner.ts — Planification du rythme des panels.
 *
 * Ce module est la SOURCE DE VÉRITÉ UNIQUE pour:
 * - La distribution des panels par beat
 * - L'insertion des cutaways selon le pattern de rythme
 * - Le respect des contraintes manga
 *
 * Le pattern ne doit pas être un hack rigide mais une politique configurable.
 */

import { PRODUCTION_RULES, type ChapterFormat } from "./production-rules";
import type { NormalizedBeat, NormalizedOutline } from "./normalize-outline";
import type { PanelRole, CanonicalPanelPlan, CanonicalBeatPlan, PanelTextPlan } from "./canonical-production-plan";

export interface RhythmConfig {
  targetPanelCount: number;
  pattern: readonly number[];
  cutawayInsertionPolicy: "distributed" | "clustered" | "end_weighted";
  maxConsecutiveCutaways: number;
  cutawayMaxRatio: number;
  actorDrivenMinRatio: number;
}

export interface PanelDistribution {
  beatId: string;
  basePanelCount: number;
  adjustedPanelCount: number;
  cutawayCount: number;
  actorDrivenCount: number;
}

export interface RhythmPlanResult {
  beatDistributions: PanelDistribution[];
  totalPanels: number;
  totalCutaways: number;
  totalActorDriven: number;
  cutawayRatio: number;
  actorDrivenRatio: number;
  valid: boolean;
  warnings: string[];
}

function calculateBeatImportance(beat: NormalizedBeat): number {
  let score = 50;

  if (beat.hasCombat) score += 20;
  if (beat.hasDialogue) score += 15;
  if (beat.hasEmotion) score += 15;
  if (beat.hasTension) score += 10;
  if (beat.hasAction) score += 10;

  if (beat.criticality === "critical") score += 25;
  else if (beat.criticality === "high") score += 15;
  else if (beat.criticality === "low") score -= 10;

  if (beat.narrativeFunction === "cliffhanger") score += 20;
  if (beat.narrativeFunction === "reveal" || beat.narrativeFunction === "revelation") score += 15;
  if (beat.narrativeFunction === "climax") score += 20;

  if (beat.opponent) score += 10;

  return Math.max(10, Math.min(100, score));
}

function distributePanelsByImportance(
  beats: NormalizedBeat[],
  targetTotal: number,
): Map<string, number> {
  if (beats.length === 0) return new Map();

  const importanceScores = beats.map((b) => ({
    beatId: b.beatId,
    score: calculateBeatImportance(b),
  }));

  const totalScore = importanceScores.reduce((sum, b) => sum + b.score, 0);

  const distribution = new Map<string, number>();
  let allocated = 0;

  for (const { beatId, score } of importanceScores) {
    const ratio = score / totalScore;
    const rawCount = Math.round(targetTotal * ratio);
    const count = Math.max(3, Math.min(12, rawCount));
    distribution.set(beatId, count);
    allocated += count;
  }

  let diff = targetTotal - allocated;
  const sortedByScore = [...importanceScores].sort((a, b) => b.score - a.score);

  while (diff !== 0) {
    for (const { beatId } of sortedByScore) {
      const current = distribution.get(beatId) ?? 3;
      if (diff > 0 && current < 12) {
        distribution.set(beatId, current + 1);
        diff--;
      } else if (diff < 0 && current > 3) {
        distribution.set(beatId, current - 1);
        diff++;
      }
      if (diff === 0) break;
    }
    if (diff !== 0 && sortedByScore.every(({ beatId }) => {
      const c = distribution.get(beatId) ?? 0;
      return (diff > 0 && c >= 12) || (diff < 0 && c <= 3);
    })) {
      break;
    }
  }

  return distribution;
}

function planCutawayInsertion(
  beatPanelCounts: Map<string, number>,
  beats: NormalizedBeat[],
  config: RhythmConfig,
): Map<string, { cutaway: number; actorDriven: number }> {
  const result = new Map<string, { cutaway: number; actorDriven: number }>();

  const totalPanels = Array.from(beatPanelCounts.values()).reduce((a, b) => a + b, 0);
  const maxCutaways = Math.floor(totalPanels * config.cutawayMaxRatio);

  let cutawaysAllocated = 0;
  const patternIndex = { current: 0 };

  for (const beat of beats) {
    const panelCount = beatPanelCounts.get(beat.beatId) ?? 4;
    let beatCutaways = 0;

    if (config.cutawayInsertionPolicy === "distributed") {
      const patternValue = config.pattern[patternIndex.current % config.pattern.length] ?? 2;
      if (panelCount > patternValue && cutawaysAllocated < maxCutaways) {
        beatCutaways = Math.min(
          Math.floor(panelCount * 0.25),
          maxCutaways - cutawaysAllocated,
          config.maxConsecutiveCutaways,
        );
      }
      patternIndex.current++;
    } else if (config.cutawayInsertionPolicy === "end_weighted") {
      const beatIndex = beats.indexOf(beat);
      const isLateInChapter = beatIndex > beats.length * 0.6;
      if (isLateInChapter && cutawaysAllocated < maxCutaways) {
        beatCutaways = Math.min(2, maxCutaways - cutawaysAllocated);
      }
    }

    const actorDriven = panelCount - beatCutaways;
    result.set(beat.beatId, { cutaway: beatCutaways, actorDriven });
    cutawaysAllocated += beatCutaways;
  }

  return result;
}

export function planRhythm(
  outline: NormalizedOutline,
  config: Partial<RhythmConfig> = {},
): RhythmPlanResult {
  const fullConfig: RhythmConfig = {
    targetPanelCount: config.targetPanelCount ?? PRODUCTION_RULES.panelCount.target,
    pattern: config.pattern ?? PRODUCTION_RULES.rhythm.preferredNarrativePattern,
    cutawayInsertionPolicy: config.cutawayInsertionPolicy ?? PRODUCTION_RULES.rhythm.cutawayInsertionPolicy,
    maxConsecutiveCutaways: config.maxConsecutiveCutaways ?? PRODUCTION_RULES.cutaway.maxConsecutive,
    cutawayMaxRatio: config.cutawayMaxRatio ?? PRODUCTION_RULES.cutaway.maxRatio,
    actorDrivenMinRatio: config.actorDrivenMinRatio ?? PRODUCTION_RULES.actorDriven.minRatio,
  };

  const warnings: string[] = [];

  if (outline.beats.length === 0) {
    return {
      beatDistributions: [],
      totalPanels: 0,
      totalCutaways: 0,
      totalActorDriven: 0,
      cutawayRatio: 0,
      actorDrivenRatio: 1,
      valid: false,
      warnings: ["No beats in outline"],
    };
  }

  const beatPanelCounts = distributePanelsByImportance(outline.beats, fullConfig.targetPanelCount);
  const cutawayPlan = planCutawayInsertion(beatPanelCounts, outline.beats, fullConfig);

  const beatDistributions: PanelDistribution[] = outline.beats.map((beat) => ({
    beatId: beat.beatId,
    basePanelCount: beat.estimatedPanels,
    adjustedPanelCount: beatPanelCounts.get(beat.beatId) ?? 4,
    cutawayCount: cutawayPlan.get(beat.beatId)?.cutaway ?? 0,
    actorDrivenCount: cutawayPlan.get(beat.beatId)?.actorDriven ?? 4,
  }));

  const totalPanels = beatDistributions.reduce((sum, b) => sum + b.adjustedPanelCount, 0);
  const totalCutaways = beatDistributions.reduce((sum, b) => sum + b.cutawayCount, 0);
  const totalActorDriven = beatDistributions.reduce((sum, b) => sum + b.actorDrivenCount, 0);

  const cutawayRatio = totalPanels > 0 ? totalCutaways / totalPanels : 0;
  const actorDrivenRatio = totalPanels > 0 ? totalActorDriven / totalPanels : 1;

  let valid = true;

  if (cutawayRatio > fullConfig.cutawayMaxRatio) {
    warnings.push(`Cutaway ratio ${(cutawayRatio * 100).toFixed(1)}% exceeds max ${(fullConfig.cutawayMaxRatio * 100).toFixed(1)}%`);
    valid = false;
  }

  if (actorDrivenRatio < fullConfig.actorDrivenMinRatio) {
    warnings.push(`Actor-driven ratio ${(actorDrivenRatio * 100).toFixed(1)}% below min ${(fullConfig.actorDrivenMinRatio * 100).toFixed(1)}%`);
    valid = false;
  }

  if (totalPanels < PRODUCTION_RULES.panelCount.minimum) {
    warnings.push(`Total panels ${totalPanels} below minimum ${PRODUCTION_RULES.panelCount.minimum}`);
    valid = false;
  }

  if (totalPanels > PRODUCTION_RULES.panelCount.maximum) {
    warnings.push(`Total panels ${totalPanels} above maximum ${PRODUCTION_RULES.panelCount.maximum}`);
    valid = false;
  }

  return {
    beatDistributions,
    totalPanels,
    totalCutaways,
    totalActorDriven,
    cutawayRatio,
    actorDrivenRatio,
    valid,
    warnings,
  };
}

export function determinePanelRole(
  beat: NormalizedBeat,
  panelIndexInBeat: number,
  totalPanelsInBeat: number,
  isCutaway: boolean,
): PanelRole {
  if (isCutaway) {
    if (beat.hasTension && panelIndexInBeat === totalPanelsInBeat - 1) return "aftermath";
    if (beat.props.length > 0 && panelIndexInBeat === 0) return "prop";
    if (beat.locations.length > 0) return "environment";
    return "cutaway";
  }

  if (beat.hasCombat) {
    if (beat.opponent && panelIndexInBeat === 0) return "enemy";
    if (panelIndexInBeat % 2 === 0) return "action";
    return "reaction";
  }

  if (beat.hasDialogue) {
    if (panelIndexInBeat % 2 === 0) return "speaker";
    return "listener";
  }

  if (beat.hasEmotion) {
    return "reaction";
  }

  if (beat.involvedCharacters.length >= 2) {
    return "duo";
  }

  if (beat.involvedCharacters.length === 1) {
    return "hero";
  }

  if (beat.involvedCharacters.length > 3) {
    return "group";
  }

  return "action";
}

export function determinePanelTextPlan(
  beat: NormalizedBeat,
  panelRole: PanelRole,
  isCutaway: boolean,
): PanelTextPlan {
  const panelId = "";

  if (isCutaway) {
    return {
      panelId,
      mode: "silent",
      reserveTextArea: false,
    };
  }

  if (beat.hasDialogue && (panelRole === "speaker" || panelRole === "duo")) {
    return {
      panelId,
      mode: "dialogue",
      anchor: {
        speakerId: beat.involvedCharacters[0],
        reserveBubbleSpace: true,
      },
      reserveTextArea: true,
    };
  }

  if (beat.hasCombat && (panelRole === "action" || panelRole === "enemy")) {
    return {
      panelId,
      mode: "sfx",
      sfx: ["FWASH", "BOOM"],
      reserveTextArea: true,
    };
  }

  if (beat.hasEmotion && panelRole === "reaction") {
    return {
      panelId,
      mode: "thought",
      reserveTextArea: true,
    };
  }

  if (beat.narrativeFunction === "transition" || panelRole === "transition") {
    return {
      panelId,
      mode: "narration",
      text: beat.summary.length > 100 ? beat.summary.slice(0, 97) + "..." : beat.summary,
      reserveTextArea: true,
    };
  }

  return {
    panelId,
    mode: "silent",
    reserveTextArea: false,
  };
}
