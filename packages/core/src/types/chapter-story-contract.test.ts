import { describe, expect, it } from "vitest";
import {
  buildChapterStoryContract,
  validateChapterStoryContract,
  assertValidChapterStoryContract,
  ChapterStoryContractError,
  formatStoryContractLog,
  isPropForbidden,
  isCharacterRequired,
  STORY_CONTRACT_ERROR_CODES,
  type ChapterStoryContract,
} from "./chapter-story-contract";

describe("ChapterStoryContract", () => {
  const validContract: ChapterStoryContract = {
    chapterId: "ch-01",
    chapterNumber: 1,
    chapterGoal: "Marius revient au port et retrouve Maya",
    storySummary: "",
    tone: "nostalgic",
    heroCharacterId: "marius",
    requiredCharacterIds: ["marius", "maya"],
    optionalCharacterIds: [],
    requiredNpcGroups: [
      {
        groupId: "pecheurs",
        label: "pêcheurs du port",
        visualDescription: "hommes en cirés jaunes",
        requiredInBeatIds: ["beat-2"],
        optionalInBeatIds: [],
      },
    ],
    requiredLocations: [
      {
        locationId: "port",
        name: "port de pêche",
        visualDescription: "quai avec bateaux et filets",
        primaryInBeatIds: ["beat-1", "beat-2"],
        isPrimaryLocation: true,
      },
    ],
    allowedProps: [
      {
        propId: "filet",
        canonicalName: "fishing net",
        allowedInBeatIds: [],
        isNarrativelyImportant: false,
      },
    ],
    forbiddenProps: ["smartphone", "gun", "car"],
    emotionalArc: [
      { step: "arrivée", beatIds: ["beat-1"], intensity: 30 },
      { step: "nostalgie", beatIds: ["beat-2"], intensity: 50 },
      { step: "retrouvailles", beatIds: ["beat-3"], intensity: 80 },
    ],
    expectedBeatCount: 10,
    beatIds: ["beat-1", "beat-2", "beat-3"],
  };

  describe("validateChapterStoryContract", () => {
    it("accepts a valid contract", () => {
      const result = validateChapterStoryContract(validContract);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("rejects missing heroCharacterId", () => {
      const contract = { ...validContract, heroCharacterId: "" };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(STORY_CONTRACT_ERROR_CODES.HERO_MISSING);
    });

    it("rejects missing chapterGoal", () => {
      const contract = { ...validContract, chapterGoal: "" };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe(STORY_CONTRACT_ERROR_CODES.GOAL_MISSING);
    });

    it("rejects empty requiredCharacterIds", () => {
      const contract = { ...validContract, requiredCharacterIds: [] };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === STORY_CONTRACT_ERROR_CODES.NO_REQUIRED_CHARACTERS)).toBe(true);
    });

    it("rejects empty requiredLocations", () => {
      const contract = { ...validContract, requiredLocations: [] };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === STORY_CONTRACT_ERROR_CODES.NO_REQUIRED_LOCATIONS)).toBe(true);
    });

    it("rejects hero not in requiredCharacterIds", () => {
      const contract = {
        ...validContract,
        heroCharacterId: "unknown-hero",
        requiredCharacterIds: ["marius", "maya"],
      };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === STORY_CONTRACT_ERROR_CODES.HERO_NOT_IN_REQUIRED)).toBe(true);
    });

    it("rejects prop that is both allowed and forbidden", () => {
      const contract = {
        ...validContract,
        allowedProps: [
          { propId: "phone", canonicalName: "smartphone", allowedInBeatIds: [], isNarrativelyImportant: false },
        ],
        forbiddenProps: ["smartphone"],
      };
      const result = validateChapterStoryContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === STORY_CONTRACT_ERROR_CODES.FORBIDDEN_PROP_IN_ALLOWED)).toBe(true);
    });
  });

  describe("assertValidChapterStoryContract", () => {
    it("does not throw for valid contract", () => {
      expect(() => assertValidChapterStoryContract(validContract)).not.toThrow();
    });

    it("throws ChapterStoryContractError for invalid contract", () => {
      const contract = { ...validContract, heroCharacterId: "" };
      expect(() => assertValidChapterStoryContract(contract)).toThrow(ChapterStoryContractError);
    });
  });

  describe("buildChapterStoryContract", () => {
    it("builds a valid contract from minimal input", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-42",
        chapterNumber: 42,
        chapterTitle: "Marius au port",
        chapterSummary: "Marius revient au village",
        heroCharacterId: "marius",
        characters: [
          { id: "marius", name: "Marius", roleType: "hero" },
          { id: "maya", name: "Maya", roleType: "supporting" },
        ],
        locations: [{ id: "port", name: "Port de Marseille" }],
      });

      expect(contract.chapterId).toBe("ch-42");
      expect(contract.heroCharacterId).toBe("marius");
      expect(contract.requiredCharacterIds).toContain("marius");
      expect(contract.requiredCharacterIds).toContain("maya");
      expect(contract.requiredLocations).toHaveLength(1);
      expect(contract.forbiddenProps).toContain("smartphone");
    });

    it("adds heroCharacterId to requiredCharacterIds if missing", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        heroCharacterId: "hero-id",
        characters: [{ id: "sidekick", name: "Sidekick" }],
      });

      expect(contract.requiredCharacterIds).toContain("hero-id");
    });

    it("creates default location if none provided", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        heroCharacterId: "hero",
        characters: [{ id: "hero", name: "Hero" }],
      });

      expect(contract.requiredLocations).toHaveLength(1);
      expect(contract.requiredLocations[0].isPrimaryLocation).toBe(true);
    });

    it("uses chapterUserIntent as goal when available", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        chapterUserIntent: "Une scène dramatique au port",
        chapterSummary: "Résumé générique",
        heroCharacterId: "hero",
        characters: [{ id: "hero", name: "Hero" }],
      });

      expect(contract.chapterGoal).toBe("Une scène dramatique au port");
    });

    it("includes NPC groups when provided", () => {
      const contract = buildChapterStoryContract({
        chapterId: "ch-1",
        chapterNumber: 1,
        heroCharacterId: "hero",
        characters: [{ id: "hero", name: "Hero" }],
        npcGroups: [
          { id: "fishermen", label: "pêcheurs", visualDescription: "men in yellow raincoats" },
        ],
      });

      expect(contract.requiredNpcGroups).toHaveLength(1);
      expect(contract.requiredNpcGroups[0].label).toBe("pêcheurs");
    });
  });

  describe("formatStoryContractLog", () => {
    it("formats contract for logging", () => {
      const log = formatStoryContractLog(validContract);
      expect(log).toContain("[story-contract]");
      expect(log).toContain("beats=3");
      expect(log).toContain("requiredCharacters=marius,maya");
      expect(log).toContain("requiredLocations=port de pêche");
      expect(log).toContain("requiredNpcGroups=pêcheurs du port");
      expect(log).toContain("forbiddenProps=3");
    });
  });

  describe("isPropForbidden", () => {
    it("returns true for forbidden prop", () => {
      expect(isPropForbidden(validContract, "smartphone")).toBe(true);
      expect(isPropForbidden(validContract, "SMARTPHONE")).toBe(true);
      expect(isPropForbidden(validContract, "my smartphone")).toBe(true);
    });

    it("returns false for allowed prop", () => {
      expect(isPropForbidden(validContract, "fishing net")).toBe(false);
      expect(isPropForbidden(validContract, "boat")).toBe(false);
    });
  });

  describe("isCharacterRequired", () => {
    it("returns true for required character", () => {
      expect(isCharacterRequired(validContract, "marius")).toBe(true);
      expect(isCharacterRequired(validContract, "maya")).toBe(true);
    });

    it("returns false for non-required character", () => {
      expect(isCharacterRequired(validContract, "unknown")).toBe(false);
    });
  });
});
