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
  it("finds blueprint by sceneIndex and panelNumber", () => {
    const bps = [
      { beatId: "beat_1" },
      { beatId: "beat_1" },
      { beatId: "beat_2" },
    ] as any[];
    const result = findPanelBlueprint(bps, 0, 2);
    expect(result).toBe(bps[1]);
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
