/**
 * Types publics du moteur d'autofill chapitre.
 * Centralisés ici pour pouvoir être consommés par les sous-modules
 * (`prompt-builder`, `fallback`, `rewrite-beat`, `normalize-patch`) sans
 * créer de cycle avec la façade `chapter-autofill-engine.ts`.
 */
import type { ChapterStudioData, AutofillMeta } from "@manga-ai-studio/core";
import type { ProjectContextForChapter } from "../../chapter/shared-types";

export type AutofillMode =
  | "brief"
  | "cast_canon"
  | "plan"
  | "all_missing"
  | "repair_readiness"
  // BUG-16 : mode de réécriture ciblée d'un seul beat (préserve les autres).
  // Nécessite `targetBeatId` et accepte `userInstructions` en texte libre.
  | "rewrite_beat";

export type AutofillFieldProvenance = {
  field: string;
  source:
    | "story_bible"
    | "previous_chapters"
    | "characters"
    | "project_settings"
    | "inference"
    | "default";
  confidence: number;
};

export type AutofillResult = {
  suggestedPatch: Partial<ChapterStudioData>;
  assumptions: string[];
  confidence: number;
  unresolvedQuestions: string[];
  appliedFields: string[];
  provenance: AutofillFieldProvenance[];
  meta: AutofillMeta;
};

export type AutofillInput = {
  mode: AutofillMode;
  currentData: Partial<ChapterStudioData>;
  context: ProjectContextForChapter;
  force?: boolean;
  selectedPlotLabel?: string | null;
  // BUG-16 : cibles pour mode="rewrite_beat"
  targetBeatId?: string;
  userInstructions?: string;
};
