import { getDialogueStyleProfile } from "@manga-ai-studio/ai";
import { describe, expect, it } from "vitest";
import { inferPanelTextFromBeatSummary } from "./dialogue-beat-rebalance";

describe("inferPanelTextFromBeatSummary (déterministe)", () => {
  it("produit une réplique dialogue quand le beat évoque une discussion", () => {
    const profile = getDialogueStyleProfile({ genre: "shonen", tone: "grave" });
    const r = inferPanelTextFromBeatSummary(
      "Le héros s’approche pour discuter avec son rival.",
      "speaker",
      "Kai",
      { seed: "beat1:panel2", profile },
    );
    expect(r.mode).toBe("dialogue");
    expect(r.text?.length).toBeGreaterThan(3);
    expect(r.speaker).toBe("Kai");
  });

  it("sans contexte de style, reste silencieux", () => {
    const r = inferPanelTextFromBeatSummary("discuter avec l’antagoniste", "speaker", "A");
    expect(r.mode).toBe("silent");
  });
});
