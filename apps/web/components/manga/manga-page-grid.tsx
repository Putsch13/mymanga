"use client";

import type React from "react";
import type { DemoMangaPage } from "@/lib/demo-data";
import type { AnyPanelMood } from "./manga-panel";
import { MangaPanel } from "./manga-panel";

// LAY-2 : configs CSS locales des templates de layout dynamique
// (copie légère de PAGE_LAYOUT_CONFIGS — évite d'importer @manga-ai-studio/ai côté client)
const PAGE_LAYOUT_CONFIGS: Record<string, { cssGridTemplate: string; cssGridAreas: string }> = {
  splash:          { cssGridTemplate: "1fr",                          cssGridAreas: `"a"` },
  double_spread:   { cssGridTemplate: "1fr 1fr",                      cssGridAreas: `"a b"` },
  grid_2x2:        { cssGridTemplate: "1fr 1fr / 1fr 1fr",            cssGridAreas: `"a b" "c d"` },
  grid_2x3:        { cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr",        cssGridAreas: `"a b c" "d e f"` },
  action_strip:    { cssGridTemplate: "1.5fr 1fr 1fr / 1fr 1fr 1fr",  cssGridAreas: `"a a b" "a a c" "d e f"` },
  asymmetric_hero: { cssGridTemplate: "1.2fr 1fr / 1fr 1fr 1fr",      cssGridAreas: `"a a b" "a a c"` },
  cinematic_bar:   { cssGridTemplate: "1fr 1fr 1fr / 1fr",            cssGridAreas: `"a" "b" "c"` },
  focus_closeup:   { cssGridTemplate: "1.5fr 1fr / 1fr 1fr",          cssGridAreas: `"a a" "b c"` },
  montage_rapid:   { cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr 1fr",    cssGridAreas: `"a b c d" "e f g h"` },
  vertical_strip:  { cssGridTemplate: "1fr / 1fr 1fr 1fr",            cssGridAreas: `"a b c"` },
};

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
    slotType?: "wide" | "tall" | "square" | "closeup" | "dialogue";
    targetAspectRatio?: string;
    layoutTemplate?: string;
  };
}

// LAY-2 : types étendus pour les nouveaux templates de layout
export type ExtendedLayoutTemplate =
  | "A" | "B" | "C" | "D" | "E" | "F"  // Legacy
  | "splash" | "double_spread" | "grid_2x2" | "grid_2x3"
  | "action_strip" | "asymmetric_hero" | "cinematic_bar"
  | "focus_closeup" | "montage_rapid" | "vertical_strip";

export interface UniversalMangaPage {
  id?: string;
  layout: "A" | "B" | "C" | "D" | "E" | "F";
  /** LAY-2 : template étendu (prioritaire sur layout si présent) */
  layoutTemplate?: ExtendedLayoutTemplate;
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

export function pipelineScenesToPages(
  scenes: PipelineScene[],
  storyboardPages?: Array<{ pageNumber: number; layout: string }>,
): UniversalMangaPage[] {
  function normalizeLayout(layout: MangaGridLayout, panelCount: number): MangaGridLayout {
    // Map panel count to a layout that has exactly that many areas.
    if (panelCount <= 4) return "F";
    if (panelCount === 5) return layout === "C" || layout === "E" ? layout : "C";
    // 6 panels
    const sixLayouts: MangaGridLayout[] = ["A", "B", "D"];
    return sixLayouts.includes(layout) ? layout : "A";
  }

  return scenes.map((scene, idx) => {
    const sbPage = storyboardPages?.[idx];
    const rawLayout = (sbPage?.layout as MangaGridLayout) ?? "A";

    const panels: UniversalPanel[] = (scene.images ?? [])
      .sort((a, b) => a.panelNumber - b.panelNumber)
      .map((img) => {
        // URGENCE 3 : préférer persistedUrl (URL stable Supabase) sur imageUrl (peut expirer)
        const effectiveImageUrl = (img as { persistedUrl?: string | null }).persistedUrl ?? img.imageUrl;
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
        };
      });

    // Garde : si aucun panel, créer un placeholder pour éviter une page visuellement vide
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

    // URGENCE 3 : utiliser le template dynamique si présent (priorité sur le layout A-F)
    const dynamicTemplate = scene.pageLayoutTemplate as ExtendedLayoutTemplate | null | undefined;

    return {
      id: scene.id,
      layout,
      layoutTemplate: dynamicTemplate ?? undefined,
      isSplashPage: scene.isSplashPage ?? false,
      isDoublePage: scene.isDoublePage ?? false,
      panels,
    };
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

  // 3. Fallback: COVER par défaut pour remplir le panel (comportement original)
  return { fit: "cover", position: "center top" };
}

function isDemoPage(page: UniversalMangaPage | DemoMangaPage): page is DemoMangaPage {
  // DemoMangaPage panels ont un champ `size` et un `id`
  return (
    "panels" in page &&
    page.panels.length > 0 &&
    "size" in page.panels[0]!
  );
}

export function MangaPageGrid({ page }: Props) {
  const universal: UniversalMangaPage = isDemoPage(page)
    ? demoPageToUniversal(page)
    : (page as UniversalMangaPage);

  // LAY-2 : résolution du layout — priorité aux nouveaux templates
  const extTemplate = universal.layoutTemplate;
  const dynamicConfig = extTemplate && PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS];
  const layoutStyle: React.CSSProperties = dynamicConfig
    ? {
        display: "grid",
        gridTemplateAreas: dynamicConfig.cssGridAreas,
        gridTemplate: dynamicConfig.cssGridTemplate,
        gap: "3px",
      }
    : (LAYOUT_STYLES[universal.layout] ?? LAYOUT_STYLES.A);
  const renderedPanels = universal.panels.map((panel, i) => {
    const area = AREA_NAMES[i] ?? "a";
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
