/**
 * story-architect-agent-llm — appel LLM réel pour l'IA1 (Story Architect).
 *
 * COMMIT H — le stub `runStoryArchitectAgent` recyclait 9 beats génériques
 * (setup, infiltration, dialogue_tension, surveillance, reveal, combat,
 * aftermath, transition, cliffhanger) indépendamment de l'intention
 * utilisateur. Tous les chapitres finissaient structurellement pareils.
 *
 * Cet agent LLM construit un vrai StoryArc en lisant l'intent + le bundle
 * narratif et en demandant à OpenAI de produire 6–10 beats explicitement
 * motivés (storyEvent, emotion, continuityEffects). Retombe sur le stub
 * en cas de :
 *   - pas de OPENAI_API_KEY
 *   - réponse LLM invalide / non parsable
 *   - beats produits < 4 (plancher minimum)
 *
 * Règles système strictes encodées dans le prompt :
 *   - JAMAIS inventer de personnages / lieux absents de la fiche projet
 *   - CHAQUE beat doit avoir un storyEvent concret (pas "avancer l'arc")
 *   - combat autorisé UNIQUEMENT si le userIntent/summary le mentionne
 *   - danger/emotion cohérents avec le genre et l'intention
 */

import OpenAI from "openai";
import type { ContinuityState } from "../contracts/continuity-state";
import { createEmptyContinuityState } from "../contracts/continuity-state";
import type {
  StoryArc,
  StoryBeat,
  StoryBeatDangerLevel,
  StoryBeatType,
} from "../contracts/story-arc";
import { STORY_BEAT_TYPES } from "../contracts/story-arc";
import {
  runStoryArchitectAgent,
  type StoryArchitectInput,
  type StoryArchitectOutput,
} from "./story-architect-agent";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BEAT_TYPE_SET: ReadonlySet<string> = new Set(STORY_BEAT_TYPES);
const DANGER_SET: ReadonlySet<StoryBeatDangerLevel> = new Set<StoryBeatDangerLevel>([
  "low",
  "medium",
  "high",
  "critical",
]);

const SYSTEM_PROMPT = `You are a veteran story architect for serialized manga / webtoon.

Your ONLY job: transform a chapter intent + continuity into a StoryArc — an ORDERED list
of 6 to 10 beats (each with a concrete storyEvent, location, characters, emotion, danger,
continuity effects), plus chapterGoal and cliffhanger.

ABSOLUTE RULES — violations invalidate the output:
1. NEVER invent characters, creatures, locations, or props that are NOT in the project
   fiche (mainCharacters + locations provided below). If the user intent invents a new
   entity, you MUST reuse an existing one from the fiche instead.
2. NEVER invent a combat, fire, explosion, or lethal event if it is NOT explicitly
   requested in the user intent / summary.
3. Each beat MUST have a STORYCONCRETE storyEvent (what actually happens in one line),
   not a meta-description ("avancer l'arc" / "créer du mystère" are forbidden).
4. Continuity effects per beat MUST be honest: if nothing changes, leave arrays empty.
   Never fabricate stateChanges to look complete.
5. Emotional turn must be a single short label (e.g. "tension", "relief", "betrayal")
   — not a paragraph.
6. Each beat gets a dangerLevel in {low,medium,high,critical} that MATCHES the
   event severity. Don't put "critical" on a dialogue scene. Use "low" for calm beats.
7. The cliffhanger MUST be rooted in the last beat's continuityEffects, not invented.

Output: STRICT JSON matching the schema below. No prose, no markdown.`;

function buildUserPrompt(input: StoryArchitectInput): string {
  const title = input.title?.trim() || `Chapitre ${input.chapterNumber}`;
  const summary = input.summary?.trim() || "";
  const userIntent = input.userIntent?.trim() || "";
  const targetBeats = input.targetBeatCount ?? 8;
  const chars = (input.mainCharacters ?? [])
    .map((c) => `- id=${c.id} name="${c.name}" role=${c.roleType ?? "?"}`)
    .join("\n");
  const locs = (input.locations ?? [])
    .map((l) => `- id=${l.id ?? "null"} name="${l.name}"`)
    .join("\n");

  return `CHAPTER:
- number: ${input.chapterNumber}
- title: "${title}"
- targetBeatCount: ${targetBeats}

USER INTENT (what the author asked for):
"""${userIntent || "(empty — infer from summary)"}"""

SUMMARY:
"""${summary || "(empty)"}"""

PROJECT CHARACTERS (fiche — the ONLY allowed named entities):
${chars || "(none — use generic 'protagonist' but still constrained to what exists)"}

KNOWN LOCATIONS:
${locs || "(none — stay abstract, no invented real-world places)"}

Return exactly this JSON shape:
{
  "chapterId": "${input.chapterId}",
  "chapterNumber": ${input.chapterNumber},
  "title": "...",
  "summary": "...",
  "chapterGoal": "one sentence articulating what this chapter accomplishes in the arc",
  "cliffhanger": "...",
  "beats": [
    {
      "beatId": "${input.chapterId}-beat-N",
      "order": N,
      "type": "${STORY_BEAT_TYPES.join("|")}",
      "purpose": "short editorial purpose label",
      "storyEvent": "one concrete sentence",
      "locationId": string | null,
      "locationName": string,
      "charactersPresent": string[],
      "emotionalTurn": "short label",
      "dialogueIntent": string | null,
      "mustReveal": string[],
      "mustPreserve": string[],
      "mustNotInvent": string[],
      "dangerLevel": "low|medium|high|critical",
      "continuityEffects": {
        "stateChanges": string[],
        "itemsIntroduced": string[],
        "informationLearned": string[]
      }
    }
  ]
}`;
}

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

function sanitizeStoryArc(
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

/**
 * COMMIT H — entry point LLM du Story Architect (IA1).
 *
 * Tente un appel OpenAI. Si indisponible ou invalide, délègue au stub
 * déterministe `runStoryArchitectAgent` et marque un warning
 * `story_architect.llm.degraded=…`.
 */
export async function runStoryArchitectAgentLlm(
  input: StoryArchitectInput,
): Promise<StoryArchitectOutput> {
  const warnings: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    warnings.push("story_architect.llm.degraded=OPENAI_API_KEY_missing");
    const fallback = await runStoryArchitectAgent(input);
    return {
      storyArc: fallback.storyArc,
      warnings: [...warnings, ...fallback.warnings],
    };
  }

  const continuityBefore = input.continuityBefore ?? createEmptyContinuityState();

  try {
    const model = process.env.STORY_ARCHITECT_MODEL ?? "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const storyArc = sanitizeStoryArc(parsed, input, continuityBefore);

    if (storyArc.beats.length < 4) {
      warnings.push(
        `story_architect.llm.low_beat_count=${storyArc.beats.length} (fallback_to_stub)`,
      );
      const fallback = await runStoryArchitectAgent(input);
      return {
        storyArc: fallback.storyArc,
        warnings: [...warnings, ...fallback.warnings],
      };
    }

    return { storyArc, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`story_architect.llm.error=${msg}`);
    const fallback = await runStoryArchitectAgent(input);
    return {
      storyArc: fallback.storyArc,
      warnings: [...warnings, ...fallback.warnings],
    };
  }
}
