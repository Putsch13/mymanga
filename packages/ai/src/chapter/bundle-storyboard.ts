/**
 * bundle-storyboard.ts
 *
 * Phase 4 du pipeline `generateChapterBundle` : génération du dialogue
 * pour chaque scène, construction du storyboard final, et garde-fou
 * anti-duplication des pages.
 *
 * Extrait de `generate-bundle-core.ts` (audit-v9, < 500 lignes/fichier).
 */

import { planPanelDialogueText } from "@manga-ai-studio/core";
import { writeDialogueForScene } from "../services/dialogue-writer";
import {
  buildPanelBlueprints,
  buildPanelsForScene,
  buildRegeneratedBlueprints,
} from "./pipeline-panel-builders";
import { duplicatePageIndexes } from "./page-dedup";
import { inferLayout } from "./visual-inference";
import type { ProjectContextForChapter, StoryboardPage } from "./shared-types";
import type { RawOutlineBeat } from "./bundle-beats";

const MAX_DUP_REGEN = 2;

export type ScenePlan = {
  id: string;
  title: string;
  summary: string;
  location: string;
  characters: string[];
  purpose: string;
};

/**
 * À partir des beats finalisés, calcule (panelCounts, scenes, dialoguePlans)
 * puis construit le storyboard avec un garde-fou anti-duplication.
 */
