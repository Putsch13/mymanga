/**
 * Story Architect Agent (IA 1).
 *
 * Mission : transformer l'intention du chapitre + la continuité en
 * StoryArc (beats + continuité avant/après + cliffhanger).
 *
 * Sprint 1 : implémentation minimale (déterministe, pas de LLM) qui
 * construit un StoryArc valide à partir du bundle narratif existant ou
 * d'une entrée minimaliste. Le prompt LLM strict sera branché dans un
 * sprint ultérieur (Sprint 3 — vrai agent éditorial).
 */

import type { StoryArc, StoryBeat } from "../contracts/story-arc";
import {
  createEmptyContinuityState,
  type ContinuityState,
} from "../contracts/continuity-state";

export interface StoryArchitectInput {
  chapterId: string;
  chapterNumber: number;
  title: string | null | undefined;
  userIntent: string | null | undefined;
  summary?: string | null;
  targetBeatCount?: number;
  continuityBefore?: ContinuityState | null;
  mainCharacters?: Array<{ id: string; name: string; roleType?: string | null }>;
  locations?: Array<{ id: string | null; name: string }>;
}

export interface StoryArchitectOutput {
  storyArc: StoryArc;
  warnings: string[];
}

export async function runStoryArchitectAgent(
  input: StoryArchitectInput,
): Promise<StoryArchitectOutput> {
  const warnings: string[] = [];
  const title = input.title?.trim() || `Chapitre ${input.chapterNumber}`;
  const summary = input.summary?.trim() || input.userIntent?.trim() || "";
  const targetBeats = clamp(input.targetBeatCount ?? 8, 4, 16);

  const continuityBefore = input.continuityBefore ?? createEmptyContinuityState();
  const continuityAfter: ContinuityState = {
    ...continuityBefore,
    lastKnownEvents: [...continuityBefore.lastKnownEvents, `chapter_${input.chapterNumber}_end`],
  };

  const locationName = input.locations?.[0]?.name ?? "unknown_location";
  const charNames = input.mainCharacters?.map((c) => c.name) ?? [];

  const beats: StoryBeat[] = buildDefaultBeats({
    chapterId: input.chapterId,
    targetBeats,
    locationName,
    charNames,
    summary,
  });

  const storyArc: StoryArc = {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title,
    summary,
    chapterGoal: summary || `Avancer l'arc narratif du chapitre ${input.chapterNumber}`,
    cliffhanger: "",
    continuityBefore,
    continuityAfter,
    beats,
  };

  if (beats.length < 4) warnings.push("story_arc.beats_below_minimum");

  return { storyArc, warnings };
}

function buildDefaultBeats(args: {
  chapterId: string;
  targetBeats: number;
  locationName: string;
  charNames: string[];
  summary: string;
}): StoryBeat[] {
  const skeleton: Array<Pick<StoryBeat, "type" | "purpose">> = [
    { type: "setup", purpose: "installer la situation et les enjeux" },
    { type: "infiltration", purpose: "entrer dans la zone à risque" },
    { type: "dialogue_tension", purpose: "friction entre les personnages" },
    { type: "surveillance", purpose: "observer / collecter une info" },
    { type: "reveal", purpose: "dévoiler un élément clé" },
    { type: "combat", purpose: "confrontation directe" },
    { type: "aftermath", purpose: "conséquence émotionnelle" },
    { type: "transition", purpose: "bascule de scène" },
    { type: "cliffhanger", purpose: "laisser le lecteur en suspens" },
  ];
  const picked = skeleton.slice(0, args.targetBeats);
  return picked.map((b, idx) => ({
    beatId: `${args.chapterId}-beat-${idx + 1}`,
    order: idx + 1,
    type: b.type,
    purpose: b.purpose,
    storyEvent: args.summary
      ? `${b.purpose} — ${args.summary}`
      : b.purpose,
    locationId: null,
    locationName: args.locationName,
    charactersPresent: args.charNames,
    emotionalTurn: "tension",
    dialogueIntent: b.type === "dialogue_tension" ? "confrontation" : null,
    mustReveal: [],
    mustPreserve: [],
    mustNotInvent: [],
    dangerLevel: b.type === "combat" ? "high" : b.type === "cliffhanger" ? "medium" : "low",
    continuityEffects: {
      stateChanges: [],
      itemsIntroduced: [],
      informationLearned: [],
    },
  }));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
