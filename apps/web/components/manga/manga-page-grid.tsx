"use client";

import type React from "react";
import type { AnyPanelMood } from "./manga-panel";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import type { GenerationDebugSnapshot, ReaderTextPlacementHint } from "@manga-ai-studio/core";

type DemoPanel = {
  id: string;
  size: "wide" | "tall" | "large" | "normal";
  mood: string;
  dialogue?: string;
  speaker?: string;
  narration?: string;
  sfx?: string;
  characters?: string[];
};

export type DemoMangaPage = {
  id: string;
  layout: "A" | "B" | "C" | "D" | "E";
  panels: DemoPanel[];
};
import { MangaPanel } from "./manga-panel";
import {
  PAGE_LAYOUT_CONFIGS,
  getReaderLayoutDescriptor,
  type PageLayoutTemplate,
  type ReadingDirection,
} from "@manga-ai-studio/core";
// P1-4 : source of truth unique (packages/core) — plus de copie locale.

/**
 * Layout presets for manga pages (4–6 panels).
 * Each uses CSS grid-template-areas.
 * Panels are mapped to grid areas a-f.
 */
const LAYOUT_STYLES: Record<"A" | "B" | "C" | "D" | "E" | "F", React.CSSProperties> = {
  // Layout A: 6 panels — 2 top, 1 wide, 2 + 1 tall bottom
  A: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 0.8fr 1fr 1fr",
    gridTemplateAreas: `
      "a a b b"
      "c c c c"
      "d d e e"
      "d d f f"
    `,
    gap: "3px",
  },
  // Layout B: 6 panels — 1 large left + 2 right + 3 bottom (kept for compat)
  B: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1.3fr 1fr 0.9fr",
    gridTemplateAreas: `
      "a a b b"
      "c c c c"
      "d d e f"
    `,
    gap: "3px",
  },
  // Layout C: 5 panels — 1 wide top, 2 mid, 1 wide bottom (last area unused for 5)
  C: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "0.9fr 1.2fr 0.9fr",
    gridTemplateAreas: `
      "a a a a"
      "b b c c"
      "d d e e"
    `,
    gap: "3px",
  },
  // Layout D: 6 panels — 1 wide top, 2 mid, 1 action, 2 bottom
  D: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "0.8fr 1.3fr 1fr 0.9fr",
    gridTemplateAreas: `
      "a a a a"
      "b b c c"
      "d d d d"
      "e e f f"
    `,
    gap: "3px",
  },
  // Layout E: 5 panels — 1 tall left + 2 right stacked + 2 bottom
  E: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1.2fr 1.2fr 0.9fr",
    gridTemplateAreas: `
      "a a b b"
      "a a c c"
      "d d e e"
    `,
    gap: "3px",
  },
  // Layout F: 4 panels — 2×2 equal grid
  F: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridTemplateRows: "1fr 1fr",
    gridTemplateAreas: `
      "a b"
      "c d"
    `,
    gap: "3px",
  },
};

const AREA_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

// ── Types universels ──────────────────────────────────────────────────────

export interface UniversalPanel {
  id?: string;
  mood: AnyPanelMood;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  dialogue?: string;
  dialogues?: Array<{ speaker: string; text: string }>;
  speaker?: string;
  narration?: string;
  sfx?: string;
  caption?: string;
  textScale?: "normal" | "compact" | "micro";
  /** Métadonnées de rendu strict pour éviter le crop arbitraire */
  renderMeta?: {
    cropMode?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    reservedTextZones?: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
  };
  /** Métadonnées de layout pour choix intelligent de la page */
  layoutMeta?: {
    slotType?: string | null;
    targetAspectRatio?: string | null;
    layoutTemplate?: string | null;
    layoutHint?: string | null;
    textPlacementPreference?: string | null;
    safeTextZones?: Array<{ x: number; y: number; width: number; height: number }> | null;
    isSplashPage?: boolean;
    isDoublePage?: boolean;
  };
  textMeta?: ReaderTextPlacementHint & {
    overlayReadingDirection?: ReadingDirection;
  };
  generationDebugSnapshot?: GenerationDebugSnapshot;
}

// LAY-2 : types étendus pour les nouveaux templates de layout
// P1-4 : la partie dynamique (splash/double_spread/...) vient de core.
export type ExtendedLayoutTemplate =
  | "A" | "B" | "C" | "D" | "E" | "F"  // Legacy
  | PageLayoutTemplate;

export interface UniversalMangaPage {
  id?: string;
  layout: "A" | "B" | "C" | "D" | "E" | "F";
  /** LAY-2 : template étendu (prioritaire sur layout si présent) */
  layoutTemplate?: ExtendedLayoutTemplate;
  readingDirection?: ReadingDirection;
  panelSlots?: Array<{ panelId?: string; area: string; order: number }>;
  isSplashPage?: boolean;
  isDoublePage?: boolean;
  title?: string | null;
  panels: UniversalPanel[];
}

