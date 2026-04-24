import { describe, expect, it } from "vitest";

import { composePanelTextPresentation } from "../components/manga/panel/panel-text-compositor";
import { composePanelTextLayer } from "../components/manga/panel/bubble-compositor";

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

describe("bubble-compositor — coerceText robustness", () => {
  it("ne crash pas quand sfx est un array de strings", () => {
    expect(() =>
      composePanelTextLayer({
        panelId: "p1",
        dialogues: [],
        sfx: ["BOOM", "CRACK"] as unknown as string,
      }),
    ).not.toThrow();

    const result = composePanelTextLayer({
      panelId: "p1",
      dialogues: [],
      sfx: ["BOOM", "CRACK"] as unknown as string,
    });
    expect(result.sfx[0]?.text).toBe("BOOM CRACK");
  });

  it("ne crash pas quand narration est un objet { text }", () => {
    expect(() =>
      composePanelTextLayer({
        panelId: "p1",
        dialogues: [],
        narration: { text: "Une voix retentit" } as unknown as string,
      }),
    ).not.toThrow();

    const result = composePanelTextLayer({
      panelId: "p1",
      dialogues: [],
      narration: { text: "Une voix retentit" } as unknown as string,
    });
    expect(result.captions[0]?.text).toBe("Une voix retentit");
  });

  it("ne crash pas quand sfx est un array d'objets { text }", () => {
    expect(() =>
      composePanelTextLayer({
        panelId: "p1",
        dialogues: [],
        sfx: [{ text: "BOOM" }, { text: "CRACK" }] as unknown as string,
      }),
    ).not.toThrow();
  });

  it("gère narration undefined sans crash", () => {
    expect(() =>
      composePanelTextLayer({
        panelId: "p1",
        dialogues: [],
        narration: undefined,
      }),
    ).not.toThrow();
  });
});
