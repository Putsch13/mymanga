/**
 * Image generation pass — génération de la couverture de chapitre (hero shot).
 *
 * Extrait de image-generation-pass.ts. Compose le prompt de cover via composeCoverPrompt
 * (mood inféré depuis tone+genre), lance la génération en mode COVER_ART, persiste et
 * met à jour `chapter.coverImageUrl`. Silent-fail si erreur (log warning) pour ne pas
 * bloquer le pipeline.
 */

import { runRoutedImageGeneration } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { persistImageIfNeeded } from "../../pipeline-image-persistence";
import { logPipelineWarn } from "../../lib/pipeline-logger";

type RawCharacter = {
  name: string;
  gender?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
};

type StylePack = { renderFamily: string } | undefined;

export interface GenerateChapterCoverParams {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  intensityLayer: string;
  revisedBundle: {
    outline: { chapter_title?: string | null; cliffhanger?: string | null };
    memory: { narrativeSummary: string };
  };
  context: {
    project: {
      tone?: string | null;
      primaryGenre?: string | null;
      visualStyle?: string | null;
    };
  };
  project: { visualStyle?: string | null } | null;
  rawCharacters: RawCharacter[];
  stylePacks: StylePack[];
}

export async function generateChapterCover(
  params: GenerateChapterCoverParams,
): Promise<string | null> {
  const {
    chapterId,
    projectId,
    chapterNumber,
    intensityLayer,
    revisedBundle,
    context,
    project,
    rawCharacters,
    stylePacks,
  } = params;

  try {
    const { composeCoverPrompt, inferCoverMood } = await import("@manga-ai-studio/ai");
    const coverMood = inferCoverMood(
      context.project.tone ?? "dramatique",
      context.project.primaryGenre?.trim() || "generic",
    );
    const coverPrompt = composeCoverPrompt({
      chapterTitle: revisedBundle.outline.chapter_title ?? `Chapitre ${chapterNumber}`,
      chapterNumber,
      chapterSummary: revisedBundle.memory.narrativeSummary,
      cliffhanger: revisedBundle.outline.cliffhanger ?? "",
      genre: context.project.primaryGenre?.trim() || "generic",
      tone: context.project.tone ?? "dramatique",
      visualStyle: context.project.visualStyle ?? "manga",
      mood: coverMood,
      characters: rawCharacters.slice(0, 2).map((c) => ({
        name: c.name,
        gender: c.gender,
        appearance: c.appearance,
        hairColor: c.hairColor,
        eyeColor: c.eyeColor,
        outfitDefault: c.outfitDefault,
      })),
      stylePack: stylePacks[0]
        ? { name: stylePacks[0].renderFamily, visualStyle: project?.visualStyle ?? null }
        : null,
      contentIntensityLayer: intensityLayer,
    });

    const coverResult = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        isNewCharacter: false,
        hasCanonReferences: false,
        characterCountInScene: 2,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: false,
        goreStylizedMature: false,
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: coverPrompt.positive,
        negativePrompt: coverPrompt.negative,
        width: coverPrompt.width,
        height: coverPrompt.height,
        providerParams: { contentIntensityLayer: intensityLayer, mode: "COVER_ART" },
      },
    );
    if (coverResult.ok) {
      const persisted = await persistImageIfNeeded({
        imageUrl: coverResult.result.imageUrl,
        projectId,
        chapterId,
        sceneImageId: `cover_${chapterId}`,
      });
      if (!persisted.ok) {
        logPipelineWarn(
          "cover.persist_failed",
          { reason: persisted.reason },
          { ns: "pipeline:cover", chapterId, projectId },
        );
        return null;
      }
      // P0.1 — la couverture ne peut être persistée en `coverImageUrl` que si
      // l'URL est stable (Supabase). `persistImageIfNeeded` retourne `ok:true`
      // dans deux cas valides : (a) upload canonique, (b) URL déjà stable.
      await prisma.chapter.update({
        where: { id: chapterId },
        data: { coverImageUrl: persisted.url },
      });
      return persisted.url;
    }
    return null;
  } catch (e) {
    logPipelineWarn(
      "cover.generation_skipped",
      { error: e instanceof Error ? e.message : String(e) },
      { ns: "pipeline:cover", chapterId, projectId },
    );
    return null;
  }
}
