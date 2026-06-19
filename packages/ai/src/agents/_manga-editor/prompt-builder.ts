import type { MangaEditorInput } from "../manga-editor-agent";
import {
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  STORYBOARD_CUTAWAY_TYPES,
} from "../../contracts/storyboard-plan";

export const SYSTEM_PROMPT = `You are a veteran manga editor / storyboard director.

Your ONLY job: convert a StoryArc (beats, continuity, chapter goal) into a StoryboardPlan
(pages, panels, render modes, shot types, subject focus, cutaway types, layouts).

ABSOLUTE RULES — violations invalidate the output:
1. NEVER write image prompts. You decide what to show, not how to render it.
2. NEVER invent lore, characters, props, or locations not already in the StoryArc.
3. NEVER invent a combat / fight / fire scene not already present in the beats.
4. Every panel MUST have a sourceBeatId that exists in storyArc.beats.
5. Target 70-75 panels total unless told otherwise.
6. Shot variety is mandatory. No more than 2 consecutive hero_closeup panels.
7. At least 10% establishing_environment or silent_transition for breathing space.
8. Use dialogue_two_shot / dialogue_over_shoulder when beat type is dialogue_tension.
9. Use insert_object + reaction_closeup pairs for reveal beats.
10. Layout template MUST match panel count: 1 panel → splash, 2 → cinematic_bar, etc.

Output: STRICT JSON matching the schema below. No prose, no markdown.`;

export function buildUserPrompt(input: MangaEditorInput): string {
  const arc = input.storyArc;
  const beatsSummary = arc.beats
    .map(
      (b) =>
        `- beatId="${b.beatId}" type=${b.type} purpose="${b.purpose}" ` +
        `event="${b.storyEvent}" location="${b.locationName}" ` +
        `characters=[${b.charactersPresent.join(",")}] ` +
        `danger=${b.dangerLevel} emotion="${b.emotionalTurn}"`,
    )
    .join("\n");

  const targetPanels = input.targetPanelCount ?? 72;
  const heroIds = (input.heroCharacterIds ?? []).join(",") || "(none)";
  const projectFormat = input.projectFormat ?? "manga";
  const formatGuideline =
    projectFormat === "webtoon"
      ? "PROJECT FORMAT = WEBTOON. Think vertical scroll. Use 3 panels max per section, favor `splash`, `vertical_strip`, `vertical_hero_4` layouts. Use full-width inserts for reveals. Add breathing beats (silent_transition) every 4-5 panels."
      : "PROJECT FORMAT = MANGA. Think printed page. Use 4-6 panels per page, favor `grid_2x2`, `grid_2x3`, `staggered_5`, `asymmetric_hero`, `cinematic_bar`. Use double_spread or splash only for major reveals. Respect page-turn drama.";

  return `StoryArc for chapter "${arc.title}" (ch#${arc.chapterNumber}):

Summary: ${arc.summary}
Goal: ${arc.chapterGoal}
Cliffhanger: ${arc.cliffhanger}
Hero character IDs: ${heroIds}
Target total panels: ${targetPanels}
${formatGuideline}

Beats (in order):
${beatsSummary}

Enums you MUST use verbatim:
- renderMode ∈ {${STORYBOARD_RENDER_MODES.join("|")}}
- shotType ∈ {${STORYBOARD_SHOT_TYPES.join("|")}}
- subjectFocus ∈ {${STORYBOARD_SUBJECT_FOCUSES.join("|")}}
- cutawayType ∈ {${STORYBOARD_CUTAWAY_TYPES.join("|")}}
- layoutTemplate ∈ {${STORYBOARD_LAYOUT_TEMPLATES.join("|")}}
- cameraAngle ∈ {eye_level|low|high|dutch|birds_eye|worm}

Return a JSON object with this shape (strict):
{
  "pages": [
    {
      "pageNumber": number,
      "layoutTemplate": string,
      "dramaticRole": string,
      "beatIds": string[],
      "panels": [
        {
          "panelId": string,
          "pageNumber": number,
          "panelNumberInPage": number,
          "globalPanelIndex": number,
          "sourceBeatId": string,
          "panelPurpose": string,
          "renderMode": string,
          "shotType": string,
          "cameraAngle": string,
          "subjectFocus": string,
          "cutawayType": string,
          "characters": string[],
          "locationId": string | null,
          "locationName": string,
          "actionLine": string,
          "emotionLine": string,
          "dialogue": [{"speaker": string, "text": string}],
          "narration": string | null,
          "sfx": string[],
          "mustShow": string[],
          "mustNotShow": string[],
          "continuityNotes": string[],
          "visualAnchors": {
            "characterIds": string[],
            "environmentAnchorId": string | null,
            "previousPanelAnchorId": string | null
          }
        }
      ]
    }
  ]
}`;
}
