/**
 * P0.14 / premium — DialogueContract : ancrage panel + speakers connus.
 */
import { describe, expect, it } from "vitest";
import {
  validateDialogueContract,
  DIALOGUE_CONTRACT_ERROR_CODES,
  type DialogueContract,
} from "@manga-ai-studio/core";

describe("DialogueContract (règles premium strictes)", () => {
  const base: DialogueContract = {
    chapterId: "ch-1",
    lines: [
      {
        panelId: "panel-a",
        speakerId: "hero-1",
        speakerName: "Ken",
        text: "On y va.",
        speakerVisible: true,
        dialogueType: "speech",
      },
    ],
    totalLines: 1,
    panelsWithDialogue: 1,
    uniqueSpeakers: ["hero-1"],
  };

  it("rejette un panel inconnu (ancrage premium)", () => {
    const r = validateDialogueContract(base, {
      panelIds: ["panel-b"],
      characterIds: ["hero-1"],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.PANEL_NOT_FOUND)).toBe(true);
  });

  it("signale un speaker hors registre personnages (premium)", () => {
    const r = validateDialogueContract(base, {
      panelIds: ["panel-a"],
      characterIds: ["other"],
    });
    expect(r.issues.some((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.SPEAKER_NOT_IDENTIFIED)).toBe(
      true,
    );
  });

  it("accepte speaker ancré sur panel et ID connu", () => {
    const r = validateDialogueContract(base, {
      panelIds: ["panel-a"],
      characterIds: ["hero-1"],
    });
    expect(r.ok).toBe(true);
    expect(r.stats.anchoredLines).toBe(1);
  });
});
