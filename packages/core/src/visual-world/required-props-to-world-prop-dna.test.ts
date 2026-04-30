import { describe, expect, it } from "vitest";
import { requiredPropsToWorldPropsVisualDna } from "./required-props-to-world-prop-dna";
import type { RequiredProp } from "../types/narrative-facts";

function baseProp(overrides: Partial<RequiredProp> = {}): RequiredProp {
  return {
    id: "p1",
    canonicalName: "Caisse",
    aliases: [],
    category: "container",
    narrativeRole: "evidence",
    requiredForBeatIds: ["b1"],
    visibilityMode: "foreground_insert",
    mustBeVisible: true,
    confidence: 1,
    source: "visual_world_contract",
    ...overrides,
  };
}

describe("requiredPropsToWorldPropsVisualDna", () => {
  it("retourne [] pour entrée vide", () => {
    expect(requiredPropsToWorldPropsVisualDna(undefined, "b1")).toEqual([]);
    expect(requiredPropsToWorldPropsVisualDna([], "b1")).toEqual([]);
  });

  it("mappe un RequiredProp vers VisualWorldPropDna (beat fallback)", () => {
    const [out] = requiredPropsToWorldPropsVisualDna([baseProp({ requiredForBeatIds: [] })], "beat-x");
    expect(out.id).toBe("p1");
    expect(out.canonicalName).toBe("Caisse");
    expect(out.requiredBeatIds).toEqual(["beat-x"]);
    expect(out.continuityPolicy).toBe("symbolic");
    expect(out.visualDescription).toContain("Caisse");
  });

  it("continuity recurring quand mustBeVisible sans rôle symbolique", () => {
    const [out] = requiredPropsToWorldPropsVisualDna(
      [baseProp({ narrativeRole: "action_tool", mustBeVisible: true })],
      "b1",
    );
    expect(out.continuityPolicy).toBe("recurring");
  });
});
