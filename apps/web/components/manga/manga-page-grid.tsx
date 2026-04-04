"use client";

import type { DemoMangaPage } from "@/lib/demo-data";
import type { AnyPanelMood } from "./manga-panel";
import { MangaPanel } from "./manga-panel";

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
  speaker?: string;
  narration?: string;
  sfx?: string;
  caption?: string;
  textScale?: "normal" | "compact" | "micro";
}

export interface UniversalMangaPage {
  id?: string;
  layout: "A" | "B" | "C" | "D" | "E" | "F";
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
    dialogue?: { speaker: string; text: string };
    narration?: string;
    sfx?: string;
    caption?: string;
    layout?: string;
    textScale?: "normal" | "compact" | "micro";
    error?: string;
    blockedReason?: string;
  };
}

export interface PipelineScene {
  id: string;
  images?: PipelinePanel[];
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
    const rawLayout = (sbPage?.layout as "A" | "B" | "C" | "D" | "E") ?? "A";

    const panels: UniversalPanel[] = (scene.images ?? [])
      .sort((a, b) => a.panelNumber - b.panelNumber)
      .map((img) => ({
        id: (img as { id?: string }).id,
        mood: (img.mood as AnyPanelMood) ?? "dramatic",
        imageUrl: img.imageUrl,
        status: img.status,
        provider: img.provider ?? null,
        model: img.model ?? null,
        error: (img.metadata?.error ?? img.metadata?.blockedReason) ?? null,
        dialogue: img.metadata?.dialogue?.text,
        speaker: img.metadata?.dialogue?.speaker,
        narration: img.metadata?.narration,
        sfx: img.metadata?.sfx,
        caption: img.metadata?.caption,
        textScale: img.metadata?.textScale,
      }));

    const layout = normalizeLayout(rawLayout, panels.length);
    return { id: scene.id, layout, panels };
  });
}

// ── Composant principal ───────────────────────────────────────────────────

type Props = {
  page: UniversalMangaPage | DemoMangaPage;
};

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

  const layoutStyle = LAYOUT_STYLES[universal.layout] ?? LAYOUT_STYLES.A;

  return (
    <div
      className="w-full bg-stone-900"
      style={{
        ...layoutStyle,
        padding: "3px",
        aspectRatio: "2 / 3",
        minHeight: 0,
      }}
    >
      {universal.panels.map((panel, i) => (
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
          speaker={panel.speaker}
          narration={panel.narration}
          sfx={panel.sfx}
          caption={panel.caption}
          textScale={panel.textScale}
          panelIndex={i}
          className="min-h-0"
          style={{ gridArea: AREA_NAMES[i] }}
        />
      ))}
    </div>
  );
}
