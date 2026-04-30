import { describe, expect, it } from "vitest";
import {
  buildPanelTextContractFromStoryboardPanelLike,
  legacyDialogueLinesFromStoryboardPanelLike,
  resolvePanelTextContractFromStoryboardPanelLike,
  resolveStoryboardTextContractForPersistence,
} from "./storyboard-panel-text-contract";

describe("storyboard-panel-text-contract", () => {
  it("priorise panel.dialogue puis bundle", () => {
    const contract = buildPanelTextContractFromStoryboardPanelLike({
      panelId: "p1",
      dialogue: [{ speaker: "A", text: "  Hello  " }],
      narration: null,
      sfx: null,
      panelTextBundle: {
        dialogues: [{ speaker: "B", text: "Ignored when primary lines" }],
      },
    });
    expect(contract.dialogues).toHaveLength(1);
    expect(contract.dialogues[0]?.text).toBe("Hello");
  });

  it("legacyDialogueLines aligne speaker + text", () => {
    const lines = legacyDialogueLinesFromStoryboardPanelLike({
      panelId: "p2",
      dialogue: [{ speaker: "Lyra", text: "Stop." }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    expect(lines).toEqual([{ speaker: "Lyra", text: "Stop." }]);
  });

  it("resolvePanelTextContractFromStoryboardPanelLike priorise textContract valide sur dialogue[]", () => {
    const embedded = buildPanelTextContractFromStoryboardPanelLike({
      panelId: "old",
      dialogue: [{ speaker: "Canon", text: "Ligne officielle" }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    const resolved = resolvePanelTextContractFromStoryboardPanelLike({
      panelId: "p-final",
      textContract: embedded,
      dialogue: [{ speaker: "Stale", text: "Ignoré" }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    expect(resolved.panelId).toBe("p-final");
    expect(resolved.dialogues[0]?.text).toBe("Ligne officielle");
    expect(resolved.dialogues[0]?.speakerName).toBe("Canon");
  });

  it("resolvePanelTextContractFromStoryboardPanelLike retombe sur les fragments si contrat invalide", () => {
    const bad = {
      panelId: "p1",
      hasText: true,
      dialogues: [{ speakerName: "A", text: "" }],
      narration: null,
      sfx: [],
      placement: {
        reserveTextArea: true,
        preferredAnchorZones: [],
        avoidFaces: true,
        overflowStrategy: "bubble_stack" as const,
      },
    };
    const resolved = resolvePanelTextContractFromStoryboardPanelLike({
      panelId: "p1",
      textContract: bad,
      dialogue: [{ speaker: "B", text: "Fallback" }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    expect(resolved.dialogues[0]?.text).toBe("Fallback");
  });

  it("resolveStoryboardTextContractForPersistence ne laisse pas panelTextPayload écraser textContract", () => {
    const embedded = buildPanelTextContractFromStoryboardPanelLike({
      panelId: "p1",
      dialogue: [{ speaker: "Studio", text: "Canon persisté" }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    const resolved = resolveStoryboardTextContractForPersistence(
      {
        panelId: "p1",
        textContract: embedded,
        dialogue: [{ speaker: "Wrong", text: "Spec divergent" }],
        narration: null,
        sfx: null,
        panelTextBundle: null,
      },
      {
        specPanelTextPayload: {
          dialogue: [{ speaker: "Spec", text: "Depuis render spec" }],
          narration: null,
          sfx: null,
        },
      },
    );
    expect(resolved.dialogues[0]?.speakerName).toBe("Studio");
    expect(resolved.dialogues[0]?.text).toBe("Canon persisté");
  });

  it("resolveStoryboardTextContractForPersistence utilise le payload spec sans textContract panel", () => {
    const resolved = resolveStoryboardTextContractForPersistence(
      {
        panelId: "p1",
        dialogue: [],
        narration: null,
        sfx: null,
        panelTextBundle: null,
      },
      {
        specPanelTextPayload: {
          dialogue: [{ speaker: "FAL", text: "Rendu" }],
          narration: null,
          sfx: null,
        },
      },
    );
    expect(resolved.dialogues[0]?.text).toBe("Rendu");
  });

  it("accepte dialogues (pluriel) si dialogue absent", () => {
    const contract = buildPanelTextContractFromStoryboardPanelLike({
      panelId: "p3",
      dialogue: null,
      dialogues: [{ speaker: "Zed", text: "Go." }],
      narration: null,
      sfx: null,
      panelTextBundle: null,
    });
    expect(contract.dialogues).toHaveLength(1);
    expect(contract.dialogues[0]?.text).toBe("Go.");
  });
});
