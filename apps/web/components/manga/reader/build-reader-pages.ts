/**
 * Construction des pages universelles à partir d'un chapitre.
 *
 * Sprint 1 — Reader refacto : on remplace l'ancien `pipelineScenesToPages`
 * (qui faisait `slice(0, 6)` par scène et droppait silencieusement les
 * panels au-delà) par le nouveau `buildMangaPagesFromPanels` qui :
 *   - ne perd jamais un panel
 *   - répartit intelligemment les scènes longues sur plusieurs pages
 *   - isole les splashs
 *
 * `buildWebtoonFlow` est exposé en parallèle pour le mode webtoon (scroll
 * vertical linéaire).
 *
 * `dedupeReaderPages` reste disponible pour retirer d'éventuels doublons
 * exacts qu'un consommateur amont aurait introduits (pas strictement
 * nécessaire avec le nouveau moteur, mais gardé pour sécurité).
 */

import { flattenPagesToPanels, type PipelinePanel, type UniversalMangaPage, type UniversalPanel } from "../manga-page-grid";
import {
  buildMangaPagesFromPanels,
  type MangaPaginatorPanel,
} from "../pagination/manga-pagination-engine";
import {
  buildWebtoonFlowFromPanels,
  type WebtoonBlock,
} from "../pagination/webtoon-flow-builder";
import type { AnyPanelMood } from "../manga-panel";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import type { ChapterPayload, SceneImage } from "./reader-types";

/**
 * Pipeline v3 — si le chapitre a un `StoryboardPlan` persisté dans
 * `outline.storyboardPlanV2`, on affiche les pages EXACTEMENT comme
 * décidées par le Manga Editor (IA 2). On ne repagine plus depuis les
 * panels. Les "cases vides" sans image deviennent des placeholders
 * portant un statut (pending/generating/failed), jamais des cases blanches
 * silencieuses.
 */
interface PersistedStoryboardPanel {
  panelId: string;
  pageNumber: number;
  panelNumberInPage: number;
  renderMode?: string | null;
  shotType?: string | null;
  subjectFocus?: string | null;
  cutawayType?: string | null;
  sourceBeatId?: string | null;
  locationName?: string | null;
  actionLine?: string | null;
  emotionLine?: string | null;
  dialogue?: Array<{ speaker: string; text: string }> | null;
  narration?: string | null;
  sfx?: string[] | null;
}

interface PersistedStoryboardPage {
  pageNumber: number;
  layoutTemplate: string;
  dramaticRole?: string | null;
  beatIds?: string[] | null;
  panels: PersistedStoryboardPanel[];
}

interface PersistedStoryboardPlan {
  chapterId: string;
  totalTargetPanels: number;
  pages: PersistedStoryboardPage[];
  editorialDiagnostics?: unknown;
}

