import { describe, it, expect } from "vitest";
import { buildCutawayPlan, runCutawayQa } from "./chapter-shot-plan";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

function makePanel(
  panelId: string,
  beatId: string,
  overrides?: Partial<PanelBlueprintPremium>,
): PanelBlueprintPremium {
  return {
    panelId,
    beatId,
    purpose: "test",
    mangaPanelFunction: "character_action" as const,
    subjectFocus: "hero" as const,
    panelLayout: "single" as const,
    criticality: "normal" as const,
    cutawayType: "none" as const,
    shotType: "medium",
    provenance: { origin: "author_raw_merged" as const, canonicalPanelId: panelId, appliedRules: [] },
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("buildCutawayPlan", () => {
  it("identifies cutaway panels and groups by beat", () => {
    const bps = [
      makePanel("p1", "b1", { cutawayType: "enemy" }),
      makePanel("p2", "b1"),
      makePanel("p3", "b2", { cutawayType: "prop_insert" }),
    ];
    const plan = buildCutawayPlan(bps);
    expect(plan.panels).toHaveLength(2);
    expect(plan.coverageByBeat["b1"]).toBe(1);
    expect(plan.coverageByBeat["b2"]).toBe(1);
  });

  it("infers correct narrative cutaway types", () => {
    const bps = [
      makePanel("p1", "b1", { cutawayType: "enemy_reveal" }),
      makePanel("p2", "b1", { cutawayType: "environment_establishing" }),
      makePanel("p3", "b2", { cutawayType: "reaction_insert" }),
      makePanel("p4", "b2", { cutawayType: "aftermath" }),
    ];
    const plan = buildCutawayPlan(bps);
    expect(plan.panels.find((p) => p.id === "cutaway_p1")!.type).toBe("danger_signal");
    expect(plan.panels.find((p) => p.id === "cutaway_p2")!.type).toBe("environment_escalation");
    expect(plan.panels.find((p) => p.id === "cutaway_p3")!.type).toBe("emotion_detail");
    expect(plan.panels.find((p) => p.id === "cutaway_p4")!.type).toBe("silent_beat");
  });

  it("skips panels with cutawayType none", () => {
    const bps = [makePanel("p1", "b1")];
    const plan = buildCutawayPlan(bps);
    expect(plan.panels).toHaveLength(0);
  });
});

describe("runCutawayQa", () => {
  it("returns ok when every beat has at least one cutaway", () => {
    const bps = [
      makePanel("p1", "b1", { cutawayType: "reaction" }),
      makePanel("p2", "b2", { cutawayType: "prop_insert" }),
    ];
    const result = runCutawayQa(bps);
    expect(result.ok).toBe(true);
    expect(result.beatsWithoutCutaway).toHaveLength(0);
  });

  it("warns when a beat lacks cutaway", () => {
    const bps = [
      makePanel("p1", "b1", { cutawayType: "reaction" }),
      makePanel("p2", "b2"),
    ];
    const result = runCutawayQa(bps);
    expect(result.ok).toBe(false);
    expect(result.beatsWithoutCutaway).toContain("b2");
  });

  it("warns when environment beat lacks danger cutaway", () => {
    const bps = [
      makePanel("p1", "b1", { subjectFocus: "environment" as const, cutawayType: "reaction" }),
    ];
    const result = runCutawayQa(bps);
    expect(result.warnings.some((w) => w.includes("environment beats lack"))).toBe(true);
  });
});
