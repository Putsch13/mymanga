import type React from "react";

/**
 * Layout presets for manga pages (4–6 panels).
 * Each uses CSS grid-template-areas.
 * Panels are mapped to grid areas a-f.
 */
export const LAYOUT_STYLES: Record<"A" | "B" | "C" | "D" | "E" | "F", React.CSSProperties> = {
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

export const AREA_NAMES = ["a", "b", "c", "d", "e", "f", "g"];