function extractPersistedStoryboardPlan(outline: unknown): PersistedStoryboardPlan | null {
  if (!outline || typeof outline !== "object" || Array.isArray(outline)) return null;
  const raw = (outline as Record<string, unknown>)["storyboardPlanV2"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const plan = raw as Record<string, unknown>;
  if (!Array.isArray(plan.pages) || plan.pages.length === 0) return null;
  return raw as unknown as PersistedStoryboardPlan;
}

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

/**
 * Convertit un `SceneImage` (DB) en `UniversalPanel` (reader).
 * Garantit que `sceneId` est présent pour que le paginator respecte les
 * frontières de scène.
 */
function sceneImageToUniversalPanel(img: SceneImage, sceneId: string): UniversalPanel & {
  sceneId: string;
  panelNumber: number;
  shotType: string | null;
  cutawayType: string | null;
  panelRole: string | null;
  slotType: string | null;
} {
  const effectiveImageUrl = getStableImageUrl({
    persistedUrl: img.persistedUrl,
    imageUrl: img.imageUrl,
  });
  const dialogueArray = Array.isArray(img.metadata?.dialogue)
    ? img.metadata.dialogue
    : img.metadata?.dialogue
      ? [img.metadata.dialogue]
      : undefined;
  const dialogues = Array.isArray(img.metadata?.dialogues) ? img.metadata.dialogues : dialogueArray;
  const firstDialogue = Array.isArray(img.metadata?.dialogue)
    ? img.metadata.dialogue[0]
    : img.metadata?.dialogue;

  const layoutMeta = img.metadata?.layoutMeta as
    | { slotType?: string | null; targetAspectRatio?: string; layoutTemplate?: string }
    | undefined;
  const rawMetadata = img.metadata as Record<string, unknown> | undefined;
  const shotType = (rawMetadata?.shotType as string | undefined) ?? null;
  const cutawayType = (rawMetadata?.cutawayType as string | undefined) ?? null;
  const panelRole = (rawMetadata?.panelRole as string | undefined) ?? null;

  return {
    id: img.id,
    sceneId,
    panelNumber: img.panelNumber,
    mood: (img.metadata?.mood as AnyPanelMood) ?? "dramatic",
    imageUrl: effectiveImageUrl,
    status: img.status,
    provider: img.provider ?? null,
    model: img.model ?? null,
    error: (img.metadata?.error ?? img.metadata?.blockedReason) ?? null,
    dialogue: firstDialogue?.text,
    dialogues,
    speaker: firstDialogue?.speaker,
    narration: img.metadata?.narration,
    sfx: img.metadata?.sfx,
    caption: img.metadata?.caption,
    textScale: img.metadata?.textScale,
    renderMeta: img.metadata?.renderMeta,
    layoutMeta: img.metadata?.layoutMeta,
    shotType,
    cutawayType,
    panelRole,
    slotType: layoutMeta?.slotType ?? null,
  };
}

/**
 * Aplatis toutes les scènes d'un chapitre en une liste ordonnée de panels.
 * Ordre : par scène (ordre DB), puis par `panelNumber` intra-scène.
 */
function flattenChapterPanels(chapter: ChapterPayload) {
  const out: ReturnType<typeof sceneImageToUniversalPanel>[] = [];
  for (const scene of chapter.scenes) {
    const sortedImages = [...scene.images].sort((a, b) => a.panelNumber - b.panelNumber);
    for (const img of sortedImages) {
      out.push(sceneImageToUniversalPanel(img, scene.id));
    }
  }
  return out;
}

/**
 * Construit les pages manga à partir d'un chapitre :
 *   1. Si un `StoryboardPlan` (v3) est persisté dans `outline.storyboardPlanV2`,
 *      on l'utilise TEL QUEL : pageNumber / layoutTemplate / panelId sont la
 *      source de vérité. Les panels sans image deviennent des placeholders.
 *   2. Sinon, fallback legacy : pagination via `buildMangaPagesFromPanels`.
 */
export function buildPagesFromChapter(chapter: ChapterPayload): UniversalMangaPage[] {
  const persistedPlan = extractPersistedStoryboardPlan(chapter.outline);
  if (persistedPlan && persistedPlan.pages.length > 0) {
    return buildPagesFromPersistedStoryboard(chapter, persistedPlan);
  }
  return buildPagesFromLegacyPanels(chapter);
}

/**
 * Construit les pages depuis un StoryboardPlan v3 persisté. N'invente
 * JAMAIS de pageNumber ni de layout. Les panels sans image rendue sont
 * reportés avec `status: "pending"` et `imageUrl: null` pour que le
 * rendu UI affiche un placeholder d'état plutôt qu'une case blanche.
 */
function buildPagesFromPersistedStoryboard(
  chapter: ChapterPayload,
  plan: PersistedStoryboardPlan,
): UniversalMangaPage[] {
  const panelsByIdentifier = new Map<string, ReturnType<typeof sceneImageToUniversalPanel>>();
  for (const scene of chapter.scenes) {
    for (const img of scene.images) {
      const meta = img.metadata as Record<string, unknown> | undefined;
      const panelId = (meta?.panelId as string | undefined) ?? null;
      const universal = sceneImageToUniversalPanel(img, scene.id);
      if (panelId) panelsByIdentifier.set(panelId, universal);
      panelsByIdentifier.set(img.id, universal);
    }
  }

  return plan.pages
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => {
      const universalPanels: UniversalPanel[] = page.panels.map((planPanel) => {
        const matched = panelsByIdentifier.get(planPanel.panelId);
        if (matched) return matched as UniversalPanel;
        const firstDialogue = planPanel.dialogue?.[0];
        return {
          id: planPanel.panelId,
          mood: "dramatic" as AnyPanelMood,
          imageUrl: null,
          status: "pending",
          provider: null,
          model: null,
          error: null,
          dialogue: firstDialogue?.text,
          dialogues: planPanel.dialogue ?? undefined,
          speaker: firstDialogue?.speaker,
          narration: planPanel.narration ?? undefined,
          sfx: Array.isArray(planPanel.sfx) ? planPanel.sfx.join(" ") : undefined,
        } as UniversalPanel;
      });

      return {
        id: `page-${page.pageNumber}`,
        layout: mapPaginatorLayoutToLegacy(page.layoutTemplate),
        layoutTemplate: page.layoutTemplate as UniversalMangaPage["layoutTemplate"],
        isSplashPage: page.layoutTemplate === "splash",
        isDoublePage: page.layoutTemplate === "double_spread",
        panels: universalPanels,
      } satisfies UniversalMangaPage;
    });
}

