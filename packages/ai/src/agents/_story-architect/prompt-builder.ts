/**
 * Construction du prompt système et utilisateur pour le Story Architect LLM.
 */

import { STORY_BEAT_TYPES } from "../../contracts/story-arc";
import type { StoryArchitectInput } from "../story-architect-agent";

export const SYSTEM_PROMPT = `You are a veteran story architect for serialized manga / webtoon.

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

function buildNarrativeContractSection(input: StoryArchitectInput): string {
  const nc = input.narrativeContract;
  if (!nc) return "";

  const sections: string[] = [];

  if (nc.requiredCharacters.length > 0) {
    const charIdToName = new Map(
      (input.mainCharacters ?? []).map((c) => [c.id, c.name]),
    );
    const charNames = nc.requiredCharacters
      .map((id) => charIdToName.get(id) ?? id)
      .filter((n) => n.trim().length > 0);
    if (charNames.length > 0) {
      sections.push(`PERSONNAGES REQUIS (doivent apparaître dans les beats) : ${charNames.join(", ")}`);
    }
  }

  if (nc.requiredLocations.length > 0) {
    sections.push(`LIEUX REQUIS (doivent être visités) : ${nc.requiredLocations.join(", ")}`);
  }

  if (nc.requiredEvents.length > 0) {
    const eventsDesc = nc.requiredEvents
      .slice(0, 8)
      .map((e) => {
        const dlg = e.requiredDialogue ? " [dialogue obligatoire]" : "";
        const loc = e.locationHint ? ` @${e.locationHint}` : "";
        return `- ${e.label}${dlg}${loc}`;
      })
      .join("\n");
    sections.push(`ÉVÉNEMENTS REQUIS (chacun doit être couvert par au moins un beat) :\n${eventsDesc}`);
  }

  if (nc.requiredNpcGroups && nc.requiredNpcGroups.length > 0) {
    const npcDesc = nc.requiredNpcGroups
      .slice(0, 6)
      .map((g) => {
        const dlg = g.requiredDialogue ? " [dialogue obligatoire]" : "";
        const mention = g.mustMention?.length ? ` (doit mentionner: ${g.mustMention.join(", ")})` : "";
        return `- ${g.label} (${g.role})${dlg}${mention}`;
      })
      .join("\n");
    sections.push(`GROUPES PNJ REQUIS :\n${npcDesc}`);
  }

  if (nc.forbiddenInventions.length > 0) {
    sections.push(`INTERDIT D'INVENTER : ${nc.forbiddenInventions.join(", ")}`);
  }

  if (sections.length === 0) return "";

  return `NARRATIVE CONTRACT (resolved from user intent — STRICT constraints):
${sections.join("\n\n")}

`;
}

export function buildUserPrompt(input: StoryArchitectInput): string {
  const title = input.title?.trim() || `Chapitre ${input.chapterNumber}`;
  const summary = input.summary?.trim() || "";
  const userIntent = input.userIntent?.trim() || "";
  const targetBeats = input.targetBeatCount ?? 8;
  const chars = (input.mainCharacters ?? [])
    .map((c) => `- id=${c.id} name="${c.name}" role=${c.roleType ?? "?"}`)
    .join("\n");
  const locs = (input.locations ?? [])
    .map((l) => {
      const head = `- id=${l.id ?? "null"} name="${l.name}"`;
      const bits: string[] = [];
      if (l.type?.trim()) bits.push(`type=${l.type.trim()}`);
      if (l.description?.trim()) {
        const d = l.description.trim();
        bits.push(`desc=${d.length > 180 ? `${d.slice(0, 180)}…` : d}`);
      }
      const vb = [l.visualBrief, l.establishedVisualBrief]
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .join(" | ");
      if (vb) bits.push(`brief=${vb.length > 160 ? `${vb.slice(0, 160)}…` : vb}`);
      if (l.aliases?.length) bits.push(`aliases=${l.aliases.slice(0, 6).join(", ")}`);
      if (l.canonLocked === true) bits.push("canon_locked=true");
      if (bits.length === 0) return head;
      return `${head}\n  ${bits.join(" | ")}`;
    })
    .join("\n");

  const era = input.era?.trim() || "";
  const setting = input.setting?.trim() || "";
  const eraSettingBlock =
    era || setting
      ? `SETTING & ERA (HARD ANCHOR — every beat, location, costume and prop MUST be coherent with this; never introduce anachronistic or out-of-setting elements):
${era ? `- era / period: ${era}` : ""}${era && setting ? "\n" : ""}${setting ? `- world / setting: ${setting}` : ""}

`
      : "";

  return `CHAPTER:
- number: ${input.chapterNumber}
- title: "${title}"
- targetBeatCount: ${targetBeats}

${eraSettingBlock}USER INTENT (what the author asked for):
"""${userIntent || "(empty — infer from summary)"}"""

SUMMARY:
"""${summary || "(empty)"}"""

PROJECT CHARACTERS (fiche — the ONLY allowed named entities):
${chars || "(none — use generic 'protagonist' but still constrained to what exists)"}

KNOWN LOCATIONS:
${locs || "(none — stay abstract, no invented real-world places)"}

${buildNarrativeContractSection(input)}
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
