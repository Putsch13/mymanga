/**
 * pipeline-panel-builders.ts
 *
 * Construction des blueprints / prompts / panels pour une scène
 * (chapter-pipeline). Extrait de `chapter-pipeline.ts` (audit-v9).
 */

import { buildRegeneratedBlueprints as buildRegeneratedBlueprintsImpl } from "./page-dedup";
import { inferMood } from "./visual-inference";
import { planPanelDialogueText, type PanelDialogueTextPlan, type SceneContinuityPayload } from "@manga-ai-studio/core";
import {
  PAGE_ROLE_TEMPLATES,
  STD_NEGATIVE,
  type PageRoleKey,
  type PanelBlueprint,
} from "./pipeline-helpers";
import type {
  PanelMood,
  ProjectContextForChapter,
  StoryboardPanel,
} from "./shared-types";

export function buildPanelBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number; pageRole?: string; turn?: string },
  panelCount: number,
  genre: string,
): PanelBlueprint[] {
  const mainA = scene.characters[0] ?? "Le protagoniste";
  const mainB = scene.characters[1] ?? mainA;
  const role = (beat.pageRole ?? "escalation") as PageRoleKey;
  const templateFn = PAGE_ROLE_TEMPLATES[role] ?? PAGE_ROLE_TEMPLATES.escalation;
  const templates = templateFn({
    mainA,
    mainB,
    location: scene.location,
    summary: beat.summary,
    purpose: scene.purpose,
    turn: beat.turn ?? beat.summary.slice(0, 60),
  });

  return Array.from({ length: panelCount }).map((_, panelIndex) => {
    const mood = inferMood(beat.tension + panelIndex / Math.max(panelCount, 1), genre);
    const isEstablishingPanel = panelIndex === 0;
    const isClosingPanel = panelIndex === panelCount - 1;
    const shouldKeepFullScene =
      isEstablishingPanel
      || role === "confrontation"
      || role === "aftermath"
      || role === "cliffhanger";
    const focusedCharacter =
      scene.characters[panelIndex % Math.max(scene.characters.length, 1)] ?? mainA;
    const supportCharacter =
      scene.characters[(panelIndex + 1) % Math.max(scene.characters.length, 1)] ?? mainB;
    const baseCharacters = shouldKeepFullScene
      ? scene.characters
      : isClosingPanel
        ? [focusedCharacter, supportCharacter].filter((name, index, all) => Boolean(name) && all.indexOf(name) === index)
        : [focusedCharacter].filter(Boolean);
    return {
      panelId: `panel_${panelIndex + 1}`,
      action: templates[panelIndex] ?? `${scene.summary} — ${beat.turn ?? "progression"}.`,
      mood,
      characters: baseCharacters,
    };
  });
}

export function buildNarrativeSummary(input: {
  projectTitle: string;
  chapterGoal: string;
  scenes: Array<{ summary: string; characters: string[]; location: string; dialogue: Array<{ speaker: string; text: string }> }>;
  cliffhanger: string;
}) {
  const highlights = input.scenes
    .slice(0, 3)
    .map((scene) => `${scene.characters.join(" / ") || "Le groupe"} à ${scene.location}: ${scene.summary}`)
    .join(" ");
  return `${input.projectTitle}: ${input.chapterGoal}. ${highlights} Fin de chapitre: ${input.cliffhanger}`.slice(0, 1200);
}

export function buildMemoryTimelineEventsFromScenes(
  scenes: Array<{
    summary: string;
    location: string;
    characters: string[];
    continuityPayload: SceneContinuityPayload;
  }>,
) {
  return scenes.flatMap((scene, sceneIndex) => {
    const explicitEvents = scene.continuityPayload.sceneEvents;
    if (explicitEvents.length > 0) {
      return explicitEvents.map((event, eventIndex) => ({
        eventType: event.eventType,
        summary: event.description,
        importance:
          event.importance === "critical"
            ? 90
            : event.importance === "major"
              ? 70
              : Math.max(35, 45 + sceneIndex * 5 - eventIndex * 3),
        entities: {
          characters: event.actorNames ?? scene.characters,
          location: event.location ?? scene.location,
          consequences: event.consequences ?? [],
          objectsGained: event.objectsGained ?? [],
          objectsLost: event.objectsLost ?? [],
          injuriesApplied: event.injuriesApplied ?? [],
          injuriesResolved: event.injuriesResolved ?? [],
          relationshipChanges: event.relationshipChanges ?? [],
          continuityFlags: event.continuityFlags ?? [],
        },
        permanent: Boolean(event.irreversible),
      }));
    }
    return [{
      eventType: "chapter_beat",
      summary: scene.summary,
      importance: 45 + sceneIndex * 10,
      entities: { characters: scene.characters, location: scene.location },
      permanent: true,
    }];
  });
}

