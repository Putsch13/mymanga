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
import { applyDistributedCutawayRhythmToPanels } from "./distributed-cutaway-rhythm";
import { runProductionPlanQa } from "./production-plan-qa";
import { filterOutResolvedNpcGroupRefs, type NpcGroupRefForResolution } from "./resolve-character-refs";
import { allocateContractualVisualSlots, consumeContractualSlot, type ContractualSlot } from "./allocate-contractual-visual-slots";
import type {
  CanonicalChapterProductionPlan,
  CanonicalBeatPlan,
  CanonicalPanelPlan,
  ProductionMetrics,
  ProductionQaResult,
  PanelNarrativeMode,
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
  /** NPC groups connus du projet : les refs qui matchent sont retirées
   *  de `unresolvedCharacterRefs` pour éviter les faux QA fail. */
  knownNpcGroups?: readonly { id: string; label?: string | null }[];
  /** Catalogue personnages du projet : complète la résolution. */
  knownCharacters?: readonly { id: string; name?: string | null; displayName?: string | null }[];
  /** VisualWorldContract — used to allocate contractual slots (props, NPCs)
   *  before the generic rhythm pass. */
  visualWorld?: {
    props?: ReadonlyArray<{
      id: string;
      visibilityPolicy?: string | null;
      continuityPolicy?: string;
      requiredBeatIds?: string[];
    }>;
    npcGroups?: ReadonlyArray<{
      id: string;
      requiredBeatIds?: string[];
    }>;
    beatBindings?: ReadonlyArray<{
      beatId: string;
      primaryPropIds?: string[];
      npcGroupIds?: string[];
      locationId?: string | null;
    }>;
    locations?: ReadonlyArray<{ id: string }>;
  } | null;
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
  let intentionalSilenceCount = 0;
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
      case "intentional_silence":
        intentionalSilenceCount++;
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
    intentionalSilenceCount,
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
  knownNpcGroups?: readonly NpcGroupRefForResolution[],
  knownCharacters?: readonly { id: string; name?: string | null; displayName?: string | null }[],
): CanonicalBeatPlan {
  let unresolvedRefs = beat.unresolvedCharacterRefs ?? [];
  if (unresolvedRefs.length > 0 && ((knownNpcGroups?.length ?? 0) > 0 || (knownCharacters?.length ?? 0) > 0)) {
    unresolvedRefs = filterOutResolvedNpcGroupRefs(
      unresolvedRefs,
      (knownNpcGroups ?? []) as NpcGroupRefForResolution[],
      (knownCharacters ?? []).map(c => ({
        id: c.id,
        name: c.name ?? undefined,
        displayName: c.displayName ?? undefined,
      })),
    );
  }

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
    unresolvedCharacterRefs: unresolvedRefs,
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

/**
 * Garantit qu’aucun panel non-cutaway n’est « vide » : dialogue, narration,
 * pensée, SFX ou silence intentionnel (budget limité).
 */
export function assignPanelTextAnchors(plan: CanonicalChapterProductionPlan): CanonicalChapterProductionPlan {
  const beatById = new Map(plan.beats.map((b) => [b.beatId, b]));
  const actorDrivenPanels = plan.panels.filter((p) => p.isActorDriven && !p.isCutaway);
  const maxIntentional = Math.max(
    0,
    Math.floor(actorDrivenPanels.length * PRODUCTION_RULES.dialogue.maxSilentActorDrivenRatio),
  );
  let intentionalBudget = maxIntentional;

  const newPanels = plan.panels.map((panel) => {
    if (panel.isCutaway) return panel;
    if (panel.textPlan.mode !== "silent") return panel;

    const beat = beatById.get(panel.beatId);
    const storyHint = [beat?.dramaticChange, beat?.summary, panel.purpose].filter(Boolean).join(" ").trim();

    if (intentionalBudget > 0 && (beat?.hasTension || beat?.hasEmotion)) {
      intentionalBudget -= 1;
      return {
        ...panel,
        purpose: panel.purpose?.trim() || `Silence narratif — ${storyHint.slice(0, 120) || "tension"}`,
        textPlan: {
          ...panel.textPlan,
          panelId: panel.panelId,
          mode: "intentional_silence" as const satisfies PanelNarrativeMode,
          reserveTextArea: false,
        },
      };
    }

    if (beat?.hasDialogue) {
      return {
        ...panel,
        textPlan: {
          panelId: panel.panelId,
          mode: "dialogue" as const satisfies PanelNarrativeMode,
          anchor: {
            speakerId: beat.involvedCharacters[0],
            reserveBubbleSpace: true,
          },
          reserveTextArea: true,
        },
      };
    }

    if (beat?.hasAction) {
      return {
        ...panel,
        textPlan: {
          panelId: panel.panelId,
          mode: "sfx" as const satisfies PanelNarrativeMode,
          sfx: ["FWOOM"],
          reserveTextArea: true,
        },
      };
    }

    return {
      ...panel,
      textPlan: {
        panelId: panel.panelId,
        mode: "narration" as const satisfies PanelNarrativeMode,
        text: (beat?.summary || panel.purpose || "…").slice(0, 140),
        reserveTextArea: true,
      },
    };
  });

  const metrics = computeCanonicalProductionMetrics(newPanels);
  return { ...plan, panels: newPanels, metrics };
}

export function qaCanonicalProductionPlan(plan: CanonicalChapterProductionPlan): ProductionQaResult {
  return runProductionPlanQa(plan);
}

export function autoRepairCanonicalPlan(plan: CanonicalChapterProductionPlan): {
  plan: CanonicalChapterProductionPlan;
  messages: string[];
} {
  const next = assignPanelTextAnchors(plan);
  const changed = JSON.stringify(next.panels) !== JSON.stringify(plan.panels);
  return { plan: next, messages: changed ? ["assignPanelTextAnchors"] : [] };
}

export function qaCanonicalProductionPlanWithAutoRepair(plan: CanonicalChapterProductionPlan): {
  plan: CanonicalChapterProductionPlan;
  qa: ProductionQaResult;
  repairLog: string[];
} {
  let current = plan;
  let qa = runProductionPlanQa(current);
  const repairLog: string[] = [];

  if (!qa.valid) {
    const { plan: repaired, messages } = autoRepairCanonicalPlan(current);
    if (messages.length > 0) {
      repairLog.push(...messages);
      current = repaired;
      qa = runProductionPlanQa(current);
    }
    if (qa.valid) {
      console.warn("[canonical-plan] qa_repaired", repairLog.join(", ") || "noop");
    } else {
      console.error("[canonical-plan] qa_failed", qa.errors.join(" | "));
    }
  } else {
    console.info("[canonical-plan] qa_ok");
  }

  return { plan: current, qa, repairLog };
}

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

    beatPlans.push(buildBeatPlan(beat, panelIdsForBeat, input.knownNpcGroups, input.knownCharacters));
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
    qa: { valid: false, warnings: [], errors: [], details: {} as any },
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  };

  const partialPlan = assignPanelTextAnchors(partialPlanBare);
  console.info("[canonical-plan] built", { chapterId: input.chapterId, panels: partialPlan.panels.length });
  const { plan: finalPlan, qa: qaResult } = qaCanonicalProductionPlanWithAutoRepair(partialPlan);

  return {
    ...finalPlan,
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
