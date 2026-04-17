import { describe, it, expect } from "vitest";
import {
  resolveEffectivePanelBlueprints,
  findPanelBlueprint,
  normalizeCreativeControls,
} from "./pipeline-quality";

describe("resolveEffectivePanelBlueprints", () => {
  it("returns jobInput blueprints if present", () => {
    const result = resolveEffectivePanelBlueprints({
      jobInput: { panelBlueprints: [{ beatId: "beat_1" }] },
      studioSnapshot: null,
    });
    expect(result).toHaveLength(1);
  });

  it("falls back to studioSnapshot blueprints", () => {
    const result = resolveEffectivePanelBlueprints({
      jobInput: {},
      studioSnapshot: { data: { productionPlan: { panelBlueprints: [{ beatId: "b1" }, { beatId: "b2" }] } } },
    });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no blueprints", () => {
    const result = resolveEffectivePanelBlueprints({ jobInput: {}, studioSnapshot: null });
    expect(result).toHaveLength(0);
  });
});

describe("findPanelBlueprint", () => {
  it("strategy 1: matches by pageNumber + panelNumber when renumbered sequentially", () => {
    const bps = [
      { beatId: "beat_1", pageNumber: 1, panelNumber: 1 },
      { beatId: "beat_1", pageNumber: 2, panelNumber: 2 },
      { beatId: "beat_2", pageNumber: 3, panelNumber: 3 },
    ] as any[];
    expect(findPanelBlueprint(bps, 1, 2)).toBe(bps[1]);
    expect(findPanelBlueprint(bps, 2, 3)).toBe(bps[2]);
  });

  it("strategy 2: parses beat_N even for beat_N_suffix formats", () => {
    const bps = [
      { beatId: "beat_1_intro", pageNumber: 0, panelNumber: 0 },
      { beatId: "beat_1_intro", pageNumber: 0, panelNumber: 0 },
      { beatId: "beat_2_climax", pageNumber: 0, panelNumber: 0 },
    ] as any[];
    expect(findPanelBlueprint(bps, 0, 2)).toBe(bps[1]);
    expect(findPanelBlueprint(bps, 1, 1)).toBe(bps[2]);
  });

  it("strategy 3 (BUG-04 fix): falls back via group-by-beatId, NOT sceneIndex*6", () => {
    // 3 beats sans beat_N formaté : beats A (3 panels), B (5 panels), C (2 panels).
    const bps = [
      { beatId: "alpha" }, { beatId: "alpha" }, { beatId: "alpha" },
      { beatId: "bravo" }, { beatId: "bravo" }, { beatId: "bravo" }, { beatId: "bravo" }, { beatId: "bravo" },
      { beatId: "charlie" }, { beatId: "charlie" },
    ] as any[];
    // Scène 1 panel 2 → bravo[1] (et non bps[1*6+1] = bravo[2])
    expect(findPanelBlueprint(bps, 1, 2)).toBe(bps[4]);
    // Scène 2 panel 1 → charlie[0]
    expect(findPanelBlueprint(bps, 2, 1)).toBe(bps[8]);
    // Scène 2 panel 3 → clamp sur dernier panel du groupe (charlie[1])
    expect(findPanelBlueprint(bps, 2, 3)).toBe(bps[9]);
  });

  it("returns undefined for empty blueprints", () => {
    expect(findPanelBlueprint([], 0, 1)).toBeUndefined();
  });
});

describe("normalizeCreativeControls", () => {
  it("applies defaults when undefined", () => {
    const controls = normalizeCreativeControls(undefined, null);
    expect(controls.noveltyLevel).toBe(55);
    expect(controls.worldStrictness).toBe(85);
    expect(controls.visualExoticism).toBe(50);
  });

  it("uses canonStrictness for worldStrictness", () => {
    const controls = normalizeCreativeControls(undefined, 70);
    expect(controls.worldStrictness).toBe(70);
  });

  it("clamps values to 0-100", () => {
    const controls = normalizeCreativeControls({ noveltyLevel: 200, environmentRichness: -10 }, null);
    expect(controls.noveltyLevel).toBe(100);
    expect(controls.environmentRichness).toBe(0);
  });
});
