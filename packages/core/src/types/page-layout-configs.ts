/**
 * P1-4 — Source of truth unique pour les layouts de page manga.
 *
 * Avant : `packages/ai/.../page-layout-engine.ts` contenait les configs CSS,
 * ET `apps/web/components/manga/manga-page-grid.tsx` les redéfinissait en
 * local (commentaire original : "évite d'importer @manga-ai-studio/ai côté
 * client"). Résultat : les deux copies ont dérivé (areas/weights/ratios
 * n'étaient que dans ai, pas côté client, et rien ne garantissait qu'un
 * nouveau template ajouté côté serveur atteindrait le client).
 *
 * Ici on place uniquement les DONNÉES de layout (pas de logique AI), dans
 * `@manga-ai-studio/core` qui est le seul package déjà importé dans les
 * composants client. Les deux côtés partagent donc désormais la même table.
 */

export type PageLayoutTemplate =
  | "splash"           // 1 panel pleine page — beat révélation, ouverture chapitre
  | "double_spread"    // 2 panels sur double page — action climax
  | "grid_2x2"         // 4 panels égaux — dialogue posé
  | "grid_2x3"         // 6 panels — rythme standard
  | "action_strip"     // 1 grand + 4 petits en strip — combat
  | "asymmetric_hero"  // 1 grand gauche + 2 petits droite — focus héros
  | "cinematic_bar"    // 3 panels horizontaux panoramiques — paysage / révélation lieu
  | "focus_closeup"    // 1 très grand + 2 petits réaction — émotion
  | "montage_rapid"    // 8 petits panels — flash-back / time-lapse
  | "vertical_strip"   // 3 panels verticaux — chase / chute
  // Phase 4 — layouts natifs 5-panel
  | "grid_1_2_2"       // 1 grand top + 2 middle + 2 bottom — 5 panels
  | "hero_top_2_2"     // 1 hero plein haut + 2x2 petits bas — 5 panels
  | "2_1_2_dialogue"   // 2 top + 1 grand milieu + 2 bas — 5 panels dialogue cadré
  | "staggered_5"      // 5 panels étagés asymétriques — rythme varié
  | "vertical_hero_4"; // 1 grand bannière + 4 petits strip — 5 panels action/recap

export interface PageLayoutConfig {
  cssGridTemplate: string;
  cssGridAreas: string;
  areas: string[];
  panelWeights: number[];
  defaultAspectRatios: string[];
}

export const PAGE_LAYOUT_CONFIGS: Record<PageLayoutTemplate, PageLayoutConfig> = {
  splash: {
    cssGridTemplate: "1fr",
    cssGridAreas: `"a"`,
    areas: ["a"],
    panelWeights: [1],
    defaultAspectRatios: ["3:4"],
  },
  double_spread: {
    cssGridTemplate: "1fr 1fr",
    cssGridAreas: `"a b"`,
    areas: ["a", "b"],
    panelWeights: [0.5, 0.5],
    defaultAspectRatios: ["3:4", "3:4"],
  },
  grid_2x2: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr",
    cssGridAreas: `"a b" "c d"`,
    areas: ["a", "b", "c", "d"],
    panelWeights: [0.25, 0.25, 0.25, 0.25],
    defaultAspectRatios: ["1:1", "1:1", "1:1", "1:1"],
  },
  grid_2x3: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.167, 0.167, 0.167, 0.167, 0.167, 0.167],
    defaultAspectRatios: ["3:4", "3:4", "3:4", "3:4", "3:4", "3:4"],
  },
  action_strip: {
    cssGridTemplate: "1.5fr 1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.40, 0.15, 0.15, 0.10, 0.10, 0.10],
    defaultAspectRatios: ["4:3", "3:4", "3:4", "1:1", "1:1", "1:1"],
  },
  asymmetric_hero: {
    cssGridTemplate: "1.2fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.50, 0.25, 0.25],
    defaultAspectRatios: ["3:4", "1:1", "1:1"],
  },
  cinematic_bar: {
    cssGridTemplate: "1fr 1fr 1fr / 1fr",
    cssGridAreas: `"a" "b" "c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["16:9", "16:9", "16:9"],
  },
  focus_closeup: {
    cssGridTemplate: "1.5fr 1fr / 1fr 1fr",
    cssGridAreas: `"a a" "b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.60, 0.20, 0.20],
    defaultAspectRatios: ["2:1", "1:1", "1:1"],
  },
  montage_rapid: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr 1fr",
    cssGridAreas: `"a b c d" "e f g h"`,
    areas: ["a", "b", "c", "d", "e", "f", "g", "h"],
    panelWeights: Array(8).fill(0.125),
    defaultAspectRatios: Array(8).fill("3:4"),
  },
  vertical_strip: {
    cssGridTemplate: "1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["1:2", "1:2", "1:2"],
  },
  // ── Phase 4 — 5-panel layouts ─────────────────────────────────────────
  // Grand top (a), deux middle (b, c), deux bottom (d, e).
  // Bon pour : établissement → double réaction → double conséquence.
  grid_1_2_2: {
    cssGridTemplate: "1.4fr 1fr 1fr / 1fr 1fr",
    cssGridAreas: `"a a" "b c" "d e"`,
    areas: ["a", "b", "c", "d", "e"],
    panelWeights: [0.40, 0.15, 0.15, 0.15, 0.15],
    defaultAspectRatios: ["16:9", "1:1", "1:1", "1:1", "1:1"],
  },
  // Hero top plein largeur (a) + 2x2 petits (b,c / d,e).
  // Bon pour : climax visuel + 4 réactions / détails.
  hero_top_2_2: {
    cssGridTemplate: "1.6fr 1fr 1fr / 1fr 1fr",
    cssGridAreas: `"a a" "b c" "d e"`,
    areas: ["a", "b", "c", "d", "e"],
    panelWeights: [0.44, 0.14, 0.14, 0.14, 0.14],
    defaultAspectRatios: ["2:1", "1:1", "1:1", "1:1", "1:1"],
  },
  // Deux top côte à côte (a,b), un grand central (c), deux bas (d,e).
  // Bon pour : cadrage dialogue tendu avec une beat-reveal au milieu.
  "2_1_2_dialogue": {
    cssGridTemplate: "1fr 1.3fr 1fr / 1fr 1fr",
    cssGridAreas: `"a b" "c c" "d e"`,
    areas: ["a", "b", "c", "d", "e"],
    panelWeights: [0.18, 0.18, 0.28, 0.18, 0.18],
    defaultAspectRatios: ["1:1", "1:1", "2:1", "1:1", "1:1"],
  },
  // Étagé : grand gauche-haut, petit droite-haut, bande centrale, petit gauche-bas, grand droite-bas.
  // Bon pour : rythme varié non régulier sans splash.
  staggered_5: {
    cssGridTemplate: "1fr 0.8fr 1.1fr / 1.3fr 1fr",
    cssGridAreas: `"a b" "c c" "d e"`,
    areas: ["a", "b", "c", "d", "e"],
    panelWeights: [0.22, 0.14, 0.26, 0.14, 0.24],
    defaultAspectRatios: ["4:5", "1:1", "16:9", "1:1", "4:5"],
  },
  // Hero bannière horizontale + 4 panels strip en bas.
  // Bon pour : action/récap visuel ou flash-back étalé.
  vertical_hero_4: {
    cssGridTemplate: "1.2fr 1fr / 1fr 1fr 1fr 1fr",
    cssGridAreas: `"a a a a" "b c d e"`,
    areas: ["a", "b", "c", "d", "e"],
    panelWeights: [0.44, 0.14, 0.14, 0.14, 0.14],
    defaultAspectRatios: ["21:9", "1:1", "1:1", "1:1", "1:1"],
  },
};

