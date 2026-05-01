/**
 * canonical-production-plan.ts — Source de vérité unique pour la structure du chapitre.
 *
 * RÈGLE ABSOLUE: Cet objet est utilisé par:
 * - L'estimation
 * - La prévisualisation
 * - Le lancement premium
 * - La génération
 * - La QA
 * - Le lecteur
 * - Les écrans admin/debug
 *
 * Aucune autre structure de plan ne doit exister. Si une logique reconstruit
 * un plan ailleurs, elle doit être supprimée et remplacée par un appel à ce module.
 */

import { z } from "zod";
import type { CharacterVisualDna, EnvironmentVisualDna, NpcVisualDna } from "../types/generation-debug-snapshot";
import type { BlueprintPropVisualDna } from "../types/narrative-facts";
import { PRODUCTION_RULES, type ChapterFormat } from "./production-rules";

export type PanelRole =
  | "hero"
  | "duo"
  | "enemy"
  | "reaction"
  | "action"
  | "environment"
  | "prop"
  | "npc"
  | "group"
  | "aftermath"
  | "transition"
  | "cutaway"
  | "speaker"
  | "listener";

export type PanelNarrativeMode =
  | "dialogue"
  | "narration"
  | "thought"
  | "sfx"
  | "silent"
  /** Silence volontaire avec intention narrative documentée (`purpose` / notes). */
  | "intentional_silence";

export type DialogueAnchorPosition = "top" | "bottom" | "left" | "right" | "center";

export interface DialogueAnchorPlan {
  speakerId?: string;
  speakerName?: string;
  targetCharacterId?: string;
  positionHint?: DialogueAnchorPosition;
  text?: string;
  reserveBubbleSpace: boolean;
}

export interface PanelTextPlan {
  panelId: string;
  mode: PanelNarrativeMode;
  anchor?: DialogueAnchorPlan;
  text?: string;
  sfx?: string[];
  reserveTextArea: boolean;
}

export interface CanonicalPanelPlan {
  panelId: string;
  beatId: string;
  panelIndex: number;
  pageNumber: number;
  panelNumberInPage: number;

  role: PanelRole;
  isCutaway: boolean;
  isActorDriven: boolean;

  purpose: string;
  shotType: string;
  cameraAngle: string;
  subjectFocus: string;
  secondaryFocus?: string;

  requiredCharacterIds: string[];
  mustShowCharacterIds: string[];
  mayShowCharacterIds: string[];
  requiredEntityIds: string[];

  mustShowEnemy: boolean;
  requiredNpcCount: number;

  requiredProps: Array<{
    id: string;
    canonicalName: string;
    mustBeVisible: boolean;
  }>;

  requiredLocationSignals: string[];

  textPlan: PanelTextPlan;

  criticality: "low" | "medium" | "high" | "critical";
  notes: string[];

  /** Porté depuis les blueprints premium (reconstruction plan) — merge raw/canon. */
  characterVisualDna?: CharacterVisualDna[];
  npcVisualDna?: NpcVisualDna[];
  environmentVisualDna?: EnvironmentVisualDna | null;
  propVisualDna?: BlueprintPropVisualDna[];
  continuityObjectIds?: string[];
}

export interface CanonicalBeatPlan {
  beatId: string;
  beatIndex: number;
  summary: string;
  narrativeFunction: string;
  dramaticChange: string;

  involvedCharacters: string[];
  environmentContext: string[];

  targetPanelCount: number;
  actualPanelCount: number;
  panelIds: string[];

  hasDialogue: boolean;
  hasAction: boolean;
  hasEmotion: boolean;
  hasTension: boolean;
  /** Libellés non résolus (catalogue) — signal QA explicite */
  unresolvedCharacterRefs: string[];
}

export interface ProductionRhythmMetrics {
  cutawayMaxRatio: number;
  actorDrivenMinRatio: number;
  maxConsecutiveCutaways: number;
  pattern: readonly number[];
  cutawayInsertionPolicy: string;
}

