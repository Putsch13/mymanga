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
  buildReaderPanelSlots,
  legacyDialogueToPanelTextContract,
  resolvePanelTextContractFromStoryboardPanelLike,
  textContractToLegacyDialogue,
  SCENE_IMAGE_STATUS,
  type DialogueLineFragment,
  type PanelTextContract,
  type ReaderTextPlacementHint,
} from "@manga-ai-studio/core";

/**
 * FIX-31 (MOD) — Le reader manga ne doit JAMAIS afficher un panel
 * marqué FAILED ou BLOCKED par le pipeline (sauf override utilisateur)
 * — sinon le lecteur voit une case avec une image cassée ou pire un
 * placeholder "FAILED" en plein milieu d'une page. Ces panels étaient
 * persistés intentionnellement (audit / debug) mais polluaient le
 * rendu final. On filtre à l'entrée du reader.
 */
function isReaderRenderablePanel(image: {
  status?: string | null;
  userValidatedAt?: Date | null;
}): boolean {
  if (image.userValidatedAt) return true;
  if (image.status === SCENE_IMAGE_STATUS.FAILED) return false;
  if (image.status === SCENE_IMAGE_STATUS.BLOCKED) return false;
  return true;
}
import {
  buildPersistedReaderPanelSlots,
  mergePlanLayoutIntoUniversalPanel,
} from "./page-template-registry";
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
  /** Lignes blueprint / writer — prioritaires sur `dialogue` pour le contrat texte. */
  dialogueLines?: readonly DialogueLineFragment[] | null;
  narration?: string | null;
  sfx?: string[] | null;
  textPlacementHint?: ReaderTextPlacementHint | null;
  layoutHint?: string | null;
  targetAspectRatio?: string | null;
  slotType?: string | null;
  textPlacementPreference?: string | null;
  safeTextZones?: Array<{ x: number; y: number; width: number; height: number }> | null;
  /** PR9 — prioritaire pour le texte affiché si valide. */
  textContract?: unknown;
  panelTextBundle?: Readonly<{
    dialogues?: ReadonlyArray<{ speaker: string; text: string }> | null;
    narration?: string | null;
    sfx?: readonly string[] | null;
  }> | null;
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
  const rawMetadata = img.metadata as Record<string, unknown> | undefined;
  const panelIdForText = String(rawMetadata?.panelId ?? img.id);
  /** PR9 + PR5 — contrat persisté ou synthèse legacy via point d’entrée unique `legacyDialogueToPanelTextContract`. */
  const textContract: PanelTextContract = legacyDialogueToPanelTextContract({
    ...(rawMetadata ?? {}),
    panelId: panelIdForText,
  });

  const legacyDialogues = textContractToLegacyDialogue(textContract);
  const dialogues = legacyDialogues.length > 0 ? legacyDialogues : undefined;
  const firstDialogue =
    Array.isArray(dialogues) && dialogues.length > 0
      ? (dialogues[0] as { speaker?: string; text?: string })
      : undefined;

  const narrationFromContract =
    textContract.narration?.trim() ? textContract.narration : undefined;
  const sfxFromContract =
    textContract.sfx.length > 0 ? textContract.sfx.map((s) => s.text) : undefined;

  const layoutMeta = img.metadata?.layoutMeta as UniversalPanel["layoutMeta"] | undefined;
  const textMeta = img.metadata?.textMeta;
  const shotType = (rawMetadata?.shotType as string | undefined) ?? null;
  const cutawayType = (rawMetadata?.cutawayType as string | undefined) ?? null;
  const panelRole = (rawMetadata?.panelRole as string | undefined) ?? null;

  const sfxString: string | undefined =
    sfxFromContract && sfxFromContract.length > 0 ? sfxFromContract.join(" · ") : undefined;

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
    narration: narrationFromContract,
    sfx: sfxString,
    caption: img.metadata?.caption,
    textScale: img.metadata?.textScale,
    renderMeta: img.metadata?.renderMeta,
    layoutMeta: img.metadata?.layoutMeta,
    textMeta,
    generationDebugSnapshot: img.metadata?.generationDebugSnapshot,
    textContract,
    shotType,
    cutawayType,
    panelRole,
    slotType: layoutMeta?.slotType ?? null,
  };
}