function buildPagesFromLegacyPanels(chapter: ChapterPayload): UniversalMangaPage[] {
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

  const panels = flattenChapterPanels(chapter);
  if (panels.length === 0) {
    return [];
  }

  const paginatorPanels: MangaPaginatorPanel[] = panels.map((p) => ({
    id: p.id,
    sceneId: p.sceneId,
    panelNumber: p.panelNumber,
    shotType: p.shotType,
    cutawayType: p.cutawayType,
    panelRole: p.panelRole,
    slotType: p.slotType,
    isSplash: null,
  }));

  // Flag splash depuis la DB : si la scène est marquée splash et ne contient
  // qu'un panel, on propage l'info au paginator.
  for (let i = 0; i < panels.length; i++) {
    const scene = chapter.scenes.find((s) => s.id === panels[i]!.sceneId);
    if (scene?.isSplashPage && scene.images.length === 1) {
      paginatorPanels[i]!.isSplash = true;
    }
  }

  const paginatorOutput = buildMangaPagesFromPanels(paginatorPanels);

  const universalPages: UniversalMangaPage[] = paginatorOutput.map((page, pageIdx) => {
    // Mappe chaque panel paginator vers l'UniversalPanel complet (avec imageUrl/dialogue/etc).
    const universalPanels = page.panels.map((paginatorPanel) => {
      const full = panels.find((p) => p.id === paginatorPanel.id);
      if (!full) {
        return {
          id: paginatorPanel.id,
          mood: "dramatic" as AnyPanelMood,
          imageUrl: null,
        } satisfies UniversalPanel;
      }
      return full as UniversalPanel;
    });

    // Le layout moderne (PageLayoutTemplate) est prioritaire. On fournit
    // aussi un fallback `layout` A–F compatible avec l'ancien
    // MangaPageGrid si le template n'est pas reconnu.
    const legacyLayout = mapPaginatorLayoutToLegacy(page.layout);

    return {
      id: page.dominantSceneId ?? `page-${pageIdx + 1}`,
      layout: legacyLayout,
      layoutTemplate: page.layout,
      isSplashPage: page.isSplashPage,
      isDoublePage: page.isDoublePage,
      panels: universalPanels,
    };
  });

  return universalPages;
}

/**
 * Construit le flux webtoon (scroll vertical linéaire) à partir d'un chapitre.
 * Aucun grouping de pages — tous les panels s'affichent dans l'ordre.
 */
export function buildWebtoonFlowFromChapter(
  chapter: ChapterPayload,
): WebtoonBlock<ReturnType<typeof sceneImageToUniversalPanel>>[] {
  if (chapter.scenes.length === 0) return [];
  const panels = flattenChapterPanels(chapter);
  return buildWebtoonFlowFromPanels(panels);
}

/**
 * Mappe un layout paginator moderne vers un layout legacy A–F compatible
 * avec l'ancien rendu `MangaPageGrid`. Le champ `layoutTemplate` porte la
 * vraie info moderne ; `layout` n'est gardé que pour la compatibilité.
 */
function mapPaginatorLayoutToLegacy(layout: string): "A" | "B" | "C" | "D" | "E" | "F" {
  switch (layout) {
    case "splash":
      return "F";
    case "double_spread":
      return "F";
    case "grid_2x2":
      return "F";
    case "grid_2x3":
      return "A";
    case "action_strip":
      return "B";
    case "asymmetric_hero":
      return "C";
    case "cinematic_bar":
      return "E";
    case "focus_closeup":
      return "D";
    case "vertical_strip":
      return "E";
    default:
      return "A";
  }
}

export { flattenPagesToPanels };

// Types utilitaires (exposés pour les tests).
export type { PipelinePanel };
