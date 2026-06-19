import { describe, expect, it } from "vitest";
import {
  generationContractToScriptPanelText,
  legacyDialogueToPanelTextContract,
  scriptPanelTextContractToGenerationContract,
} from "./panel-text-contract-adapters";
import type { PanelTextContract } from "../generation/panel-text-contract";

describe("panel-text-contract-adapters (PR5)", () => {
  it("legacyDialogueToPanelTextContract accepte un contrat persisté embarqué", () => {
    const embedded: PanelTextContract = {
      panelId: "p1",
      hasText: true,
      dialogues: [{ speakerName: "A", text: "Hi" }],
      narration: null,
      sfx: [],
      placement: {
        reserveTextArea: true,
        preferredAnchorZones: [],
        avoidFaces: true,
        overflowStrategy: "bubble_stack",
      },
    };
    const out = legacyDialogueToPanelTextContract({ panelId: "p1", textContract: embedded });
    expect(out.panelId).toBe("p1");
    expect(out.dialogues[0]?.text).toBe("Hi");
  });

  it("script ↔ generation roundtrip minimal", () => {
    const script = {
      dialogueLines: [{ id: "d1", speakerName: "Maya", text: "Salut" }],
      narration: [],
      sfx: [],
      captions: [],
    };
    const gen = scriptPanelTextContractToGenerationContract("p9", script);
    expect(gen.dialogues[0]?.speakerName).toBe("Maya");
    const back = generationContractToScriptPanelText(gen);
    expect(back.dialogueLines[0]?.text).toBe("Salut");
  });
});
