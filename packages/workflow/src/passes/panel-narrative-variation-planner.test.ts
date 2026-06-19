import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { describe, expect, it } from "vitest";
import { applyPanelNarrativeVariationToBlueprints } from "./panel-narrative-variation-planner";

function bp(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    panelId: "p_default",
    beatId: "beat_1",
    purpose: "establishing",
    shotType: "wide",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    cutawayType: "none",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("applyPanelNarrativeVariationToBlueprints", () => {
  it("répartit les phrases quand la narration est identique sur un même beat", () => {
    const shared = "Première phrase. Deuxième phrase.";
    const bps = [
      bp({ panelId: "p1", narrationText: shared, purpose: "plan large foule" }),
      bp({ panelId: "p2", narrationText: shared, purpose: "gros plan mains" }),
    ];
    const { panelsAdjusted } = applyPanelNarrativeVariationToBlueprints(bps);
    expect(panelsAdjusted).toBe(1);
    expect(bps[0]!.narrationText).toBe(shared);
    expect(bps[1]!.narrationText).toBe("Deuxième phrase.");
    expect(bps[1]!.panelTextBundle?.narration).toBe("Deuxième phrase.");
  });

  it("ajoute une distinction si une seule phrase est partagée", () => {
    const shared = "Bloc unique sans ponctuation forte";
    const bps = [
      bp({ panelId: "p1", narrationText: shared }),
      bp({ panelId: "p2", narrationText: shared, purpose: "réaction silencieuse du héros au premier plan" }),
    ];
    const { panelsAdjusted } = applyPanelNarrativeVariationToBlueprints(bps);
    expect(panelsAdjusted).toBe(1);
    const n2 = bps[1]!.narrationText;
    expect(n2).toBeDefined();
    expect(n2!).toContain(shared);
    expect(n2!.length).toBeGreaterThan(shared.length);
  });
});
