/**
 * bundle-outline.ts
 *
 * Phase 2 du pipeline `generateChapterBundle` : construction du
 * `ChapterOutlineGenerationResult` (réutilisation outline approuvé OU
 * génération via `generateChapterOutline`).
 *
 * Extrait de `generate-bundle-core.ts` (audit-v9, < 500 lignes/fichier).
 */

import { generateChapterOutline } from "../chapter-outline";
import type { ChapterOutlineGenerationResult, PageRole } from "../chapter-outline";
import type { ApprovedChapterOutline, StructuredBeatPayload } from "@manga-ai-studio/core";
import type { CreativityControls } from "@manga-ai-studio/world";
import type { ProjectContextForChapter } from "./shared-types";

const STRUCTURED_BEAT_FALLBACK: StructuredBeatPayload = {
  source: "heuristic_fallback",
  confidence: 0.45,
  arcPromises: [],
  worldConsequences: [],
  setupPayoffHooks: [],
};

/**
 * Renvoie un `ChapterOutlineGenerationResult` :
 * - soit issu de l'outline approuvé (court-circuite tout appel LLM),
 * - soit produit par `generateChapterOutline` (LLM + fallback heuristique).
 */
export async function buildOutlineResult(input: {
  chapterNumber: number;
  chapterTitle?: string | null;
  userIntent: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls: CreativityControls;
  context: ProjectContextForChapter;
  approvedOutline?: ApprovedChapterOutline | null;
  intentEntityHints: ReturnType<typeof import("../services/entity-brain").parseIntentEntities>;
  visualStyle: string;
}): Promise<ChapterOutlineGenerationResult> {
  if (input.approvedOutline) {
    return {
      outline: {
        title: input.chapterTitle ?? `Chapitre ${input.chapterNumber}`,
        summary: input.approvedOutline.summary,
        cliffhanger: input.approvedOutline.cliffhanger,
        beats: input.approvedOutline.beats.map((beat) => ({
          summary: beat.summary,
          emotionalTone: beat.pageRole,
          pageRole: beat.pageRole as PageRole,
          turn: beat.turn,
          emotionalDelta: beat.emotionalDelta,
          location: beat.location,
          characters: beat.characters,
          structuredBeat: (beat.structuredBeat ?? STRUCTURED_BEAT_FALLBACK) as StructuredBeatPayload,
        })),
      },
      usedOpenAI: false,
      model: "user-approved-outline",
      degradedStatus: "FULLY_OPERATIONAL",
    };
  }

  const previous = input.context.recentChapters[0];
  const result = await generateChapterOutline({
    projectTitle: input.context.project.title,
    pitch: input.context.project.pitch,
    description: input.context.project.description ?? null,
    primaryGenre: input.context.project.primaryGenre,
    subGenres: input.context.project.subGenres ?? [],
    tone: input.context.project.tone ?? null,
    visualStyle: input.visualStyle,
    styleGuide: input.context.stylePack
      ? [
          input.context.stylePack.renderFamily,
          input.context.stylePack.lineWeight,
          input.context.stylePack.shadingMode,
          input.context.stylePack.contrastProfile,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    cast: input.context.characters.slice(0, 8).map((character) => ({
      name: character.name,
      roleType: character.roleType,
      objective: character.objective,
      status: character.status,
      fear: character.fear,
      traits: character.traits,
      appearance: character.appearance,
    })),
    intentEntities: input.intentEntityHints,
    knownLocations: (input.context.locations ?? []).slice(0, 12),
    relationships: (input.context.relationships ?? []).slice(0, 8).map((r) => ({
      source: input.context.characters.find((c) => c.id === r.sourceCharacterId)?.name ?? r.sourceCharacterId,
      target: input.context.characters.find((c) => c.id === r.targetCharacterId)?.name ?? r.targetCharacterId,
      type: r.relationType,
    })),
    arcs: (input.context.arcs ?? []).slice(0, 4),
    allRecentChapters: input.context.recentChapters.slice(0, 3),
    bibleSummary: input.context.storyBible?.summary ?? null,
    themes: input.context.storyBible?.themes ?? [],
    continuitySnippets: input.context.recentMemory
      .map((memory) => memory.narrativeSummary)
      .filter((item): item is string => Boolean(item))
      .slice(0, 3),
    recentContinuityEvents: (input.context.recentContinuityEvents ?? [])
      .filter((e) => e.importance >= 40)
      .slice(0, 10),
    retrievedContext: input.context.retrievedDocs.map((doc) => doc.content).slice(0, 4),
    settings: {
      dialogueDensity: input.context.settings?.dialogueDensity ?? null,
      darknessLevel: input.context.settings?.darknessLevel ?? null,
      mysteryLevel: input.context.settings?.mysteryLevel ?? null,
      violenceLevel: input.context.settings?.violenceLevel ?? null,
      romanceLevel: input.context.settings?.romanceLevel ?? null,
      sensualityLevel: input.context.settings?.sensualityLevel ?? null,
      canonStrictness: input.context.settings?.canonStrictness ?? null,
    },
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle ?? null,
    userIntent: input.userIntent,
    quickTag: input.selectedPlotLabel ?? null,
    creativityControls: input.creativityControls,
    previousSummary: previous?.summary ?? null,
    previousCliffhanger: previous?.cliffhanger ?? null,
    seriesSynopsis: input.context.seriesSynopsis ?? null,
    targetBeats: 10,
  });

  if (result.degradedStatus !== "FULLY_OPERATIONAL") {
    console.warn(
      `[chapter-pipeline] outline degraded chapter=${input.chapterNumber} status=${result.degradedStatus} reason=${result.fallbackReason ?? "n/a"}`,
    );
  }

  return result;
}
