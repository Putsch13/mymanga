import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { describe, expect, it } from "vitest";
import { collectDialogueSnippetsFromBlueprints, normalizeDialogueSnippet } from "./dialogue-memory";

describe("dialogue-memory", () => {
  it("normalise et tronque", () => {
    expect(normalizeDialogueSnippet("  Hé…  ")).toBe("he…");
  });

  it("collecte les snippets uniques", () => {
    const bps: Pick<PanelBlueprintPremium, "dialogueLines">[] = [
      { dialogueLines: [{ speaker: "A", text: "Bonjour." }] },
      { dialogueLines: [{ speaker: "B", text: "Bonjour." }, { speaker: "B", text: "Suite." }] },
    ];
    expect(collectDialogueSnippetsFromBlueprints(bps)).toEqual(["bonjour.", "suite."]);
  });
});
