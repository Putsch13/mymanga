/**
 * StoryArc — Source de vérité narrative d'un chapitre.
 *
 * Produit par l'IA 1 (Story Architect, cf. story-architect-agent.ts), dans
 * la story-pass. Consommé par le Manga Editor (IA 2) dans storyboard-pass
 * pour produire un StoryboardPlan.
 *
 * Règles fortes :
 *   - un StoryArc ne contient JAMAIS de prompt image
 *   - un StoryArc ne décide PAS du découpage en pages / panels
 *   - un StoryArc décrit uniquement : histoire, beats, continuité
 */

import type { ContinuityState } from "./continuity-state";

export type StoryBeatType =
  | "setup"
  | "infiltration"
  | "dialogue_tension"
  | "surveillance"
  | "reveal"
  | "combat"
  | "aftermath"
  | "transition"
  | "cliffhanger";

export type StoryBeatDangerLevel = "low" | "medium" | "high" | "critical";

export interface StoryBeatContinuityEffects {
  stateChanges: string[];
  itemsIntroduced: string[];
  informationLearned: string[];
}

export interface StoryBeat {
  beatId: string;
  order: number;
  type: StoryBeatType;
  purpose: string;
  storyEvent: string;
  locationId: string | null;
  locationName: string;
  charactersPresent: string[];
  emotionalTurn: string;
  dialogueIntent: string | null;
  mustReveal: string[];
  mustPreserve: string[];
  mustNotInvent: string[];
  dangerLevel: StoryBeatDangerLevel;
  continuityEffects: StoryBeatContinuityEffects;
}

export interface StoryArc {
  chapterId: string;
  chapterNumber: number;
  title: string;
  summary: string;
  chapterGoal: string;
  cliffhanger: string;
  continuityBefore: ContinuityState;
  continuityAfter: ContinuityState;
  beats: StoryBeat[];
}

export const STORY_BEAT_TYPES: readonly StoryBeatType[] = [
  "setup",
  "infiltration",
  "dialogue_tension",
  "surveillance",
  "reveal",
  "combat",
  "aftermath",
  "transition",
  "cliffhanger",
] as const;
