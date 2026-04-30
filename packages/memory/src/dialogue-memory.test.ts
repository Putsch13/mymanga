import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { describe, expect, it } from "vitest";
import { collectDialogueSnippetsFromBlueprints, normalizeDialogueSnippet } from "./dialogue-memory";

describe("dialogue-memory", () => {
  it("normalise et tronque", () => {
    expect(normalizeDialogueSnippet("  Hé…  ")).toBe("he…");
  });

  it("collecte les snippets uniques", () => {
    const bps: Pick<
      PanelBlueprintPremium,
      "panelId" | "dialogueLines" | "textContract" | "panelTextBundle" | "narrationText" | "sfxCues"
    >[] = [
      { panelId: "p1", dialogueLines: [{ speaker: "A", text: "Bonjour." }], textContract: null, panelTextBundle: null, narrationText: null, sfxCues: undefined },
      {
        panelId: "p2",
        dialogueLines: [{ speaker: "B", text: "Bonjour." }, { speaker: "B", text: "Suite." }],
        textContract: null,
        panelTextBundle: null,
        narrationText: null,
        sfxCues: undefined,
      },
    ];
    expect(collectDialogueSnippetsFromBlueprints(bps)).toEqual(["bonjour.", "suite."]);
  });
});
