/**
 * generate-bundle-core.ts
 *
 * Orchestrateur du pipeline `generateChapterBundle` :
 *   prep → outline → beats → storyboard → assembly
 *
 * Le détail de chaque phase est isolé dans son propre module pour rester
 * sous la cible 500 lignes/fichier (audit-v9). Cette façade de pipeline
 * garde la signature publique stable.
 */

import type {
  ApprovedChapterOutline,
  VisualWorldContract,
} from "@manga-ai-studio/core";
import type { CreativityControls } from "@manga-ai-studio/world";
import { summarizeGenerationStatuses } from "../generation-status";
import type {
  GeneratedChapterBundle,
  ProjectContextForChapter,
} from "./shared-types";
import {
  describeCreativityProfile,
  normalizeCreativityControls,
} from "./pipeline-helpers";
import { inferVisualStyle } from "./visual-inference";
import {
  buildMemoryTimelineEventsFromScenes,
  buildNarrativeSummary,
} from "./pipeline-panel-builders";
import { buildDynamicPlotOptions } from "./pipeline-helpers";
import { prepareBundleContext } from "./bundle-prep";
import { buildOutlineResult } from "./bundle-outline";
import { buildRawOutlineBeats, finalizeBeats } from "./bundle-beats";
import { buildStoryboard } from "./bundle-storyboard";

