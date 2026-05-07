import { describe, it, expect, vi } from "vitest";
import { enrichPremiumBlueprintsSceneDialogue } from "./dialogue-scene-writer";
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
    provenance: { origin: "author_raw_merged" as const, canonicalPanelId: panelId, appliedRules: [] },
    ...overrides,
  } as PanelBlueprintPremium;
}

vi.stubEnv("OPENAI_API_KEY", "test-key");
vi.stubEnv("OPENAI_SCENE_DIALOGUE_ENRICH", "1");

describe("T5 — dialogue-scene-writer beat skip logging", () => {
  it("warns when a beat has no speakerish targets", async () => {
    const panels: PanelBlueprintPremium[] = [
      makePanel("p1", "b1", { mangaPanelFunction: "establishing" }),
      makePanel("p2", "b1", { mangaPanelFunction: "establishing" }),
    ];

    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: panels,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: {},
      forceSceneDialogueEnrich: true,
    });

    expect(result.warnings.some((w) => w.includes("skipped_no_targets") && w.includes("b1"))).toBe(true);
  });

  it("produces blocking error when skipped beat has a requiredDialogueAct", async () => {
    const panels: PanelBlueprintPremium[] = [
      makePanel("p1", "b3", { mangaPanelFunction: "establishing" }),
    ];

    const result = await enrichPremiumBlueprintsSceneDialogue({
      blueprints: panels,
      chapterSummary: null,
      chapterUserIntent: null,
      characterNameById: {},
      forceSceneDialogueEnrich: true,
      requiredDialogueActBeatIds: ["b3"],
    });

    expect(result.blockingErrors.some((e) => e.includes("required_dialogue_act_no_panel_target:b3"))).toBe(true);
  });
});