export interface ProductionQaResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  details: {
    cutawayRatioOk: boolean;
    actorDrivenRatioOk: boolean;
    consecutiveCutawaysOk: boolean;
    beatCoverageOk: boolean;
    dialogueCoverageOk: boolean;
    panelCountOk: boolean;
  };
}

export interface ProductionMetrics {
  totalPanels: number;
  totalBeats: number;
  totalPages: number;

  cutawayCount: number;
  cutawayRatio: number;

  actorDrivenCount: number;
  actorDrivenRatio: number;

  heroCount: number;
  duoCount: number;
  enemyCount: number;
  reactionCount: number;
  actionCount: number;
  environmentCount: number;
  propCount: number;
  npcCount: number;
  groupCount: number;

  dialogueAnchoredCount: number;
  dialogueFloatingCount: number;
  narrationCount: number;
  silentCount: number;
  intentionalSilenceCount: number;
  sfxCount: number;

  maxConsecutiveCutaways: number;

  focusDistribution: Record<string, number>;
  shotDistribution: Record<string, number>;
  roleDistribution: Record<PanelRole, number>;
}

export interface CanonicalChapterProductionPlan {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string;

  format: ChapterFormat;

  targetPanelCount: number;
  minimumPanelCount: number;
  maximumPanelCount: number;
  idealPanelCount: number;

  beatCount: number;
  pageCount: number;

  beats: CanonicalBeatPlan[];
  panels: CanonicalPanelPlan[];

  rhythm: ProductionRhythmMetrics;
  metrics: ProductionMetrics;
  qa: ProductionQaResult;

  createdAt: string;
  version: string;
}

export const canonicalPanelPlanSchema = z.object({
  panelId: z.string(),
  beatId: z.string(),
  panelIndex: z.number().int().min(0),
  pageNumber: z.number().int().min(1),
  panelNumberInPage: z.number().int().min(1),
  role: z.enum([
    "hero", "duo", "enemy", "reaction", "action", "environment",
    "prop", "npc", "group", "aftermath", "transition", "cutaway",
    "speaker", "listener",
  ]),
  isCutaway: z.boolean(),
  isActorDriven: z.boolean(),
  purpose: z.string(),
  shotType: z.string(),
  cameraAngle: z.string(),
  subjectFocus: z.string(),
  secondaryFocus: z.string().optional(),
  requiredCharacterIds: z.array(z.string()),
  mustShowCharacterIds: z.array(z.string()),
  mayShowCharacterIds: z.array(z.string()),
  requiredEntityIds: z.array(z.string()),
  mustShowEnemy: z.boolean(),
  requiredNpcCount: z.number().int().min(0),
  requiredProps: z.array(z.object({
    id: z.string(),
    canonicalName: z.string(),
    mustBeVisible: z.boolean(),
  })),
  requiredLocationSignals: z.array(z.string()),
  textPlan: z.object({
    panelId: z.string(),
    mode: z.enum(["dialogue", "narration", "thought", "sfx", "silent", "intentional_silence"]),
    anchor: z.object({
      speakerId: z.string().optional(),
      speakerName: z.string().optional(),
      targetCharacterId: z.string().optional(),
      positionHint: z.enum(["top", "bottom", "left", "right", "center"]).optional(),
      text: z.string().optional(),
      reserveBubbleSpace: z.boolean(),
    }).optional(),
    text: z.string().optional(),
    sfx: z.array(z.string()).optional(),
    reserveTextArea: z.boolean(),
  }),
  criticality: z.enum(["low", "medium", "high", "critical"]),
  notes: z.array(z.string()),
  characterVisualDna: z.array(z.any()).optional(),
  npcVisualDna: z.array(z.any()).optional(),
  environmentVisualDna: z.any().nullable().optional(),
  propVisualDna: z.array(z.any()).optional(),
  continuityObjectIds: z.array(z.string()).optional(),
});

