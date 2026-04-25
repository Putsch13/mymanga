import { describe, expect, it } from "vitest";
import { runDialogueQaPass, formatDialogueQaLog } from "./dialogue-qa-pass";
import { PIPELINE_ERROR_CODES } from "@manga-ai-studio/core";

describe("dialogue-qa-pass", () => {
  const blueprintsWithAnchored = [
    {
      panelId: "p1",
      dialogueLines: [{ speaker: "marius", text: "Bonjour Maya !" }],
      requiredCharacterIds: ["marius"],
    },
    {
      panelId: "p2",
      dialogueLines: [{ speaker: "maya", text: "Marius ! Ça faisait longtemps !" }],
      requiredCharacterIds: ["maya"],
    },
  ];

  const blueprintsWithFloating = [
    {
      panelId: "p1",
      dialogueLines: [{ speaker: "narrator", text: "Et ainsi commença l'histoire..." }],
      requiredCharacterIds: ["marius"],
    },
  ];

  const characterNameById = {
    marius: "Marius",
    maya: "Maya",
  };

  describe("runDialogueQaPass", () => {
    it("passes when all dialogues are anchored", () => {
      const result = runDialogueQaPass({
        blueprints: blueprintsWithAnchored,
        chapterId: "ch-1",
        characterNameById,
        strictMode: true,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.anchoredLines).toBe(2);
      expect(result.stats.floatingLines).toBe(0);
    });

    it("fails in strict mode when dialogues are floating", () => {
      const result = runDialogueQaPass({
        blueprints: blueprintsWithFloating,
        chapterId: "ch-1",
        characterNameById,
        strictMode: true,
      });

      expect(result.ok).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.stats.floatingLines).toBe(1);
      expect(
        result.issues.some((i) => i.code === PIPELINE_ERROR_CODES.E_DIALOGUE_SPEAKER_NOT_ANCHORED),
      ).toBe(true);
    });

    it("passes in non-strict mode even with floating dialogues", () => {
      const result = runDialogueQaPass({
        blueprints: blueprintsWithFloating,
        chapterId: "ch-1",
        characterNameById,
        strictMode: false,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.floatingLines).toBe(1);
    });

    it("handles blueprints without dialogue", () => {
      const result = runDialogueQaPass({
        blueprints: [
          { panelId: "p1", dialogueLines: null },
          { panelId: "p2", dialogueLines: [] },
        ],
        chapterId: "ch-1",
        characterNameById: {},
        strictMode: true,
      });

      expect(result.ok).toBe(true);
      expect(result.stats.totalLines).toBe(0);
    });
  });

  describe("formatDialogueQaLog", () => {
    it("formats OK result", () => {
      const result = runDialogueQaPass({
        blueprints: blueprintsWithAnchored,
        chapterId: "ch-1",
        characterNameById,
      });
      const log = formatDialogueQaLog(result);

      expect(log).toContain("[dialogue-qa] ok");
      expect(log).toContain("lines=2");
      expect(log).toContain("anchored=2");
    });

    it("formats error result", () => {
      const result = runDialogueQaPass({
        blueprints: blueprintsWithFloating,
        chapterId: "ch-1",
        characterNameById,
        strictMode: true,
      });
      const log = formatDialogueQaLog(result);

      expect(log).toContain("[dialogue-qa]");
      expect(log).toContain("errors=");
      expect(log).toContain("floating=1");
    });
  });
});