// ── Conversion DemoMangaPage → UniversalMangaPage ─────────────────────────

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

// ── Conversion données pipeline → UniversalMangaPage ─────────────────────

export interface PipelinePanel {
  panelNumber: number;
  mood?: string;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  metadata?: {
    dialogue?: { speaker: string; text: string } | Array<{ speaker: string; text: string }>;
    dialogues?: Array<{ speaker: string; text: string }>;
    narration?: string;
    sfx?: string;
    caption?: string;
    layout?: string;
    textScale?: "normal" | "compact" | "micro";
    error?: string;
    blockedReason?: string;
    renderMeta?: UniversalPanel["renderMeta"];
    layoutMeta?: UniversalPanel["layoutMeta"];
    textMeta?: UniversalPanel["textMeta"];
    generationDebugSnapshot?: GenerationDebugSnapshot;
  };
}

export interface PipelineScene {
  id: string;
  images?: PipelinePanel[];
  // URGENCE 3 : champs layout depuis la DB
  pageLayoutTemplate?: string | null;
  isSplashPage?: boolean | null;
  isDoublePage?: boolean | null;
  dramaticWeight?: number | null;
}

type MangaGridLayout = "A" | "B" | "C" | "D" | "E" | "F";

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
  // Sprint 1 : on garde une notion de "max slots par layout A–F" (6), mais
  // on ne tronque plus : les panels en surplus produisent plusieurs pages.
  const MAX_PANELS_PER_PAGE = 6;
  function normalizeLayout(layout: MangaGridLayout, panelCount: number): MangaGridLayout {
    if (panelCount <= 4) return "F";
    if (panelCount === 5) return layout === "C" || layout === "E" ? layout : "C";
    if (panelCount === 6) {
      const sixLayouts: MangaGridLayout[] = ["A", "B", "D"];
      return sixLayouts.includes(layout) ? layout : "A";
    }
    return "A";
  }

  return scenes.flatMap((scene, idx) => {
    const sbPage = storyboardPages?.[idx];
    const rawLayout = (sbPage?.layout as MangaGridLayout) ?? "A";

    const rawImages = (scene.images ?? []).slice().sort((a, b) => a.panelNumber - b.panelNumber);

    // Sprint 1 : répartit les panels en excès sur plusieurs pages au lieu
    // de les droper. Si une scène a 12 panels, on émet 2 pages de 6.
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
        return {
          id: (img as { id?: string }).id,
          mood: (img.mood as AnyPanelMood) ?? "dramatic",
          imageUrl: effectiveImageUrl,
          status: img.status,
          provider: img.provider ?? null,
          model: img.model ?? null,
          error: (img.metadata?.error ?? img.metadata?.blockedReason) ?? null,
          dialogue: Array.isArray(img.metadata?.dialogue) ? img.metadata.dialogue[0]?.text : img.metadata?.dialogue?.text,
          dialogues: Array.isArray(img.metadata?.dialogues) ? img.metadata.dialogues : Array.isArray(img.metadata?.dialogue) ? img.metadata.dialogue : img.metadata?.dialogue ? [img.metadata.dialogue] : undefined,
          speaker: Array.isArray(img.metadata?.dialogue) ? img.metadata.dialogue[0]?.speaker : img.metadata?.dialogue?.speaker,
          narration: img.metadata?.narration,
          sfx: img.metadata?.sfx,
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
          panels: [{
            mood: "dramatic" as AnyPanelMood,
            imageUrl: null,
            status: "pending",
            narration: "Génération en cours…",
          }],
        };
      }

      const layout = normalizeLayout(rawLayout, panels.length);
      const dynamicTemplate = scene.pageLayoutTemplate as ExtendedLayoutTemplate | null | undefined;

      // Si la scène a été splittée en plusieurs pages, on suffixe l'id pour
      // éviter les collisions côté dedupe.
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

// ── Composant principal ───────────────────────────────────────────────────

type Props = {
  page: UniversalMangaPage | DemoMangaPage;
  readingDirection?: ReadingDirection;
};

type FitResult = { fit: "cover" | "contain"; position: string };

/**
 * Choisir le fit/position d'un panel en fonction de son slotType et renderMeta.
 * NE PLUS forcer cover arbitrairement basé uniquement sur la position dans la grille.
 */
function pickPanelImageFit(
  panel: UniversalPanel
  // layout and area params removed (no longer needed with renderMeta/layoutMeta approach)
): FitResult {
  // 1. Si renderMeta.cropMode est explicite, l'utiliser (priorité absolue)
  if (panel.renderMeta?.cropMode) {
    const position = panel.renderMeta.focalPoint
      ? `${panel.renderMeta.focalPoint.x * 100}% ${panel.renderMeta.focalPoint.y * 100}%`
      : "center";
    return { fit: panel.renderMeta.cropMode, position };
  }

  // 2. Si layoutMeta.slotType suggère un crop spécifique
  const slotType = panel.layoutMeta?.slotType;
  if (slotType === "wide") {
    // Wide peut bénéficier de cover si l'image est paysage
    return { fit: "cover", position: "center top" };
  }
  if (slotType === "tall") {
    return { fit: "cover", position: "top" };
  }
  if (slotType === "closeup" || slotType === "dialogue") {
    // Closeup/dialogue: prefer contain pour ne pas couper les visages
    return { fit: "contain", position: "center" };
  }

  // 3. Fallback: CONTAIN par défaut pour éviter de couper cheveux/yeux.
  // Quand la composition finale sera propre, on pourra remettre du cover slot par slot
  // avec un focalPoint explicite.
  return { fit: "contain", position: "center" };
}

function isDemoPage(page: UniversalMangaPage | DemoMangaPage): page is DemoMangaPage {
  // DemoMangaPage panels ont un champ `size` et un `id`
  return (
    "panels" in page &&
    page.panels.length > 0 &&
    "size" in page.panels[0]!
  );
}

export function MangaPageGrid({ page, readingDirection }: Props) {
  const universal: UniversalMangaPage = isDemoPage(page)
    ? demoPageToUniversal(page)
    : (page as UniversalMangaPage);

  // LAY-2 : résolution du layout — priorité aux nouveaux templates
  const extTemplate = universal.layoutTemplate;
  const resolvedReadingDirection = readingDirection ?? universal.readingDirection ?? "ltr";
  const baseTemplate =
    extTemplate && !String(extTemplate).endsWith("_rtl")
      ? (extTemplate as PageLayoutTemplate)
      : undefined;
  const dynamicDescriptor = baseTemplate
    ? getReaderLayoutDescriptor(baseTemplate, resolvedReadingDirection)
    : null;
  const dynamicConfig = dynamicDescriptor
    ?? (extTemplate && PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]
      ? {
          templateId: extTemplate,
          readingDirection: resolvedReadingDirection,
          cssGridAreas: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.cssGridAreas,
          cssGridTemplate: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.cssGridTemplate,
          areas: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.areas,
          panelWeights: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.panelWeights,
          defaultAspectRatios: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.defaultAspectRatios,
        }
      : null);
  const layoutStyle: React.CSSProperties = dynamicConfig
    ? {
        display: "grid",
        gridTemplateAreas: dynamicConfig.cssGridAreas,
        gridTemplate: dynamicConfig.cssGridTemplate,
        gap: "3px",
      }
    : (LAYOUT_STYLES[universal.layout] ?? LAYOUT_STYLES.A);
  const orderedAreas = dynamicConfig?.areas ?? AREA_NAMES;
  const slotByPanelId = new Map(
    (universal.panelSlots ?? []).map((slot) => [slot.panelId ?? `panel-${slot.order}`, slot.area]),
  );
  const renderedPanels = universal.panels.map((panel, i) => {
    const area =
      (panel.id ? slotByPanelId.get(panel.id) : undefined)
      ?? universal.panelSlots?.[i]?.area
      ?? orderedAreas[i]
      ?? "a";
    const { fit, position } = pickPanelImageFit(panel);
    return (
      <MangaPanel
        key={panel.id ?? `panel-${i}`}
        mood={panel.mood}
        imageUrl={panel.imageUrl}
        status={panel.status}
        provider={panel.provider}
        model={panel.model}
        error={panel.error}
        sceneImageId={panel.id}
        dialogue={panel.dialogue}
        dialogues={panel.dialogues}
        speaker={panel.speaker}
        narration={panel.narration}
        sfx={panel.sfx}
        caption={panel.caption}
        textScale={panel.textScale}
        renderMeta={panel.renderMeta}
        layoutMeta={panel.layoutMeta}
        textMeta={panel.textMeta}
        imageFit={fit}
        objectPosition={position}
        panelIndex={i}
        className="min-h-0"
        style={{ gridArea: area }}
      />
    );
  });

  return (
    <div
      className="h-full w-full bg-stone-900"
      style={{
        ...layoutStyle,
        padding: "3px",
        aspectRatio: "2 / 3",
        maxHeight: "100%",
        minHeight: 0,
      }}
    >
      {renderedPanels}
    </div>
  );
}
