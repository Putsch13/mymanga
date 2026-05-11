import {
  synthesizePanelTextContractFromLooseMetadata,
  textContractToLegacyDialogue,
} from "@manga-ai-studio/core";

import { getStableImageUrl } from "@/lib/images/get-stable-image-url";

import type { AnyPanelMood } from "../manga-panel";
import type {
  DemoMangaPage,
  ExtendedLayoutTemplate,
  MangaGridLayout,
  PipelinePanel,
  PipelineScene,
  UniversalMangaPage,
  UniversalPanel,
} from "./types";

export function demoPageToUniversal(page: DemoMangaPage): UniversalMangaPage {
  return {
    id: page.id,
    layout: page.layout,
    panels: page.panels.map((p) => ({
      id: p.id,
      mood: p.mood as AnyPanelMood,
      imageUrl: null,
      dialogue: p.dialogue,
      speaker: p.speaker,
      narration: p.narration,
      sfx: p.sfx,
    })),
  };
}

/**
 * Texte panel (legacy pipeline) : même source que le reader — toujours
 * `synthesizePanelTextContractFromLooseMetadata` (contrat persisté retourné
 * tel quel s'il est valide).
 */
function universalTextFieldsFromPipelinePanel(
  img: PipelinePanel,
): Pick<
  UniversalPanel,
  "dialogue" | "dialogues" | "speaker" | "narration" | "sfx" | "textContract"
> {
  const meta = img.metadata as Record<string, unknown> | undefined;
  if (!meta) {
    return {};
  }
  const panelId = String(meta.panelId ?? (img as { id?: string }).id ?? "panel");
  const textContract = synthesizePanelTextContractFromLooseMetadata(meta, panelId);
  const legacy = textContractToLegacyDialogue(textContract);
  const dialoguesFromLegacy = legacy.length > 0 ? legacy : undefined;
  const narrationFromContract = textContract.narration ?? undefined;
  const sfxFromContract =
    textContract.sfx.length > 0 ? textContract.sfx.map((s) => s.text) : undefined;

  const dialogues = dialoguesFromLegacy;
  const firstDialogue =
    Array.isArray(dialogues) && dialogues.length > 0
      ? (dialogues[0] as { speaker?: string; text?: string })
      : undefined;

  const sfxString: string | undefined =
    sfxFromContract && sfxFromContract.length > 0 ? sfxFromContract.join(" · ") : undefined;

  return {
    dialogue: firstDialogue?.text,
    dialogues,
    speaker: firstDialogue?.speaker,
    narration: narrationFromContract,
    sfx: sfxString,
    textContract,
  };
}

function normalizeLayout(layout: MangaGridLayout, panelCount: number): MangaGridLayout {
  if (panelCount <= 4) return "F";
  if (panelCount === 5) return layout === "C" || layout === "E" ? layout : "C";
  if (panelCount === 6) {
    const sixLayouts: MangaGridLayout[] = ["A", "B", "D"];
    return sixLayouts.includes(layout) ? layout : "A";
  }
  return "A";
}

/**
 * @deprecated Sprint 1 — Reader refacto
 *
 * Cette fonction souffrait du bug utilisateur principal : elle assumait
 * `scene === page` et faisait un `slice(0, 6)` silencieux sur les panels
 * au-delà de 6 par scène (un simple `console.warn` les dropait).
 *
 * Le reader officiel utilise maintenant `buildPagesFromChapter` (dans
 * `reader/build-reader-pages.ts`) qui s'appuie sur `buildMangaPagesFromPanels`
 * (répartition multi-pages, aucun panel perdu).
 *
 * Cette fonction est conservée pour la rétrocompatibilité des consommateurs
 * externes (export PDF, routes composites) mais ne tronque plus : les panels
 * en excès débordent vers des pages supplémentaires, ce qui est aligné avec
 * le moteur de pagination moderne.
 */
export function pipelineScenesToPages(
  scenes: PipelineScene[],
  storyboardPages?: Array<{ pageNumber: number; layout: string }>,
): UniversalMangaPage[] {
  const MAX_PANELS_PER_PAGE = 6;

  return scenes.flatMap((scene, idx) => {
    const sbPage = storyboardPages?.[idx];
    const rawLayout = (sbPage?.layout as MangaGridLayout) ?? "A";

    const rawImages = (scene.images ?? []).slice().sort((a, b) => a.panelNumber - b.panelNumber);

    if (rawImages.length > MAX_PANELS_PER_PAGE) {
      console.warn(
        `[pipelineScenesToPages] scene=${scene.id} panels=${rawImages.length} > ${MAX_PANELS_PER_PAGE} — split en pages multiples (le reader moderne utilise buildPagesFromChapter + buildMangaPagesFromPanels)`,
      );
    }

    const imageGroups: PipelinePanel[][] = [];
    for (let i = 0; i < rawImages.length; i += MAX_PANELS_PER_PAGE) {
      imageGroups.push(rawImages.slice(i, i + MAX_PANELS_PER_PAGE));
    }
    if (imageGroups.length === 0) imageGroups.push([]);

    return imageGroups.map((group, groupIdx) => {
      const panels: UniversalPanel[] = group.map((img) => {
        const effectiveImageUrl = getStableImageUrl({
          persistedUrl: (img as { persistedUrl?: string | null }).persistedUrl ?? null,
          imageUrl: img.imageUrl,
        });
        const textFields = universalTextFieldsFromPipelinePanel(img);
        return {
          id: (img as { id?: string }).id,
          mood: (img.mood as AnyPanelMood) ?? "dramatic",
          imageUrl: effectiveImageUrl,
          status: img.status,
          provider: img.provider ?? null,
          model: img.model ?? null,
          error: (img.metadata?.error ?? img.metadata?.blockedReason) ?? null,
          ...textFields,
          caption: img.metadata?.caption,
          textScale: img.metadata?.textScale,
          renderMeta: img.metadata?.renderMeta,
          layoutMeta: img.metadata?.layoutMeta,
          textMeta: img.metadata?.textMeta,
          generationDebugSnapshot: img.metadata?.generationDebugSnapshot,
        };
      });

      if (panels.length === 0) {
        return {
          id: scene.id,
          layout: "F" as MangaGridLayout,
          panels: [
            {
              mood: "dramatic" as AnyPanelMood,
              imageUrl: null,
              status: "pending",
              narration: "Génération en cours…",
            },
          ],
        };
      }

      const layout = normalizeLayout(rawLayout, panels.length);
      const dynamicTemplate = scene.pageLayoutTemplate as ExtendedLayoutTemplate | null | undefined;

      const pageId = imageGroups.length > 1 ? `${scene.id}__${groupIdx + 1}` : scene.id;

      return {
        id: pageId,
        layout,
        layoutTemplate: dynamicTemplate ?? undefined,
        isSplashPage: groupIdx === 0 ? (scene.isSplashPage ?? false) : false,
        isDoublePage: groupIdx === 0 ? (scene.isDoublePage ?? false) : false,
        panels,
      };
    });
  });
}

export function flattenPagesToPanels(
  pages: UniversalMangaPage[],
): Array<UniversalPanel & { pageId?: string; pageNumber: number }> {
  return pages.flatMap((page, pageIndex) =>
    page.panels.map((panel) => ({
      ...panel,
      pageId: page.id,
      pageNumber: pageIndex + 1,
    })),
  );
}
