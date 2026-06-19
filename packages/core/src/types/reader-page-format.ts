import { PAGE_LAYOUT_CONFIGS, type PageLayoutConfig, type PageLayoutTemplate } from "./page-layout-configs";

export type ReadingDirection = "ltr" | "rtl";

export type ReaderPageTemplateId = PageLayoutTemplate | `${PageLayoutTemplate}_rtl`;

export type TextAnchorZone =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export type TextOverflowStrategy = "stack" | "caption_strip" | "truncate";

export interface ReaderPanelSlot {
  panelId: string;
  area: string;
  order: number;
  mirroredFrom: string | null;
}

export interface ReaderTextPlacementHint {
  reservedZones?: TextAnchorZone[];
  preferredAnchorZones?: TextAnchorZone[];
  overflowStrategy?: TextOverflowStrategy;
}

export interface ReaderLayoutDescriptor {
  templateId: ReaderPageTemplateId;
  readingDirection: ReadingDirection;
  cssGridTemplate: string;
  cssGridAreas: string;
  areas: string[];
  panelWeights: number[];
  defaultAspectRatios: string[];
}

function extractRows(cssGridAreas: string): string[][] {
  const matches = Array.from(cssGridAreas.matchAll(/"([^"]+)"/g));
  return matches
    .map((match) => match[1]?.trim().split(/\s+/).filter(Boolean) ?? [])
    .filter((row) => row.length > 0);
}

function uniqueAreasFromRows(rows: string[][]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of rows) {
    for (const token of row) {
      if (!seen.has(token) && token !== ".") {
        seen.add(token);
        ordered.push(token);
      }
    }
  }
  return ordered;
}

export function mirrorCssGridAreas(cssGridAreas: string): string {
  const rows = extractRows(cssGridAreas).map((row) => row.slice().reverse());
  return rows.map((row) => `"${row.join(" ")}"`).join(" ");
}

export function getReaderLayoutDescriptor(
  template: PageLayoutTemplate,
  readingDirection: ReadingDirection = "ltr",
): ReaderLayoutDescriptor {
  const base: PageLayoutConfig = PAGE_LAYOUT_CONFIGS[template];
  if (readingDirection !== "rtl") {
    return {
      templateId: template,
      readingDirection,
      cssGridTemplate: base.cssGridTemplate,
      cssGridAreas: base.cssGridAreas,
      areas: [...base.areas],
      panelWeights: [...base.panelWeights],
      defaultAspectRatios: [...base.defaultAspectRatios],
    };
  }

  const mirroredCssGridAreas = mirrorCssGridAreas(base.cssGridAreas);
  const mirroredRows = extractRows(mirroredCssGridAreas);
  return {
    templateId: `${template}_rtl`,
    readingDirection,
    cssGridTemplate: base.cssGridTemplate,
    cssGridAreas: mirroredCssGridAreas,
    areas: uniqueAreasFromRows(mirroredRows),
    panelWeights: [...base.panelWeights],
    defaultAspectRatios: [...base.defaultAspectRatios],
  };
}

export function buildReaderPanelSlots(args: {
  template: PageLayoutTemplate;
  readingDirection?: ReadingDirection;
  panelIds: string[];
}): ReaderPanelSlot[] {
  const { panelIds, template, readingDirection = "ltr" } = args;
  const descriptor = getReaderLayoutDescriptor(template, readingDirection);
  const baseAreas = PAGE_LAYOUT_CONFIGS[template].areas;
  return panelIds.map((panelId, index) => ({
    panelId,
    area: descriptor.areas[index] ?? descriptor.areas[0] ?? "a",
    order: index + 1,
    mirroredFrom: readingDirection === "rtl" ? (baseAreas[index] ?? null) : null,
  }));
}
