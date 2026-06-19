import { describe, expect, it } from "vitest";
import { createDialogueTextContract, syncAllTextViewsFromPanelTextContract } from "@manga-ai-studio/core";

describe("syncAllTextViewsFromPanelTextContract (P0.16)", () => {
  it("propage dialogues + narration + sfx vers dialogueLines et panelTextBundle", () => {
    const contract = createDialogueTextContract(
      "p9",
      [{ speakerId: "c1", speakerName: "Maya", text: "On y va." }],
      { narration: "Pluie.", sfx: [{ text: "BOOM", kind: "impact" }] },
    );
    const merged = syncAllTextViewsFromPanelTextContract(
      {
        panelId: "p9",
        dialogueLines: [{ speaker: "stale", text: "old" }],
        narrationText: "old nar",
        sfxCues: ["old"],
        panelTextBundle: { dialogues: [{ speaker: "stale", text: "old" }], narration: null, sfx: [] },
      },
      contract,
    );
    expect(merged.textContract.dialogues[0]?.text).toBe("On y va.");
    expect(merged.dialogueLines?.[0]).toMatchObject({ speaker: "Maya", text: "On y va.", characterId: "c1" });
    expect(merged.narrationText).toBe("Pluie.");
    expect(merged.panelTextBundle?.dialogues?.[0]?.text).toBe("On y va.");
  });
});