export function buildPanelPrompt(
  context: ProjectContextForChapter,
  characters: string[],
  location: string,
  camera: string,
  action: string,
  mood: PanelMood,
  visualStyle: string,
  reserveTextArea?: boolean,
): string {
  const charDescs = characters
    .map((name) => {
      const c = context.characters.find((ch) => ch.name === name);
      if (!c) return name;
      const parts = [name];
      if (c.appearance) parts.push(c.appearance);
      if (c.hairColor) parts.push(`${c.hairColor} hair`);
      if (c.eyeColor) parts.push(`${c.eyeColor} eyes`);
      if (c.outfitDefault) parts.push(c.outfitDefault);
      return parts.join(", ");
    })
    .join(" | ");

  const moodMap: Record<PanelMood, string> = {
    action: "dynamic action, motion blur, speed lines",
    tension: "tense atmosphere, dramatic shadows, high contrast",
    emotion: "emotional close-up, teary eyes, soft lighting",
    revelation: "shocking reveal, dramatic lighting, wide eyes",
    calm: "peaceful composition, soft light, serene",
    horror: "dark horror, deep shadows, unsettling angles",
    romance: "soft romantic lighting, cherry blossoms, warm tones",
    comedy: "comedic exaggeration, sweat drops, chibi elements",
    dramatic: "dramatic composition, strong shadows, cinematic",
  };

  const textZone =
    reserveTextArea === true
      ? "leave clear negative space in corners for speech balloons and SFX lettering, do not fill those zones with busy detail"
      : reserveTextArea === false
        ? "full-bleed art allowed, minimal reserved lettering zones"
        : null;

  return [
    visualStyle,
    `manga panel, ${camera}`,
    `location: ${location}`,
    charDescs,
    action,
    moodMap[mood],
    textZone,
    "high detail, professional manga art, consistent character design, environmental storytelling",
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildPanelsForScene(
  context: ProjectContextForChapter,
  scene: { id: string; location: string; characters: string[]; summary: string; purpose: string },
  beat: { id: string; tension: number },
  panelBlueprints: PanelBlueprint[],
  visualStyle: string,
  genre: string,
  panelTextPlan?: PanelDialogueTextPlan[],
): StoryboardPanel[] {
  const PANEL_FUNCTION_CAMERAS: Record<string, string[]> = {
    establishing: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    escalation: ["medium shot", "over-the-shoulder shot", "close-up on face", "low angle shot", "medium shot", "extreme close-up on eyes"],
    confrontation: ["medium shot", "close-up on face", "low angle dynamic shot", "extreme close-up on eyes", "over-the-shoulder shot", "dutch angle shot"],
    revelation: ["medium shot", "slow zoom close-up", "extreme close-up shocked eyes", "wide shot consequences", "over-the-shoulder shot", "high angle distant shot"],
    aftermath: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    cliffhanger: ["medium shot", "close-up on face", "low angle shot", "extreme close-up on eyes", "silhouette shot", "dramatic wide shot"],
  };

  const pageRole = (beat as { pageRole?: string }).pageRole ?? "escalation";
  const roleCameras = PANEL_FUNCTION_CAMERAS[pageRole] ?? PANEL_FUNCTION_CAMERAS.escalation;

  const panels: StoryboardPanel[] = [];
  for (let i = 0; i < panelBlueprints.length; i++) {
    const blueprint = panelBlueprints[i];
    const panelTension = beat.tension + (i / Math.max(panelBlueprints.length, 1)) * 2;
    const mood = blueprint?.mood ?? inferMood(panelTension, genre);
    const camera = roleCameras[i] ?? roleCameras[i % roleCameras.length] ?? "medium shot";
    const action = blueprint?.action ?? scene.summary;
    const charSubsetRaw = blueprint?.characters?.length ? blueprint.characters : scene.characters;

    const textPlan = panelTextPlan?.[i];
    const normalizedChars = [...new Set((charSubsetRaw ?? []).filter(Boolean))];
    const allBubbles = (textPlan?.bubbles ?? [])
      .filter((b: { text?: string }) => b.text?.trim())
      .slice(0, 3)
      .map((b: { speaker?: string; text?: string }) => ({
        speaker: b.speaker ?? normalizedChars[0] ?? scene.characters[0] ?? "Narrateur",
        text: b.text as string, // Safe: filtered above for truthy text
      }));
    for (const bubble of allBubbles) {
      const bubbleSpeaker = bubble.speaker?.trim();
      if (bubbleSpeaker && !/narrateur|narration/i.test(bubbleSpeaker)) {
        const hasSpeaker = normalizedChars.some((name) => name.toLowerCase() === bubbleSpeaker.toLowerCase());
        if (!hasSpeaker) normalizedChars.push(bubbleSpeaker);
      }
    }

    const beatTurn = (beat as { turn?: string }).turn;

    panels.push({
      panelNumber: i + 1,
      sceneId: scene.id,
      beatId: beat.id,
      caption: i === 0 && beatTurn ? beatTurn : action,
      prompt: buildPanelPrompt(
        context,
        normalizedChars,
        scene.location,
        camera,
        action,
        mood,
        visualStyle,
        textPlan?.reserveTextArea,
      ),
      negativePrompt: STD_NEGATIVE,
      camera,
      characters: normalizedChars,
      mood,
      sfx: textPlan?.sfx?.[0] ?? undefined,
      dialogue: allBubbles[0] ?? undefined,
      dialogues: allBubbles.length > 0 ? allBubbles : undefined,
      narration: textPlan?.narration?.[0] ?? undefined,
      textScale: textPlan?.textScale ?? "normal",
    });
  }
  return panels;
}

/**
 * Wrapper local de buildRegeneratedBlueprints (page-dedup) avec
 * `buildPanelBlueprints` de ce module pour casser la dépendance circulaire.
 */
export function buildRegeneratedBlueprints(
  scene: { id: string; summary: string; location: string; characters: string[]; purpose: string },
  beat: { summary: string; tension: number },
  panelCount: number,
  genre: string,
  attempt: number,
): PanelBlueprint[] {
  return buildRegeneratedBlueprintsImpl(
    buildPanelBlueprints,
    scene,
    beat,
    panelCount,
    genre,
    attempt,
  );
}
