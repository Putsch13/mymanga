import { describe, expect, it } from "vitest";
import { planPanelDialogueText } from "./panel-dialogue-text-plan";

describe("planPanelDialogueText", () => {
  it("met reserveTextArea à false pour un panel sans texte", () => {
    const [row] = planPanelDialogueText({
      sceneId: "s1",
      layout: "A",
      panels: [{ panelId: "p1" }],
      dialogue: [],
    });
    expect(row.reserveTextArea).toBe(false);
    expect(row.density).toBe("empty");
  });

  it("met reserveTextArea à true quand il y a des bulles", () => {
    const [row] = planPanelDialogueText({
      sceneId: "s1",
      layout: "A",
      panels: [{ panelId: "p1" }],
      dialogue: [
        {
          panelId: "p1",
          bubbles: [
            {
              id: "b1",
              speaker: "A",
              text: "Une réplique assez longue pour le test.",
              bubbleType: "speech",
              priority: 1,
              readingOrder: 1,
            },
          ],
          narration: [],
          sfx: [],
        },
      ],
    });
    expect(row.reserveTextArea).toBe(true);
  });
});
