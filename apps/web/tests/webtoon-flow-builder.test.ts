/**
 * Sprint 1 — Reader refacto
 *
 * Tests du webtoon flow builder. Invariants :
 *   - aucun panel perdu (75+ panels visibles)
 *   - ordre strict préservé
 *   - scene_breaks uniquement aux frontières de scène
 *   - pas de grouping manga réutilisé
 */

import { describe, expect, it } from "vitest";
import {
  buildWebtoonFlowFromPanels,
  flattenWebtoonPanels,
  type WebtoonPanel,
} from "../components/manga/pagination/webtoon-flow-builder";

function makePanel(n: number, sceneId: string = "scene-1"): WebtoonPanel {
  return { id: `p${n}`, sceneId, panelNumber: n };
}

describe("webtoon flow — buildWebtoonFlowFromPanels", () => {
  it("entrée vide → []", () => {
    expect(buildWebtoonFlowFromPanels([])).toEqual([]);
  });

  it("invariant cœur : 75 panels → 75 panels rendus, aucun perdu", () => {
    const panels = Array.from({ length: 75 }, (_, i) => makePanel(i + 1, `scene-${Math.floor(i / 5) + 1}`));
    const blocks = buildWebtoonFlowFromPanels(panels);
    const panelBlocks = blocks.filter((b) => b.kind === "panel");
    expect(panelBlocks).toHaveLength(75);
  });

  it("invariant cœur : ordre strict préservé", () => {
    const panels = Array.from({ length: 20 }, (_, i) => makePanel(i + 1, `scene-${Math.floor(i / 4) + 1}`));
    const blocks = buildWebtoonFlowFromPanels(panels);
    const panelBlocks = blocks.filter((b) => b.kind === "panel");
    panelBlocks.forEach((block, idx) => {
      expect(block.kind === "panel" && block.panel.id).toBe(`p${idx + 1}`);
    });
  });

  it("scene_breaks : un par transition de scène, pas de leading par défaut", () => {
    const panels: WebtoonPanel[] = [
      makePanel(1, "A"),
      makePanel(2, "A"),
      makePanel(3, "B"),
      makePanel(4, "B"),
      makePanel(5, "C"),
    ];
    const blocks = buildWebtoonFlowFromPanels(panels);
    const breaks = blocks.filter((b) => b.kind === "scene_break");
    expect(breaks).toHaveLength(2);
  });

  it("scene_breaks : leading activé si skipLeadingSceneBreak=false", () => {
    const panels: WebtoonPanel[] = [makePanel(1, "A"), makePanel(2, "B")];
    const blocks = buildWebtoonFlowFromPanels(panels, { skipLeadingSceneBreak: false });
    const breaks = blocks.filter((b) => b.kind === "scene_break");
    expect(breaks).toHaveLength(2);
  });

  it("emitSceneBreaks: false → aucun scene_break émis", () => {
    const panels: WebtoonPanel[] = [makePanel(1, "A"), makePanel(2, "B"), makePanel(3, "C")];
    const blocks = buildWebtoonFlowFromPanels(panels, { emitSceneBreaks: false });
    expect(blocks.every((b) => b.kind === "panel")).toBe(true);
  });

  it("scène unique de 75 panels → 75 panels visibles, 0 scene_break", () => {
    const panels = Array.from({ length: 75 }, (_, i) => makePanel(i + 1, "unique-scene"));
    const blocks = buildWebtoonFlowFromPanels(panels);
    const panelBlocks = blocks.filter((b) => b.kind === "panel");
    const breakBlocks = blocks.filter((b) => b.kind === "scene_break");
    expect(panelBlocks).toHaveLength(75);
    expect(breakBlocks).toHaveLength(0);
  });

  it("panels sans sceneId → 0 scene_break (pas de partitions artificielles)", () => {
    const panels: WebtoonPanel[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, panelNumber: i }));
    const blocks = buildWebtoonFlowFromPanels(panels);
    const breaks = blocks.filter((b) => b.kind === "scene_break");
    expect(breaks).toHaveLength(0);
  });

  it("numérotation des scènes : 1-indexée, incrémente à chaque transition", () => {
    const panels: WebtoonPanel[] = [
      makePanel(1, "A"),
      makePanel(2, "A"),
      makePanel(3, "B"),
      makePanel(4, "C"),
    ];
    const blocks = buildWebtoonFlowFromPanels(panels);
    const scenes = blocks.filter((b) => b.kind === "panel").map((b) => b.kind === "panel" && b.sceneNumber);
    expect(scenes).toEqual([1, 1, 2, 3]);
  });
});

describe("webtoon flow — flattenWebtoonPanels", () => {
  it("projette les numéros de scène sans créer de breaks", () => {
    const panels: WebtoonPanel[] = [
      makePanel(1, "A"),
      makePanel(2, "A"),
      makePanel(3, "B"),
      makePanel(4, "B"),
    ];
    const flat = flattenWebtoonPanels(panels);
    expect(flat).toHaveLength(4);
    expect(flat.map((p) => p.sceneNumber)).toEqual([1, 1, 2, 2]);
    expect(flat.map((p) => p.sequenceIndex)).toEqual([1, 2, 3, 4]);
  });
});