export async function buildStoryboard(input: {
  beats: RawOutlineBeat[];
  context: ProjectContextForChapter;
  visualStyle: string;
  genre: string;
  tone: string;
  chapterGoal: string;
  previousSummary?: string | null;
  previousCliffhanger?: string | null;
}): Promise<{
  scenes: Array<ScenePlan & {
    continuityPayload: import("@manga-ai-studio/core").SceneContinuityPayload;
    dialogue: Array<{
      speaker: string;
      text: string;
      subtext: string;
      emotion: string;
      intensity: number;
      balloon: string;
    }>;
    generationDiagnostics: {
      dialogue: {
        degradedStatus: string;
        usedFallback: boolean;
        fallbackReason?: string;
      };
    };
  }>;
  storyboardPages: StoryboardPage[];
  dialogueFallbacks: Array<{ sceneId: string; reason: string }>;
}> {
  const { beats, context, visualStyle, genre, tone, chapterGoal } = input;

  const panelCounts = beats.map((beat, index) => {
    const t = beat.tension ?? 3 + index;
    if (t >= 8) return 6;
    if (t >= 5) return index % 2 === 0 ? 5 : 6;
    return index % 3 === 0 ? 4 : 5;
  });

  const scenesBase: ScenePlan[] = beats.map((beat, index) => ({
    id: `scene_${index + 1}`,
    title: `Scene ${index + 1}`,
    summary: beat.summary,
    location: beat.location,
    characters: beat.characters,
    purpose: beat.purpose,
  }));

  const panelBlueprintsByScene = scenesBase.map((scene, index) =>
    buildPanelBlueprints(scene, beats[index] ?? beats[0]!, panelCounts[index] ?? 6, genre),
  );

  const dialoguePlans = await Promise.all(
    scenesBase.map(async (scene, index) => {
      const blueprints = panelBlueprintsByScene[index] ?? [];
      const panelCount = blueprints.length || panelCounts[index] || 6;
      const layout = inferLayout(beats[index]?.tension ?? 5, panelCount);
      const dialogue = await writeDialogueForScene({
        sceneId: scene.id,
        sceneSummary: scene.summary,
        location: scene.location,
        tension: beats[index]?.tension ?? 5,
        emotionalObjective: scene.purpose,
        chapterGoal,
        panelCount,
        projectStyle: `${tone} / ${visualStyle} / dialogues ${context.settings?.dialogueDensity ?? 55}`,
        contentIntensityLayer: context.project.intensityLayer ?? undefined,
        structuredBeatPayload: beats[index]?.structuredBeat,
        continuityContext: [
          input.previousSummary ? `Résumé précédent: ${input.previousSummary}` : "",
          input.previousCliffhanger ? `Cliffhanger précédent: ${input.previousCliffhanger}` : "",
          beats[index]?.structuredBeat
            ? `Structured beat payload: ${JSON.stringify(beats[index]?.structuredBeat)}`
            : "",
          ...(context.storyBible?.summary ? [`Bible: ${context.storyBible.summary}`] : []),
          ...context.retrievedDocs.map((doc) => `${doc.title ?? doc.entityType ?? "mémoire"}: ${doc.content}`).slice(0, 4),
        ].filter(Boolean),
        panelBlueprints: blueprints,
        characters: scene.characters.map((name) => {
          const c = context.characters.find((ch) => ch.name === name);
          return {
            name,
            entityKind: c?.entityKind ?? undefined,
            dialogueMode: c?.dialogueMode ?? undefined,
            speciesLabel: c?.speciesLabel ?? undefined,
            roleType: c?.roleType ?? undefined,
            objective: c?.objective ?? undefined,
            fear: c?.fear ?? undefined,
            biography: c?.biography ?? undefined,
            traits: c?.traits ?? [],
            flaws: c?.flaws ?? [],
            speechProfile: c?.speechProfile ?? {},
            emotionalState: c?.emotionalState ?? undefined,
          };
        }),
      });

      if (dialogue.usedFallback) {
        console.warn(
          `[chapter-pipeline] dialogue degraded scene=${scene.id} status=${dialogue.degradedStatus} reason=${dialogue.fallbackReason ?? "n/a"}`,
        );
      }

      return {
        plannedPanels: planPanelDialogueText({
          sceneId: scene.id,
          layout,
          panels: blueprints,
          dialogue: dialogue.panels,
        }),
        continuityPayload: dialogue.continuityPayload,
        dialogueDiagnostics: {
          degradedStatus: dialogue.degradedStatus,
          usedFallback: dialogue.usedFallback,
          fallbackReason: dialogue.fallbackReason,
        },
      };
    }),
  );

  const mainCast = scenesBase[0]?.characters ?? [];
  const scenes = scenesBase.map((scene, index) => {
    const plan = dialoguePlans[index]?.plannedPanels ?? [];
    return {
      ...scene,
      continuityPayload: dialoguePlans[index]?.continuityPayload ?? {
        source: "heuristic_fallback" as const,
        confidence: 0.3,
        sceneEvents: [],
        characterDeltas: [],
        locationDeltas: [],
        arcDeltas: [],
      },
      dialogue: plan.flatMap((panel, panelIndex) =>
        (panel.bubbles ?? []).map((bubble: { speaker?: string; text?: string; emotion?: string; bubbleType?: string }) => ({
          speaker: bubble.speaker ?? scene.characters[0] ?? mainCast[0] ?? "Narrateur",
          text: bubble.text as string,
          subtext: bubble.emotion ?? scene.purpose,
          emotion: bubble.emotion ?? ((beats[index]?.tension ?? 5) >= 7 ? "tension" : "calme"),
          intensity: Math.min(10, 3 + index + panelIndex),
          balloon: bubble.bubbleType ?? "speech",
        })),
      ),
      generationDiagnostics: {
        dialogue: dialoguePlans[index]?.dialogueDiagnostics ?? {
          degradedStatus: "FULLY_OPERATIONAL",
          usedFallback: false,
        },
      },
    };
  });

  const storyboardPages: StoryboardPage[] = scenes.map((scene, pageIndex) => {
    const beat = beats[pageIndex] ?? beats[0]!;
    const count = panelCounts[pageIndex] ?? 6;
    const panels = buildPanelsForScene(
      context,
      scene,
      beat,
      panelBlueprintsByScene[pageIndex] ?? buildPanelBlueprints(scene, beat, count, genre),
      visualStyle,
      genre,
      dialoguePlans[pageIndex]?.plannedPanels,
    );
    return {
      pageNumber: pageIndex + 1,
      layout: inferLayout(beat.tension, count),
      panels,
    };
  });

  for (let attempt = 1; attempt <= MAX_DUP_REGEN; attempt++) {
    const duplicates = duplicatePageIndexes(storyboardPages);
    if (duplicates.length === 0) break;
    console.warn(`[chapter-pipeline] duplicate pages detected: attempt=${attempt} pages=${duplicates.join(",")}`);

    for (const pageIndex of duplicates) {
      const scene = scenes[pageIndex];
      const beat = beats[pageIndex] ?? beats[0]!;
      const count = panelCounts[pageIndex] ?? 6;
      if (!scene) continue;
      const regenBlueprints = buildRegeneratedBlueprints(scene, beat, count, genre, attempt);
      const regeneratedPanels = buildPanelsForScene(
        context,
        scene,
        beat,
        regenBlueprints,
        visualStyle,
        genre,
        dialoguePlans[pageIndex]?.plannedPanels,
      ).map((panel, panelIndex) => ({
        ...panel,
        panelNumber: panelIndex + 1,
      }));

      storyboardPages[pageIndex] = {
        pageNumber: pageIndex + 1,
        layout: inferLayout(Math.min(9, beat.tension + attempt), count),
        panels: regeneratedPanels,
      };
    }
  }

  const remainingDuplicates = duplicatePageIndexes(storyboardPages);
  if (remainingDuplicates.length > 0) {
    console.warn(`[chapter-pipeline] duplicate pages still present after regen: ${remainingDuplicates.join(",")}`);
  }

  const dialogueFallbacks = scenes
    .filter((scene) => scene.generationDiagnostics?.dialogue.usedFallback)
    .map((scene) => ({
      sceneId: scene.id,
      reason: scene.generationDiagnostics?.dialogue.fallbackReason ?? "Dialogue fallback used",
    }));

  return { scenes, storyboardPages, dialogueFallbacks };
}
