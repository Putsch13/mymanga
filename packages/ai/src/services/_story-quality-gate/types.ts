/**
 * Types publics du quality gate (story / panel / scene).
 */
import type { GenreDirectorMode } from "../genre-director";

export type StoryQualityIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sceneIndex?: number;
};

/**
 * Patch narratif léger suggéré ou appliqué automatiquement par le quality gate.
 * Les patches auto-appliqués modifient directement le bundle ; les suggestions
 * restent dans le diagnostic.
 */
export type NarrativePatch = {
  type:
    | "strengthen_cliffhanger"
    | "inject_micro_turn"
    | "add_payoff_hint"
    | "add_breathing_beat"
    | "mark_weak_scene"
    | "add_reveal_beat";
  targetSceneIndex?: number;
  targetBeatIndex?: number;
  description: string;
  /** Valeur appliquée (ex: texte du cliffhanger renforcé) */
  appliedValue?: string;
  /** true si le patch a été appliqué automatiquement au bundle */
  autoApplied: boolean;
};

export type StoryQualityReport = {
  passed: boolean;
  overallScore: number;
  issues: StoryQualityIssue[];
  causalityScore: number;
  beatVarietyScore: number;
  microTurnsScore: number;
  cliffhangerScore: number;
  payoffScore: number;
  breathingScore: number;
  sceneUtilityScore: number;
  characterFunctionScore: number;
  /** Patches suggérés mais non appliqués automatiquement */
  suggestedPatches: NarrativePatch[];
  /** Patches appliqués automatiquement au bundle */
  autoAppliedPatches: NarrativePatch[];
  /** Mode genre utilisé pour orienter les patches */
  genreMode: GenreDirectorMode;
};

export interface PanelQualityIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  autoFixable: boolean;
}

export interface PanelQualityReport {
  passed: boolean;
  score: number;
  issues: PanelQualityIssue[];
  reviewFlags: string[];
  blockReasons: string[];
  sfxCoherenceOk: boolean;
  beatAlignmentOk: boolean;
  lookConsistencyOk: boolean;
}

export interface SceneQualityReport {
  passed: boolean;
  score: number;
  issues: PanelQualityIssue[];
  reviewFlags: string[];
  lookConsistencyScore: number;
  castConsistencyScore: number;
  sceneContinuityScore: number;
}
