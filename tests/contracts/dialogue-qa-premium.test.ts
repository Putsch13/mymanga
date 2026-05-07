import { describe, expect, it } from "vitest";
import { createDialogueTextContract, runDialogueQaPremium } from "@manga-ai-studio/core";

describe("runDialogueQaPremium", () => {
  it("signale une erreur si characterId manquant sur une réplique", () => {
    const text = createDialogueTextContract("p1", [{ speakerName: "Héros", text: "Salut." }]);
    const r = runDialogueQaPremium({
      panels: [{ panelNumber: 1, text, visibleCharacterIds: ["hero-1"] }],
    });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === "DIALOGUE_SPEAKER_ID_MISSING")).toBe(true);
  });

  it("accepte une réplique avec speakerId et score speakerAnchor", () => {
    const text = createDialogueTextContract("p1", [
      { speakerId: "hero-1", speakerName: "Héros", text: "Allons-y." },
    ]);
    const r = runDialogueQaPremium({
      panels: [{ panelNumber: 1, text, visibleCharacterIds: ["hero-1"] }],
    });
    expect(r.valid).toBe(true);
    expect(r.scores.speakerAnchorScore).toBeGreaterThan(0.9);
  });
});
