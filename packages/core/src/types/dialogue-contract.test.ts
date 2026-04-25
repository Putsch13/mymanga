import { describe, expect, it } from "vitest";
import {
  validateDialogueContract,
  buildDialogueContractFromBlueprints,
  formatDialogueContractLog,
  DIALOGUE_CONTRACT_ERROR_CODES,
  type DialogueContract,
} from "./dialogue-contract";

describe("DialogueContract", () => {
  const validContract: DialogueContract = {
    chapterId: "ch-01",
    lines: [
      {
        panelId: "panel-1",
        speakerId: "marius",
        speakerName: "Marius",
        text: "Bonjour Maya !",
        speakerVisible: true,
        dialogueType: "speech",
      },
      {
        panelId: "panel-2",
        speakerId: "maya",
        speakerName: "Maya",
        text: "Marius ! Ça faisait longtemps !",
        speakerVisible: true,
        dialogueType: "speech",
      },
    ],
    totalLines: 2,
    panelsWithDialogue: 2,
    uniqueSpeakers: ["marius", "maya"],
  };

  describe("validateDialogueContract", () => {
    it("accepts a valid contract", () => {
      const result = validateDialogueContract(validContract);
      expect(result.ok).toBe(true);
      expect(result.stats.totalLines).toBe(2);
      expect(result.stats.anchoredLines).toBe(2);
      expect(result.stats.floatingLines).toBe(0);
    });

    it("warns about floating dialogue", () => {
      const contract: DialogueContract = {
        ...validContract,
        lines: [
          {
            panelId: "panel-1",
            speakerId: "marius",
            speakerName: "Marius",
            text: "Pensées intérieures...",
            speakerVisible: false,
            dialogueType: "thought",
          },
        ],
        totalLines: 1,
        panelsWithDialogue: 1,
      };
      const result = validateDialogueContract(contract);
      expect(result.ok).toBe(true);
      expect(result.stats.floatingLines).toBe(1);
      expect(result.issues.some((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.DIALOGUE_FLOATING)).toBe(true);
    });

    it("errors when panel not found", () => {
      const result = validateDialogueContract(validContract, {
        panelIds: ["panel-99"],
      });
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.PANEL_NOT_FOUND)).toBe(true);
    });

    it("warns when speaker not in known characters", () => {
      const result = validateDialogueContract(validContract, {
        characterIds: ["other-char"],
      });
      expect(result.issues.some((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.SPEAKER_NOT_IDENTIFIED)).toBe(true);
    });

    it("allows floating dialogue when option is set", () => {
      const contract: DialogueContract = {
        ...validContract,
        lines: [
          {
            panelId: "panel-1",
            speakerId: "marius",
            speakerName: "Marius",
            text: "Off-screen voice",
            speakerVisible: false,
            dialogueType: "speech",
          },
        ],
        totalLines: 1,
        panelsWithDialogue: 1,
      };
      const result = validateDialogueContract(contract, { allowFloating: true });
      expect(result.issues.filter((i) => i.code === DIALOGUE_CONTRACT_ERROR_CODES.DIALOGUE_FLOATING)).toHaveLength(0);
    });
  });

  describe("buildDialogueContractFromBlueprints", () => {
    it("builds contract from blueprints with dialogue", () => {
      const blueprints = [
        {
          panelId: "p1",
          dialogueLines: [{ speaker: "marius", text: "Hello" }],
          requiredCharacterIds: ["marius"],
        },
        {
          panelId: "p2",
          dialogueLines: [{ speaker: "maya", text: "Hi there" }],
          requiredCharacterIds: ["maya"],
        },
        {
          panelId: "p3",
          dialogueLines: null,
        },
      ];
      const characterNameById = { marius: "Marius", maya: "Maya" };

      const contract = buildDialogueContractFromBlueprints("ch-1", blueprints, characterNameById);

      expect(contract.totalLines).toBe(2);
      expect(contract.panelsWithDialogue).toBe(2);
      expect(contract.uniqueSpeakers).toContain("marius");
      expect(contract.uniqueSpeakers).toContain("maya");
    });

    it("marks speaker as not visible when not in required characters", () => {
      const blueprints = [
        {
          panelId: "p1",
          dialogueLines: [{ speaker: "offscreen", text: "You cannot see me" }],
          requiredCharacterIds: ["hero"],
        },
      ];
      const contract = buildDialogueContractFromBlueprints("ch-1", blueprints, {});

      expect(contract.lines[0].speakerVisible).toBe(false);
    });

    it("returns empty contract when no dialogue", () => {
      const blueprints = [
        { panelId: "p1", dialogueLines: [] },
        { panelId: "p2" },
      ];
      const contract = buildDialogueContractFromBlueprints("ch-1", blueprints, {});

      expect(contract.totalLines).toBe(0);
      expect(contract.panelsWithDialogue).toBe(0);
    });
  });

  describe("formatDialogueContractLog", () => {
    it("formats contract for logging", () => {
      const log = formatDialogueContractLog(validContract);
      expect(log).toContain("[dialogue-contract]");
      expect(log).toContain("lines=2");
      expect(log).toContain("panels=2");
      expect(log).toContain("marius");
    });
  });
});
