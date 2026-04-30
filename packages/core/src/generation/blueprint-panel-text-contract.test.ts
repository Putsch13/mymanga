import { describe, expect, it } from "vitest";
import {
  legacyDialogueLinesFromBlueprintPremium,
  resolvePanelTextContractFromBlueprintPremium,
  syncBlueprintTextContractFromTextFragments,
} from "./blueprint-panel-text-contract";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

describe("blueprint-panel-text-contract (PR9)", () => {
  it("priorise un textContract persisté valide sur dialogueLines divergents", () => {
    const bp = {
      panelId: "p1",
      dialogueLines: [{ speaker: "Wrong", text: "stale" }],
      textContract: {
        panelId: "p1",
        hasText: true,
        dialogues: [{ speakerName: "Right", text: "canon line" }],
        narration: null,
        sfx: [],
        placement: {
          reserveTextArea: true,
          preferredAnchorZones: [],
          avoidFaces: true,
          overflowStrategy: "bubble_stack",
        },
      },
      panelTextBundle: null,
      narrationText: null,
      sfxCues: undefined,
    };
    expect(legacyDialogueLinesFromBlueprintPremium(bp)[0]?.text).toBe("canon line");
  });

  it("syncBlueprintTextContractFromTextFragments recalcule le contrat", () => {
    const bp: PanelBlueprintPremium = {
      panelId: "p2",
      beatId: "b1",
      panelNumber: 1,
      purpose: "x",
      shotType: "medium",
      cameraAngle: "eye",
      subjectFocus: "hero",
      cutawayType: "none",
      heroCenterAllowed: true,
      criticality: "low",
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      requiredLocationSignals: [],
      dialogueLines: [{ speaker: "A", text: "Hi" }],
    };
    syncBlueprintTextContractFromTextFragments(bp);
    expect(bp.textContract?.hasText).toBe(true);
    expect(resolvePanelTextContractFromBlueprintPremium(bp).dialogues[0]?.text).toBe("Hi");
  });
});
