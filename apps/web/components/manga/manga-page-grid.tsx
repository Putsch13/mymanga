"use client";

import type { DemoMangaPage } from "@/lib/demo-data";
import { MangaPanel } from "./manga-panel";

/**
 * 5 layout presets for manga pages.
 * Each uses CSS grid-template-areas to create varied panel arrangements.
 * Panels are mapped to grid areas a-g.
 */

const LAYOUT_STYLES: Record<DemoMangaPage["layout"], React.CSSProperties> = {
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
  // Layout B: 7 panels — 1 large left + 2 right, 1 action center, 2 bottom + 1
  B: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1.2fr 1fr 0.8fr 1fr",
    gridTemplateAreas: `
      "a a a b"
      "a a a c"
      "d d e e"
      "f f f g"
    `,
    gap: "3px",
  },
  // Layout C: 6 panels — 1 wide top, 2 small + 1 tall, 1 wide bottom
  C: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "0.8fr 1fr 1fr 0.9fr",
    gridTemplateAreas: `
      "a a a a"
      "b b c c"
      "d d c c"
      "e e f f"
    `,
    gap: "3px",
  },
  // Layout D: 6 panels — 1 + 1 large center + 2 + 1 wide
  D: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "1fr 1.3fr 1fr 0.8fr",
    gridTemplateAreas: `
      "a a b b"
      "c c c c"
      "d d e e"
      "f f f f"
    `,
    gap: "3px",
  },
  // Layout E: 6 panels — wide top, 2 mid, tall right + bottom wide
  E: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gridTemplateRows: "0.8fr 1fr 1.2fr 0.9fr",
    gridTemplateAreas: `
      "a a a a"
      "b b c c"
      "d d d e"
      "f f f f"
    `,
    gap: "3px",
  },
};

const AREA_NAMES = ["a", "b", "c", "d", "e", "f", "g"];

type Props = {
  page: DemoMangaPage;
};

export function MangaPageGrid({ page }: Props) {
  return (
    <div
      className="h-full w-full bg-stone-900"
      style={{
        ...LAYOUT_STYLES[page.layout],
        padding: "3px",
        minHeight: "100%",
      }}
    >
      {page.panels.map((panel, i) => (
        <MangaPanel
          key={panel.id}
          mood={panel.mood}
          dialogue={panel.dialogue}
          speaker={panel.speaker}
          narration={panel.narration}
          sfx={panel.sfx}
          className="min-h-0"
          style={{ gridArea: AREA_NAMES[i] }}
        />
      ))}
    </div>
  );
}
