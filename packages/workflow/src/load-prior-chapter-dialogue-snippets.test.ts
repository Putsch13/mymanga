import { describe, expect, it } from "vitest";
import { extractDialogueSnippetsFromChapterOutline } from "./load-prior-chapter-dialogue-snippets";

describe("extractDialogueSnippetsFromChapterOutline", () => {
  it("lit productionPlan.panelBlueprints sous studio.data", () => {
    const outline = {
      studio: {
        data: {
          productionPlan: {
            panelBlueprints: [
              { dialogueLines: [{ speaker: "A", text: "Allô." }] },
              { dialogueLines: [{ speaker: "B", text: "Allô." }] },
            ],
          },
        },
      },
    };
    const sn = extractDialogueSnippetsFromChapterOutline(outline, 10);
    expect(sn).toEqual(["allo."]);
  });

  it("accepte productionPlan à la racine de l'outline", () => {
    const outline = {
      productionPlan: {
        panelBlueprints: [{ dialogueLines: [{ speaker: "X", text: "Partez !" }] }],
      },
    };
    expect(extractDialogueSnippetsFromChapterOutline(outline)).toEqual(["partez !"]);
  });
});