function planPanelToLayoutMergeArgs(
  planPanel: PersistedStoryboardPanel,
  pageLayoutTemplate: string,
): Parameters<typeof mergePlanLayoutIntoUniversalPanel>[1] {
  return {
    layoutHint: planPanel.layoutHint ?? null,
    targetAspectRatio: planPanel.targetAspectRatio ?? null,
    slotType: planPanel.slotType ?? null,
    textPlacementPreference: planPanel.textPlacementPreference ?? null,
    safeTextZones: planPanel.safeTextZones ?? null,
    layoutTemplate: pageLayoutTemplate,
  };
}

/**
 * Aplatis toutes les scènes d'un chapitre en une liste ordonnée de panels.
 * Ordre : par scène (ordre DB), puis par `panelNumber` intra-scène.
 */
function flattenChapterPanels(chapter: ChapterPayload) {
  const out: ReturnType<typeof sceneImageToUniversalPanel>[] = [];
  for (const scene of chapter.scenes) {
    const sortedImages = [...scene.images]
      .filter((img) => isReaderRenderablePanel(img))
      .sort((a, b) => a.panelNumber - b.panelNumber);
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
      // FIX-31 — on n'enregistre pas les images FAILED/BLOCKED dans la
      // map ; le panel du plan retombera alors sur un placeholder
      // "pending" plutôt que d'afficher une image cassée.
      if (!isReaderRenderablePanel(img)) continue;
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
        if (matched) {
          return mergePlanLayoutIntoUniversalPanel(matched as UniversalPanel, planPanelToLayoutMergeArgs(planPanel, page.layoutTemplate));
        }
        const textContract = resolvePanelTextContractFromStoryboardPanelLike({
          panelId: planPanel.panelId,
          textContract: planPanel.textContract,
          dialogueLines: Array.isArray(planPanel.dialogueLines) && planPanel.dialogueLines.length > 0
            ? planPanel.dialogueLines
            : null,
          dialogue: Array.isArray(planPanel.dialogue) && planPanel.dialogue.length > 0 ? planPanel.dialogue : null,
          narration: planPanel.narration ?? null,
          sfx: Array.isArray(planPanel.sfx) ? planPanel.sfx : null,
          panelTextBundle: planPanel.panelTextBundle ?? null,
        });
        const legacyLines = textContractToLegacyDialogue(textContract);
        const dialogues = legacyLines.length > 0 ? legacyLines : undefined;
        const firstDialogue = dialogues?.[0];
        return {
          id: planPanel.panelId,
          mood: "dramatic" as AnyPanelMood,
          imageUrl: null,
          status: "pending",
          provider: null,
          model: null,
          error: null,
          dialogue: firstDialogue?.text,
          dialogues,
          speaker: firstDialogue?.speaker,
          narration: textContract.narration?.trim() ? textContract.narration : planPanel.narration ?? undefined,
          sfx:
            textContract.sfx.length > 0
              ? textContract.sfx.map((s) => s.text).join(" ")
              : Array.isArray(planPanel.sfx)
                ? planPanel.sfx.join(" ")
                : undefined,
          textContract,
          textMeta: planPanel.textPlacementHint
            ? {
                preferredAnchorZones: planPanel.textPlacementHint.preferredAnchorZones,
                overflowStrategy: planPanel.textPlacementHint.overflowStrategy,
              }
            : undefined,
          layoutMeta: {
            layoutHint: planPanel.layoutHint ?? null,
            targetAspectRatio: planPanel.targetAspectRatio ?? null,
            slotType: planPanel.slotType ?? null,
            textPlacementPreference: planPanel.textPlacementPreference ?? null,
            safeTextZones: planPanel.safeTextZones ?? null,
            layoutTemplate: page.layoutTemplate,
          },
        } satisfies UniversalPanel;
      });
      return {
        id: `page-${page.pageNumber}`,
        layout: mapPaginatorLayoutToLegacy(page.layoutTemplate),
        layoutTemplate: page.layoutTemplate as UniversalMangaPage["layoutTemplate"],
        readingDirection: "rtl",
        panelSlots: buildPersistedReaderPanelSlots(
          page.layoutTemplate,
          page.panels.map((planPanel) => planPanel.panelId),
        ),
        isSplashPage: page.layoutTemplate === "splash",
        isDoublePage: page.layoutTemplate === "double_spread",
        title: page.dramaticRole ?? undefined,
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
      readingDirection: "rtl",
      panelSlots: buildReaderPanelSlots({
        template: page.layout,
        readingDirection: "rtl",
        panelIds: universalPanels.map((panel, panelIdx) => panel.id ?? `page-${pageIdx + 1}-panel-${panelIdx + 1}`),
      }),
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
