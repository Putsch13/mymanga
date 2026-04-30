import { describe, expect, it } from "vitest";
import {
  isPersistedPanelTextContract,
  primaryDialogueLineRowsFromLooseMetadata,
  metadataSfxToStringArray,
  stripLegacyPanelTextFieldsWhenContractPresent,
  synthesizePanelTextContractFromLooseMetadata,
} from "./reader-panel-metadata-text";
import { textContractToLegacyDialogue } from "./panel-text-contract";

describe("reader-panel-metadata-text", () => {
  it("isPersistedPanelTextContract reconnaît un contrat persisté", () => {
    expect(
      isPersistedPanelTextContract({
        panelId: "p1",
        hasText: true,
        dialogues: [],
        placement: { reserveTextArea: false, preferredAnchorZones: [], avoidFaces: true, overflowStrategy: "bubble_stack" },
        sfx: [],
      }),
    ).toBe(true);
    expect(isPersistedPanelTextContract(null)).toBe(false);
  });

  it("primaryDialogueLineRowsFromLooseMetadata lit dialogues[]", () => {
    const rows = primaryDialogueLineRowsFromLooseMetadata({
      dialogues: [{ speaker: "A", text: "Hi" }],
    });
    expect(rows).toEqual([{ speaker: "A", text: "Hi" }]);
  });

  it("primaryDialogueLineRowsFromLooseMetadata accepte speakerName", () => {
    expect(
      primaryDialogueLineRowsFromLooseMetadata({
        dialogues: [{ speakerName: "Lyra", text: "Stop." }],
      }),
    ).toEqual([{ speaker: "Lyra", text: "Stop." }]);
  });

  it("metadataSfxToStringArray accepte string ou tableau", () => {
    expect(metadataSfxToStringArray("boom")).toEqual(["boom"]);
    expect(metadataSfxToStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(metadataSfxToStringArray(null)).toBeNull();
  });

  it("synthesizePanelTextContractFromLooseMetadata retourne le contrat persisté s’il est valide (ignore dialogues[] concurrents)", () => {
    const c = synthesizePanelTextContractFromLooseMetadata(
      {
        dialogues: [{ speaker: "Wrong", text: "Stale" }],
        textContract: {
          panelId: "p-contract",
          hasText: true,
          dialogues: [{ speakerName: "Right", text: "Canon" }],
          narration: null,
          sfx: [],
          placement: {
            reserveTextArea: true,
            preferredAnchorZones: [],
            avoidFaces: true,
            overflowStrategy: "bubble_stack",
          },
        },
      },
      "fallback-id",
    );
    expect(c.panelId).toBe("p-contract");
    expect(textContractToLegacyDialogue(c)[0]?.text).toBe("Canon");
  });

  it("stripLegacyPanelTextFieldsWhenContractPresent retire dialogue/narration/sfx si contrat valide", () => {
    const stripped = stripLegacyPanelTextFieldsWhenContractPresent({
      panelId: "p1",
      narration: "Legacy narr",
      sfx: ["boom"],
      dialogues: [{ speaker: "X", text: "Stale" }],
      textContract: {
        panelId: "p1",
        hasText: true,
        dialogues: [{ speakerName: "A", text: "Hi" }],
        narration: "N",
        sfx: [],
        placement: {
          reserveTextArea: true,
          preferredAnchorZones: [],
          avoidFaces: true,
          overflowStrategy: "bubble_stack",
        },
      },
    });
    expect(stripped.narration).toBeUndefined();
    expect(stripped.sfx).toBeUndefined();
    expect(stripped.dialogues).toBeUndefined();
    expect((stripped.textContract as { dialogues: unknown[] }).dialogues).toHaveLength(1);
  });

  it("stripLegacyPanelTextFieldsWhenContractPresent ne modifie pas sans contrat valide", () => {
    const m = { narration: "Only loose", dialogues: [{ speaker: "A", text: "Hi" }] };
    expect(stripLegacyPanelTextFieldsWhenContractPresent(m)).toBe(m);
  });

  it("synthesizePanelTextContractFromLooseMetadata fusionne narration + sfx", () => {
    const c = synthesizePanelTextContractFromLooseMetadata(
      {
        dialogues: [{ speaker: "X", text: "Hey" }],
        narration: "N.",
        sfx: "whoosh",
      },
      "fallback-id",
    );
    expect(c.panelId).toBe("fallback-id");
    expect(c.narration).toBe("N.");
    expect(c.sfx.map((s) => s.text)).toContain("whoosh");
  });
});
