import type {
  CutawayType,
  PanelBlueprintPremium,
  SubjectFocus,
} from "@manga-ai-studio/core";

export interface ChapterShotPlanInput {
  projectTitle?: string | null;
  chapterTitle?: string | null;
  blueprints: ReadonlyArray<PanelBlueprintPremium>;
}

export interface ShotPlanEntry {
  panelNumber: number;
  pageNumber: number | null;
  /** Ligne narrative courte et lisible (1-liner). */
  headline: string;
  /** Catégorie lisible : "heros principal", "plan de coupe", "plan decor", "insert prop", etc. */
  category: ShotCategory;
  subjectFocus: SubjectFocus;
  shotType: string;
  cutawayType: CutawayType;
  /** Le panel est-il critique pour le contrat narratif (arme, ennemi reveal, décor clef) ? */
  contractualCritical: boolean;
  criticality: "low" | "medium" | "high" | "critical";
}

export type ShotCategory =
  | "hero_lead"
  | "hero_duo"
  | "enemy_focus"
  | "ally_focus"
  | "npc_focus"
  | "group_or_crowd"
  | "environment_wide"
  | "environment_insert"
  | "prop_insert"
  | "reaction_cutaway"
  | "aftermath"
  | "dialogue_anchor"
  | "other";

export interface ShotPlanReliability {
  /** Score 0-1 : 1 = plan équilibré, 0 = plan monotone et cassé. */
  score: number;
  /** Le plan peut-il partir en génération ? Si false, la launch doit bloquer. */
  launchAllowed: boolean;
  /** Liste d'alertes humainement compréhensibles. */
  warnings: ShotPlanWarning[];
  /** Blocages durs qui empêchent la launch. */
  blockers: ShotPlanWarning[];
}

export interface ShotPlanWarning {
  code: string;
  message: string;
  /** "blocking" = empêche la launch. "warning" = signal mais launch ok. */
  severity: "blocking" | "warning";
}

export interface ShotPlanDistribution {
  totalPanels: number;
  byCategory: Record<ShotCategory, number>;
  heroLeadRatio: number;
  cutawayRatio: number;
  uniqueShotTypes: number;
  environmentPanels: number;
  npcPanels: number;
  propInsertPanels: number;
  reactionPanels: number;
}

export interface ChapterShotPlan {
  projectTitle: string | null;
  chapterTitle: string | null;
  entries: ShotPlanEntry[];
  distribution: ShotPlanDistribution;
  reliability: ShotPlanReliability;
  /** Rendu texte humainement lisible du plan (pour UI / logs / export). */
  humanReadable: string;
}

export type NarrativeCutawayType =
  | "foreshadowing"
  | "danger_signal"
  | "emotion_detail"
  | "prop_continuity"
  | "environment_escalation"
  | "silent_beat";

export interface NarrativeCutawayPanel {
  id: string;
  beatId: string;
  eventId: string;
  type: NarrativeCutawayType;
  subject: string;
  narrativePurpose: string;
  mustReference: string[];
}

export interface CutawayPlan {
  panels: NarrativeCutawayPanel[];
  coverageByBeat: Record<string, number>;
}

export interface CutawayQaResult {
  ok: boolean;
  totalBeats: number;
  beatsWithCutaway: number;
  beatsWithoutCutaway: string[];
  warnings: string[];
}
