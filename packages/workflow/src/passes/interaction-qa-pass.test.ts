import { describe, expect, it } from "vitest";
import { runInteractionQaPass, formatInteractionQaLog } from "./interaction-qa-pass";

describe("interaction-qa-pass", () => {
  describe("runInteractionQaPass", () => {
    it("passes with well-structured dialogue panels", () => {
      const panels = [
        {
          panelId: "p1",
          renderMode: "dialogue_two_shot",
          visibleCharacterIds: ["marius", "maya"],
          dialogueLines: [{ speaker: "marius", text: "Bonjour!" }],
        },
        {
          panelId: "p2",
          renderMode: "reaction_shot",
          visibleCharacterIds: ["maya"],
          actionLine: "Maya réagit avec surprise",
        },
      ];

      const result = runInteractionQaPass({ panels });

      expect(result.ok).toBe(true);
      expect(result.stats.dialoguePanels).toBe(1);
      expect(result.stats.reactionPanels).toBe(1);
    });

    it("warns when dialogue panel has no visible characters", () => {
      const panels = [
        {
          panelId: "p1",
          visibleCharacterIds: [],
          dialogueLines: [{ speaker: "narrator", text: "Off-screen voice" }],
        },
      ];

      const result = runInteractionQaPass({ panels });

      expect(result.warningCount).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.panelId === "p1")).toBe(true);
    });

    it("warns when dialogue_two_shot has fewer than 2 characters", () => {
      const panels = [
        {
          panelId: "p1",
          renderMode: "dialogue_two_shot",
          visibleCharacterIds: ["marius"],
          dialogueLines: [{ speaker: "marius", text: "Alone..." }],
        },
      ];

      const result = runInteractionQaPass({ panels });

      expect(result.warningCount).toBeGreaterThan(0);
    });

    it("errors in strict mode when dialogue_two_shot has wrong character count", () => {
      const panels = [
        {
          panelId: "p1",
          renderMode: "dialogue_two_shot",
          visibleCharacterIds: ["marius"],
        },
      ];

      const result = runInteractionQaPass({ panels, strictMode: true });

      expect(result.ok).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
    });

    it("validates expected interactions between characters", () => {
      const panels = [
        {
          panelId: "p1",
          visibleCharacterIds: ["marius", "maya"],
          dialogueLines: [{ speaker: "marius", text: "Hello" }],
        },
      ];

      const result = runInteractionQaPass({
        panels,
        expectedInteractions: [
          { characterA: "marius", characterB: "maya", interactionType: "dialogue" },
        ],
      });

      expect(result.stats.interactionsCovered).toBe(1);
    });

    it("warns when expected interaction is not covered", () => {
      const panels = [
        {
          panelId: "p1",
          visibleCharacterIds: ["marius"],
          dialogueLines: [],
        },
      ];

      const result = runInteractionQaPass({
        panels,
        expectedInteractions: [
          { characterA: "marius", characterB: "maya", interactionType: "dialogue" },
        ],
      });

      expect(result.stats.interactionsCovered).toBe(0);
      expect(result.warningCount).toBeGreaterThan(0);
    });

    it("counts multi-character panels", () => {
      const panels = [
        { panelId: "p1", visibleCharacterIds: ["a", "b", "c"] },
        { panelId: "p2", visibleCharacterIds: ["a"] },
        { panelId: "p3", visibleCharacterIds: ["a", "b"] },
      ];

      const result = runInteractionQaPass({ panels });

      expect(result.stats.multiCharacterPanels).toBe(2);
    });
  });

  describe("formatInteractionQaLog", () => {
    it("formats OK result", () => {
      const result = runInteractionQaPass({
        panels: [
          {
            panelId: "p1",
            visibleCharacterIds: ["a", "b"],
            dialogueLines: [{ text: "Hi" }],
          },
        ],
      });
      const log = formatInteractionQaLog(result);

      expect(log).toContain("[interaction-qa] ok");
    });

    it("formats result with issues", () => {
      const result = runInteractionQaPass({
        panels: [
          { panelId: "p1", visibleCharacterIds: [], dialogueLines: [{ text: "Hi" }] },
        ],
      });
      const log = formatInteractionQaLog(result);

      expect(log).toContain("[interaction-qa]");
      expect(log).toContain("warnings=");
    });
  });
});