/**
 * Parse les dimensions d'une grille CSS (format: "row1 row2 / col1 col2").
 */
function parseCssGridTemplate(template: string): { rows: number[]; cols: number[] } {
  const parts = template.split("/").map((s) => s.trim());
  const parseFr = (s: string): number => {
    const match = s.match(/^([\d.]+)fr$/);
    return match ? parseFloat(match[1]) : 1;
  };
  const rows = (parts[0] ?? "1fr").split(/\s+/).map(parseFr);
  const cols = (parts[1] ?? parts[0] ?? "1fr").split(/\s+/).map(parseFr);
  return { rows, cols };
}

/**
 * Parse les zones CSS grid pour extraire la position de chaque area.
 */
function parseCssGridAreas(areasStr: string): Map<string, { rowStart: number; rowEnd: number; colStart: number; colEnd: number }> {
  const rows = areasStr.match(/"[^"]+"/g)?.map((r) => r.replace(/"/g, "").trim().split(/\s+/)) ?? [];
  const areaMap = new Map<string, { rowStart: number; rowEnd: number; colStart: number; colEnd: number }>();

  for (let row = 0; row < rows.length; row++) {
    const cells = rows[row];
    for (let col = 0; col < cells.length; col++) {
      const area = cells[col];
      if (!areaMap.has(area)) {
        areaMap.set(area, { rowStart: row, rowEnd: row + 1, colStart: col, colEnd: col + 1 });
      } else {
        const existing = areaMap.get(area)!;
        existing.rowEnd = Math.max(existing.rowEnd, row + 1);
        existing.colEnd = Math.max(existing.colEnd, col + 1);
      }
    }
  }
  return areaMap;
}

export interface PanelPixelPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convertit un layout de page en positions pixels pour chaque panel.
 */
export function computePanelPixelPositions(
  template: PageLayoutTemplate,
  pageWidth: number,
  pageHeight: number,
  gutter = 0,
): PanelPixelPosition[] {
  const config = PAGE_LAYOUT_CONFIGS[template];
  if (!config) return [];

  const { rows, cols } = parseCssGridTemplate(config.cssGridTemplate);
  const areaMap = parseCssGridAreas(config.cssGridAreas);

  const totalRowFr = rows.reduce((a, b) => a + b, 0);
  const totalColFr = cols.reduce((a, b) => a + b, 0);

  const effectiveWidth = pageWidth - gutter * (cols.length - 1);
  const effectiveHeight = pageHeight - gutter * (rows.length - 1);

  const colWidths = cols.map((fr) => (fr / totalColFr) * effectiveWidth);
  const rowHeights = rows.map((fr) => (fr / totalRowFr) * effectiveHeight);

  const colStarts: number[] = [];
  let cumX = 0;
  for (let i = 0; i < colWidths.length; i++) {
    colStarts.push(cumX);
    cumX += colWidths[i] + gutter;
  }

  const rowStarts: number[] = [];
  let cumY = 0;
  for (let i = 0; i < rowHeights.length; i++) {
    rowStarts.push(cumY);
    cumY += rowHeights[i] + gutter;
  }

  const positions: PanelPixelPosition[] = [];
  for (const area of config.areas) {
    const pos = areaMap.get(area);
    if (!pos) continue;

    const x = colStarts[pos.colStart] ?? 0;
    const xEnd = (colStarts[pos.colEnd - 1] ?? 0) + (colWidths[pos.colEnd - 1] ?? 0);
    const y = rowStarts[pos.rowStart] ?? 0;
    const yEnd = (rowStarts[pos.rowEnd - 1] ?? 0) + (rowHeights[pos.rowEnd - 1] ?? 0);

    positions.push({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(xEnd - x),
      height: Math.round(yEnd - y),
    });
  }

  return positions;
}
