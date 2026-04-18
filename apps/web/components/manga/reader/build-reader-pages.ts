/**
 * P5.2 — Construction des pages universelles à partir d'un chapitre.
 *
 * - `dedupeReaderPages` : garde une seule occurrence par clé stable
 *   (id de page, ou concat des ids de panels à défaut). On ne coupe
 *   JAMAIS quand l'identité est absente, pour ne pas masquer des
 *   pages narrativement distinctes qui partagent les mêmes textes
 *   (silences, SFX répétés, dialogue d'un mot).
 * - `buildPagesFromChapter` : map scène→page en conservant le layout,
 *   et délègue à `pipelineScenesToPages` du grid. Idem logique
 *   identique 1:1 à la version inline du reader.
 */

import { flattenPagesToPanels, pipelineScenesToPages, type UniversalMangaPage } from "../manga-page-grid";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import type { ChapterPayload } from "./reader-types";

export function dedupeReaderPages(pages: UniversalMangaPage[]): UniversalMangaPage[] {
  const seen = new Set<string>();
  const deduped: UniversalMangaPage[] = [];
  for (const page of pages) {
    const key =
      page.id
      ?? page.panels
        .map((p) => p.id)
        .filter((id): id is string => Boolean(id))
        .join("|");
    if (!key) {
      deduped.push(page);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(page);
  }
  return deduped;
}

export function buildPagesFromChapter(chapter: ChapterPayload): UniversalMangaPage[] {
  const storyboard = chapter.storyboard as {
    pages?: Array<{ pageNumber: number; layout: string }>;
  } | null;

  const sbPages = storyboard?.pages ?? [];

  if (chapter.scenes.length === 0) {
    return [
      {
        layout: "A",
        panels: [
          {
            mood: "dramatic",
            narration: chapter.summary ?? `Chapitre ${chapter.chapterNumber}`,
          },
        ],
      },
    ];
  }

  const pipelineScenes = chapter.scenes.map((scene) => ({
    id: scene.id,
    pageLayoutTemplate: scene.pageLayoutTemplate,
    isSplashPage: scene.isSplashPage,
    isDoublePage: scene.isDoublePage,
    dramaticWeight: scene.dramaticWeight,
    images: scene.images.map((img) => ({
      id: img.id,
      panelNumber: img.panelNumber,
      mood: img.metadata?.mood,
      imageUrl: getStableImageUrl({ persistedUrl: img.persistedUrl, imageUrl: img.imageUrl }),
      persistedUrl: img.persistedUrl,
      status: img.status,
      provider: img.provider,
      model: img.model,
      metadata: img.metadata,
    })),
  }));

  return dedupeReaderPages(pipelineScenesToPages(pipelineScenes, sbPages));
}

export { flattenPagesToPanels };
