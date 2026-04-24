/**
 * PATCH 9 — Géométrie de page reader alignée sur le storyboard persisté.
 * Les templates `grid_2x2_rtl` et `grid_2x3_rtl` décrivent des slots en
 * coordonnées normalisées (0–1) + ordre de lecture RTL cohérent avec
 * `getReaderLayoutDescriptor` (core).
 */

import type { PageLayoutTemplate } from "@manga-ai-studio/core";
import { buildReaderPanelSlots, getReaderLayoutDescriptor } from "@manga-ai-studio/core";
import type { UniversalMangaPage, UniversalPanel } from "../manga-page-grid";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";

export interface ReaderPanelSlot {
  slotType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  readingOrder: number;
}

export interface ReaderPageTemplate {
  id: string;
  direction: "rtl";
  slots: ReaderPanelSlot[];
}

const CELL_2X2: Record<string, { x: number; y: number; width: number; height: number }> = {
  a: { x: 0, y: 0, width: 0.5, height: 0.5 },
  b: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
  c: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
  d: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
};

function cellGeometry2x3(area: string): { x: number; y: number; width: number; height: number } {
  const col: Record<string, number> = { a: 0, b: 1, c: 2, d: 0, e: 1, f: 2 };
  const row = ["a", "b", "c"].includes(area) ? 0 : 1;
  return { x: (col[area] ?? 0) / 3, y: row * 0.5, width: 1 / 3, height: 0.5 };
}

function buildRtlGridTemplate(
  id: "grid_2x2_rtl" | "grid_2x3_rtl",
  coreTemplate: "grid_2x2" | "grid_2x3",
): ReaderPageTemplate {
  const { areas } = getReaderLayoutDescriptor(coreTemplate, "rtl");
  const slots: ReaderPanelSlot[] = areas.map((area, readingOrder) => {
    const geom = coreTemplate === "grid_2x2" ? CELL_2X2[area]! : cellGeometry2x3(area);
    return {
      slotType: area,
      x: geom.x,
      y: geom.y,
      width: geom.width,
      height: geom.height,
      readingOrder,
    };
  });
  return { id, direction: "rtl", slots };
}

const REGISTRY: Record<string, ReaderPageTemplate> = {
  grid_2x2_rtl: buildRtlGridTemplate("grid_2x2_rtl", "grid_2x2"),
  grid_2x3_rtl: buildRtlGridTemplate("grid_2x3_rtl", "grid_2x3"),
};

/** Clé canonique `grid_2x2_rtl` / `grid_2x3_rtl` (suffixe _rtl implicite). */
export function getReaderPageTemplate(layoutTemplate: string | undefined | null): ReaderPageTemplate | null {
  if (!layoutTemplate) return null;
  const base = layoutTemplate.replace(/_rtl$/u, "");
  const key = `${base}_rtl`;
  return REGISTRY[key] ?? null;
}

/**
 * Slots CSS grid pour une page persistée : priorité au registre (2×2 / 2×3),
 * sinon même logique que le core (`buildReaderPanelSlots` RTL).
 */
export function buildPersistedReaderPanelSlots(
  layoutTemplate: string,
  panelIds: string[],
): NonNullable<UniversalMangaPage["panelSlots"]> {
  const tpl = getReaderPageTemplate(layoutTemplate);
  if (tpl) {
    const ordered = [...tpl.slots].sort((s, t) => s.readingOrder - t.readingOrder);
    return panelIds.map((panelId, index) => ({
      panelId,
      area: ordered[index]?.slotType ?? ordered[0]!.slotType,
      order: index + 1,
    }));
  }
  const coreKey = layoutTemplate.replace(/_rtl$/u, "") as PageLayoutTemplate;
  return buildReaderPanelSlots({
    template: coreKey,
    readingDirection: "rtl",
    panelIds,
  });
}

export interface ReaderCanvasPanelRect {
  id: string;
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sfx?: string[];
}

function sfxFromUniversalPanel(sfx: string | undefined): string[] | undefined {
  if (!sfx?.trim()) return undefined;
  return sfx.includes(",") ? sfx.split(",").map((s) => s.trim()).filter(Boolean) : [sfx.trim()];
}

/**
 * Positions canvas pixel pour une page reader, à partir du template persisté.
 * Fallback : grille uniforme 2 colonnes (comportement historique).
 */
export function computeCanvasPanelsFromReaderPage(
  page: Pick<UniversalMangaPage, "layoutTemplate" | "panels">,
  pageWidth: number,
  pageHeight: number,
): ReaderCanvasPanelRect[] {
  const tpl = getReaderPageTemplate(page.layoutTemplate ?? "");
  if (!tpl) {
    const colCount = 2;
    const rowCount = Math.max(1, Math.ceil(page.panels.length / colCount));
    const colW = Math.floor(pageWidth / colCount);
    const rowH = Math.floor(pageHeight / rowCount);
    return page.panels.map((panel, idx) => ({
      id: panel.id ?? `p-${idx}`,
      imageUrl: getStableImageUrl({
        persistedUrl: null,
        imageUrl: panel.imageUrl ?? null,
      }) ?? "",
      x: (idx % colCount) * colW,
      y: Math.floor(idx / colCount) * rowH,
      width: colW,
      height: rowH,
      sfx: sfxFromUniversalPanel(panel.sfx),
    }));
  }
  const ordered = [...tpl.slots].sort((s, t) => s.readingOrder - t.readingOrder);
  return page.panels.map((panel, idx) => {
    const slot = ordered[idx] ?? ordered[ordered.length - 1]!;
    return {
      id: panel.id ?? `p-${idx}`,
      imageUrl: getStableImageUrl({
        persistedUrl: null,
        imageUrl: panel.imageUrl ?? null,
      }) ?? "",
      x: Math.floor(slot.x * pageWidth),
      y: Math.floor(slot.y * pageHeight),
      width: Math.max(1, Math.floor(slot.width * pageWidth)),
      height: Math.max(1, Math.floor(slot.height * pageHeight)),
      sfx: sfxFromUniversalPanel(panel.sfx),
    };
  });
}

/** Fusionne les métadonnées de layout storyboard dans un panel universel. */
export function mergePlanLayoutIntoUniversalPanel(
  panel: UniversalPanel,
  plan: {
    layoutHint?: string | null;
    targetAspectRatio?: string | null;
    slotType?: string | null;
    textPlacementPreference?: string | null;
    safeTextZones?: Array<{ x: number; y: number; width: number; height: number }> | null;
    layoutTemplate?: string | null;
  },
): UniversalPanel {
  const prev = panel.layoutMeta ?? {};
  return {
    ...panel,
    layoutMeta: {
      ...prev,
      layoutHint: plan.layoutHint ?? prev.layoutHint ?? null,
      targetAspectRatio: plan.targetAspectRatio ?? prev.targetAspectRatio ?? null,
      slotType: (plan.slotType ?? prev.slotType) ?? undefined,
      textPlacementPreference: plan.textPlacementPreference ?? prev.textPlacementPreference ?? null,
      safeTextZones: plan.safeTextZones ?? prev.safeTextZones ?? null,
      layoutTemplate: plan.layoutTemplate ?? prev.layoutTemplate ?? null,
    },
  };
}
