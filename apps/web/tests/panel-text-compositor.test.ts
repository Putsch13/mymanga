import { describe, expect, it } from "vitest";

import { composePanelTextPresentation } from "../components/manga/panel/panel-text-compositor";

describe("panel-text-compositor", () => {
  it("honore les preferredAnchorZones pour les premières bulles", () => {
    const result = composePanelTextPresentation({
      panelId: "panel-1",
      dialogues: [{ speaker: "Hero", text: "Salut" }],
      preferredAnchorZones: ["top-right"],
    });

    expect(result.layer.bubbles[0]?.reservedZone).toBe("top-right");
    expect((result.layer.bubbles[0]?.bounds.x ?? 0) > 50).toBe(true);
    expect(result.textLayout.dialogueBoxes).toHaveLength(1);
    expect(result.textLayout.dialogueBoxes[0]?.text).toBe("Salut");
  });

  it("remonte les dialogues en overflow pour un caption strip", () => {
    const result = composePanelTextPresentation({
      panelId: "panel-2",
      dialogues: Array.from({ length: 8 }, (_, index) => ({
        speaker: `S${index}`,
        text: `Ligne ${index}`,
      })),
      overflowStrategy: "caption_strip",
    });

    expect(result.layer.bubbles).toHaveLength(6);
    expect(result.textLayout.dialogueBoxes).toHaveLength(6);
    expect(result.overflowDialogues).toHaveLength(2);
  });
});
