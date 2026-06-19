/**
 * Parsing et validation de la réponse LLM du Story Architect.
 */

import type { ContinuityState } from "../../contracts/continuity-state";
import type {
  StoryArc,
  StoryBeat,
  StoryBeatDangerLevel,
  StoryBeatType,
} from "../../contracts/story-arc";
import { STORY_BEAT_TYPES } from "../../contracts/story-arc";
import type { StoryArchitectInput } from "../story-architect-agent";

const BEAT_TYPE_SET: ReadonlySet<string> = new Set(STORY_BEAT_TYPES);
const DANGER_SET: ReadonlySet<StoryBeatDangerLevel> = new Set<StoryBeatDangerLevel>([
  "low",
  "medium",
  "high",
  "critical",
]);

function sanitizeBeatType(raw: unknown): StoryBeatType {
  if (typeof raw === "string" && BEAT_TYPE_SET.has(raw)) return raw as StoryBeatType;
  return "setup";
}

function sanitizeDanger(raw: unknown): StoryBeatDangerLevel {
  if (typeof raw === "string" && DANGER_SET.has(raw as StoryBeatDangerLevel)) {
    return raw as StoryBeatDangerLevel;
  }
  return "low";
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string" && s.length > 0);
}

function sanitizeBeat(
  raw: Record<string, unknown>,
  chapterId: string,
  order: number,
): StoryBeat {
  const effectsRaw = raw.continuityEffects as Record<string, unknown> | undefined;
  return {
    beatId:
      typeof raw.beatId === "string" && raw.beatId.length > 0
        ? raw.beatId
        : `${chapterId}-beat-${order}`,
    order,
    type: sanitizeBeatType(raw.type),
    purpose: typeof raw.purpose === "string" ? raw.purpose : "",
    storyEvent: typeof raw.storyEvent === "string" ? raw.storyEvent : "",
    locationId: typeof raw.locationId === "string" ? raw.locationId : null,
    locationName: typeof raw.locationName === "string" ? raw.locationName : "",
    charactersPresent: sanitizeStringArray(raw.charactersPresent),
    emotionalTurn: typeof raw.emotionalTurn === "string" ? raw.emotionalTurn : "neutral",
    dialogueIntent:
      typeof raw.dialogueIntent === "string" && raw.dialogueIntent.length > 0
        ? raw.dialogueIntent
        : null,
    mustReveal: sanitizeStringArray(raw.mustReveal),
    mustPreserve: sanitizeStringArray(raw.mustPreserve),
    mustNotInvent: sanitizeStringArray(raw.mustNotInvent),
    dangerLevel: sanitizeDanger(raw.dangerLevel),
    continuityEffects: {
      stateChanges: sanitizeStringArray(effectsRaw?.stateChanges),
      itemsIntroduced: sanitizeStringArray(effectsRaw?.itemsIntroduced),
      informationLearned: sanitizeStringArray(effectsRaw?.informationLearned),
    },
  };
}

export function sanitizeStoryArc(
  raw: Record<string, unknown>,
  input: StoryArchitectInput,
  continuityBefore: ContinuityState,
): StoryArc {
  const beatsRaw = Array.isArray(raw.beats) ? raw.beats : [];
  const beats: StoryBeat[] = beatsRaw
    .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
    .map((b, idx) => sanitizeBeat(b, input.chapterId, idx + 1));

  const continuityAfter: ContinuityState = {
    ...continuityBefore,
    lastKnownEvents: [
      ...continuityBefore.lastKnownEvents,
      `chapter_${input.chapterNumber}_end`,
    ],
  };

  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title:
      (typeof raw.title === "string" && raw.title.trim()) ||
      input.title?.trim() ||
      `Chapitre ${input.chapterNumber}`,
    summary:
      (typeof raw.summary === "string" && raw.summary.trim()) ||
      input.summary?.trim() ||
      input.userIntent?.trim() ||
      "",
    chapterGoal:
      typeof raw.chapterGoal === "string" && raw.chapterGoal.trim()
        ? raw.chapterGoal
        : `Avancer l'arc narratif du chapitre ${input.chapterNumber}`,
    cliffhanger: typeof raw.cliffhanger === "string" ? raw.cliffhanger : "",
    continuityBefore,
    continuityAfter,
    beats,
  };
}

export function validatePremiumStoryArcConstraints(
  storyArc: StoryArc,
  input: StoryArchitectInput,
): void {
  const allowed = new Set<string>();
  for (const c of input.mainCharacters ?? []) {
    const id = typeof c.id === "string" ? c.id.trim() : "";
    const nm = typeof c.name === "string" ? c.name.trim() : "";
    if (id) {
      allowed.add(id);
      allowed.add(id.toLowerCase());
    }
    if (nm) {
      allowed.add(nm);
      allowed.add(nm.toLowerCase());
    }
  }

  const intentHay = `${input.userIntent ?? ""} ${input.summary ?? ""}`.toLowerCase();
  const globalCombatHint =
    /\b(combat|fight|battle|duel|affront|bataille|attaque|défend|defend|épée|sword|boxe|gunfight|melee)\b/i.test(
      intentHay,
    );

  for (const beat of storyArc.beats) {
    for (const token of beat.charactersPresent) {
      const t = token.trim();
      if (!t) continue;
      if (allowed.size === 0) continue;
      if (!allowed.has(t) && !allowed.has(t.toLowerCase())) {
        throw new Error(`premium_story_architect_invented_character:${t}`);
      }
    }
    if (beat.type === "combat") {
      const localHay = `${beat.storyEvent} ${beat.purpose}`.toLowerCase();
      const localCombatHint =
        /\b(fight|combat|attack|strike|hit|slash|punch|battle|duel|weapon|épée|sword|gun)\b/i.test(localHay);
      if (!globalCombatHint && !localCombatHint) {
        throw new Error("premium_story_architect_combat_without_intent");
      }
    }
  }
}