export const canonicalChapterProductionPlanSchema = z.object({
  chapterId: z.string(),
  projectId: z.string(),
  chapterNumber: z.number().int().min(1),
  chapterTitle: z.string(),
  format: z.enum(["manga", "webtoon"]),
  targetPanelCount: z.number().int().min(1),
  minimumPanelCount: z.number().int().min(1),
  maximumPanelCount: z.number().int().min(1),
  idealPanelCount: z.number().int().min(1),
  beatCount: z.number().int().min(0),
  pageCount: z.number().int().min(1),
  beats: z.array(z.any()),
  panels: z.array(canonicalPanelPlanSchema),
  rhythm: z.object({
    cutawayMaxRatio: z.number(),
    actorDrivenMinRatio: z.number(),
    maxConsecutiveCutaways: z.number().int(),
    pattern: z.array(z.number()),
    cutawayInsertionPolicy: z.string(),
  }),
  metrics: z.any(),
  qa: z.object({
    valid: z.boolean(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    details: z.any(),
  }),
  createdAt: z.string(),
  version: z.string(),
});

export function createEmptyProductionPlan(
  chapterId: string,
  projectId: string,
  format: ChapterFormat = "manga",
): CanonicalChapterProductionPlan {
  return {
    chapterId,
    projectId,
    chapterNumber: 1,
    chapterTitle: "",
    format,
    targetPanelCount: PRODUCTION_RULES.panelCount.target,
    minimumPanelCount: PRODUCTION_RULES.panelCount.minimum,
    maximumPanelCount: PRODUCTION_RULES.panelCount.maximum,
    idealPanelCount: PRODUCTION_RULES.panelCount.target,
    beatCount: 0,
    pageCount: 0,
    beats: [],
    panels: [],
    rhythm: {
      cutawayMaxRatio: PRODUCTION_RULES.cutaway.maxRatio,
      actorDrivenMinRatio: PRODUCTION_RULES.actorDriven.minRatio,
      maxConsecutiveCutaways: PRODUCTION_RULES.cutaway.maxConsecutive,
      pattern: [...PRODUCTION_RULES.rhythm.preferredNarrativePattern],
      cutawayInsertionPolicy: PRODUCTION_RULES.rhythm.cutawayInsertionPolicy,
    },
    metrics: createEmptyMetrics(),
    qa: { valid: false, warnings: [], errors: ["Plan not yet built"], details: createEmptyQaDetails() },
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  };
}

function createEmptyMetrics(): ProductionMetrics {
  return {
    totalPanels: 0,
    totalBeats: 0,
    totalPages: 0,
    cutawayCount: 0,
    cutawayRatio: 0,
    actorDrivenCount: 0,
    actorDrivenRatio: 0,
    heroCount: 0,
    duoCount: 0,
    enemyCount: 0,
    reactionCount: 0,
    actionCount: 0,
    environmentCount: 0,
    propCount: 0,
    npcCount: 0,
    groupCount: 0,
    dialogueAnchoredCount: 0,
    dialogueFloatingCount: 0,
    narrationCount: 0,
    silentCount: 0,
    intentionalSilenceCount: 0,
    sfxCount: 0,
    maxConsecutiveCutaways: 0,
    focusDistribution: {},
    shotDistribution: {},
    roleDistribution: {
      hero: 0, duo: 0, enemy: 0, reaction: 0, action: 0,
      environment: 0, prop: 0, npc: 0, group: 0, aftermath: 0,
      transition: 0, cutaway: 0, speaker: 0, listener: 0,
    },
  };
}

function createEmptyQaDetails() {
  return {
    cutawayRatioOk: false,
    actorDrivenRatioOk: false,
    consecutiveCutawaysOk: false,
    beatCoverageOk: false,
    dialogueCoverageOk: false,
    panelCountOk: false,
  };
}