export async function generateChapterBundle(input: {
  chapterId?: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls?: Partial<CreativityControls>;
  context: ProjectContextForChapter;
  approvedOutline?: ApprovedChapterOutline | null;
  /** Si présent avec des lieux, remplace le pool legacy et peut lier chaque beat via `beatBindings`. */
  visualWorldContract?: VisualWorldContract | null;
  /**
   * Premium (`PIPELINE_V3_PREMIUM_ONLY`) : par défaut **interdit** l’heuristique `legacyInferLocationPoolStrings`
   * sans `visualWorldContract` peuplé — sauf si `true` (bootstrap estimate / job avant composition VW).
   *
   * **Après** composition VW : passer `false` (ou omettre, défaut = `false` en premium) pour que chaque beat
   * utilise `selectBeatLocationFromVisualWorld` (strict) au lieu du chemin relâché `beatLocationSceneStringFromVisualWorld`.
   */
  allowLegacyLocationInference?: boolean;
}): Promise<GeneratedChapterBundle> {
  const effectiveCreativeControls = normalizeCreativityControls(input.creativityControls);
  const visualStyle = inferVisualStyle(input.context);
  const tone = input.context.project.tone ?? "dramatique";
  const genre = (input.context.project.primaryGenre?.trim() || "generic").toLowerCase();
  const previous = input.context.recentChapters[0];

  const prep = prepareBundleContext({
    context: input.context,
    userIntent: input.userIntent,
    visualWorldContract: input.visualWorldContract,
    allowLegacyLocationInference: input.allowLegacyLocationInference,
  });

  const outlineResult = await buildOutlineResult({
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    userIntent: input.userIntent,
    selectedPlotLabel: input.selectedPlotLabel,
    creativityControls: effectiveCreativeControls,
    context: input.context,
    approvedOutline: input.approvedOutline,
    intentEntityHints: prep.intentEntityHints,
    visualStyle,
  });

  const chapterGoal = input.approvedOutline?.summary ?? `Faire avancer l'intrigue autour de : ${input.userIntent}`;

  const rawOutlineBeats = buildRawOutlineBeats({
    outlineBeats: outlineResult.outline.beats,
    approvedOutline: input.approvedOutline,
    context: input.context,
    mainCast: prep.mainCast,
    visualWorldContract: input.visualWorldContract,
    premium: prep.premium,
    allowLegacyLocationInference: input.allowLegacyLocationInference,
    locA: prep.locA,
    locAt: prep.locAt,
  });

  const beats = await finalizeBeats({
    rawOutlineBeats,
    approvedOutline: input.approvedOutline,
    userIntent: input.userIntent,
    intentEntityHints: prep.intentEntityHints,
    context: input.context,
    mainCast: prep.mainCast,
    locA: prep.locA,
    locB: prep.locB,
    locAt: prep.locAt,
    previousSummary: previous?.summary,
    previousCliffhanger: previous?.cliffhanger,
  });

  const dynamicPlotOptions = buildDynamicPlotOptions({
    userIntent: input.userIntent,
    mainCast: prep.mainCast,
    previousSummary: previous?.summary ?? null,
    previousCliffhanger: previous?.cliffhanger ?? null,
    creativityControls: effectiveCreativeControls,
    outline: {
      summary: outlineResult.outline.summary,
      cliffhanger: outlineResult.outline.cliffhanger,
      beats: rawOutlineBeats.map((beat) => ({
        summary: beat.summary,
        turn: beat.turn,
        location: beat.location,
        pageRole: beat.pageRole,
      })),
    },
  });

  const { scenes, storyboardPages, dialogueFallbacks } = await buildStoryboard({
    beats,
    context: input.context,
    visualStyle,
    genre,
    tone,
    chapterGoal,
    previousSummary: previous?.summary,
    previousCliffhanger: previous?.cliffhanger,
  });

  const cliffhanger = outlineResult.outline.cliffhanger;
  const narrativeSummary = buildNarrativeSummary({
    projectTitle: input.context.project.title,
    chapterGoal,
    scenes,
    cliffhanger,
  });

  const bundleStatus = summarizeGenerationStatuses([
    outlineResult.degradedStatus,
    ...dialogueFallbacks.map(() => "DEGRADED_DIALOGUE_FALLBACK" as const),
  ]);

  return {
    generationDiagnostics: {
      operationalStatus: bundleStatus.operationalStatus,
      degradedModes: bundleStatus.degradedModes,
      outline: {
        degradedStatus: outlineResult.degradedStatus,
        usedFallback: input.approvedOutline ? false : !outlineResult.usedOpenAI,
        fallbackReason: input.approvedOutline ? undefined : outlineResult.fallbackReason,
        model: outlineResult.model,
      },
      dialogue: {
        degradedStatus: dialogueFallbacks.length > 0 ? "DEGRADED_DIALOGUE_FALLBACK" : "FULLY_OPERATIONAL",
        usedFallback: dialogueFallbacks.length > 0,
        fallbackSceneIds: dialogueFallbacks.map((item) => item.sceneId),
        reasonsByScene: dialogueFallbacks,
      },
    },
    creativeDirection: {
      chapterGoal,
      tone,
      whyNow: `Le chapitre capitalise sur les récents événements pour faire progresser ${input.context.project.title} sans casser la continuité, avec ${describeCreativityProfile(effectiveCreativeControls)}.`,
    },
    plotOptions: dynamicPlotOptions,
    outline: {
      chapter_title: outlineResult.outline.title ?? input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
      chapter_goal: chapterGoal,
      tone,
      beats,
      cliffhanger,
      continuity_notes: [
        `Conserver la cohérence émotionnelle de ${prep.mainCast[0]}.`,
        "Réutiliser la mémoire récente avant toute nouvelle révélation.",
        "Ne pas contredire les relations ou statuts canoniques.",
        ...beats.flatMap((beat) => beat.structuredBeat?.setupPayoffHooks.slice(0, 1).map((hook) => `Hook: ${hook.label}`) ?? []).slice(0, 3),
      ],
    },
    script: { scenes },
    storyboard: {
      pageCount: storyboardPages.length,
      pages: storyboardPages,
    },
    memory: {
      narrativeSummary,
      structuredState: {
        chapterGoal,
        cliffhanger,
        involvedCharacters: prep.mainCast,
        focusCharacterIds: input.context.focusCharacterIds ?? [],
        selectedPlotLabel: input.selectedPlotLabel ?? "bold",
        creativityControls: effectiveCreativeControls,
        location: prep.locD ?? prep.locC,
        outlineBeatPayloads: beats.map((beat) => ({
          beatId: beat.id,
          payload: beat.structuredBeat ?? null,
        })),
        sceneContinuityPayloads: scenes.map((scene) => ({
          sceneId: scene.id,
          payload: scene.continuityPayload,
        })),
      },
      timelineEvents: buildMemoryTimelineEventsFromScenes(scenes),
      openLoops: [
        cliffhanger,
        `Conséquences de la décision prise à ${prep.locC}.`,
        `Effets durables sur ${prep.mainCast.join(", ")}.`,
      ],
    },
    ...(input.visualWorldContract
      ? { visualWorldContract: input.visualWorldContract }
      : {}),
  };
}
