import { describe, expect, it } from "vitest";
import {
  validateChapterCastContract,
  buildChapterCastContract,
  formatCastContractLog,
  assertValidChapterCastContract,
  ChapterCastContractError,
  CAST_CONTRACT_ERROR_CODES,
  orderedEditorHeroCharacterIds,
  type ChapterCastContract,
} from "./chapter-cast-contract";

describe("ChapterCastContract", () => {
  const validContract: ChapterCastContract = {
    chapterId: "ch-1",
    heroCharacterId: "marius",
    activeCharacterIds: ["marius", "maya"],
    supportCharacterIds: ["maya"],
    antagonistCharacterIds: [],
    npcGroups: [
      {
        groupId: "pecheurs",
        label: "pêcheurs du port",
        visualDescription: "marins au travail",
        memberCountHint: 5,
        requiredInBeatIds: ["beat-2"],
        optionalInBeatIds: ["beat-1", "beat-3"],
      },
    ],
    members: [
      {
        characterId: "marius",
        name: "Marius",
        role: "hero",
        allowsCloseup: true,
        canSpeak: true,
        requiredInBeatIds: [],
        forbiddenInBeatIds: [],
      },
      {
        characterId: "maya",
        name: "Maya",
        role: "support",
        allowsCloseup: true,
        canSpeak: true,
        requiredInBeatIds: ["beat-3"],
        forbiddenInBeatIds: [],
      },
    ],
    secondaryHeroCharacterId: null,
  };

  describe("validateChapterCastContract", () => {
    it("accepte un contrat valide", () => {
      const result = validateChapterCastContract(validContract);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("refuse un contrat sans heroCharacterId", () => {
      const contract = { ...validContract, heroCharacterId: "" };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.HERO_MISSING)).toBe(true);
    });

    it("refuse un contrat où le héros n'est pas dans activeCharacterIds", () => {
      const contract = {
        ...validContract,
        heroCharacterId: "marius",
        activeCharacterIds: ["maya"], // marius absent
      };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.HERO_NOT_IN_ACTIVE)).toBe(true);
    });

    it("refuse un contrat avec activeCharacterIds vide", () => {
      const contract = { ...validContract, activeCharacterIds: [] };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.ACTIVE_EMPTY)).toBe(true);
    });

    it("refuse un support qui n'est pas dans activeCharacterIds", () => {
      const contract = {
        ...validContract,
        supportCharacterIds: ["maya", "unknown-char"],
      };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.SUPPORT_NOT_IN_ACTIVE)).toBe(true);
    });

    it("refuse un second héros identique au héros principal", () => {
      const contract: ChapterCastContract = {
        ...validContract,
        secondaryHeroCharacterId: "marius",
      };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.SECONDARY_SAME_AS_HERO),
      ).toBe(true);
    });

    it("refuse un héros secondaire hors activeCharacterIds", () => {
      const contract: ChapterCastContract = {
        ...validContract,
        secondaryHeroCharacterId: "carlos",
      };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.SECONDARY_NOT_IN_ACTIVE),
      ).toBe(true);
    });

    it("refuse plusieurs héros dans members", () => {
      const contract = {
        ...validContract,
        members: [
          { ...validContract.members[0]!, role: "hero" as const },
          { ...validContract.members[1]!, role: "hero" as const },
        ],
      };
      const result = validateChapterCastContract(contract);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.DUPLICATE_HERO)).toBe(true);
    });
  });

  describe("assertValidChapterCastContract", () => {
    it("ne lance pas d'erreur pour un contrat valide", () => {
      expect(() => assertValidChapterCastContract(validContract)).not.toThrow();
    });

    it("lance ChapterCastContractError pour un contrat invalide", () => {
      const contract = { ...validContract, heroCharacterId: "" };
      expect(() => assertValidChapterCastContract(contract)).toThrow(ChapterCastContractError);
    });
  });

  describe("buildChapterCastContract", () => {
    it("construit un contrat à partir des inputs pipeline", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "marius",
        focusCharacterIds: ["marius", "maya"],
        characters: [
          { id: "marius", name: "Marius", roleType: "main_hero" },
          { id: "maya", name: "Maya", roleType: "support" },
        ],
        npcGroups: [
          { id: "pecheurs", label: "pêcheurs du port" },
        ],
      });

      expect(contract.heroCharacterId).toBe("marius");
      expect(contract.activeCharacterIds).toContain("marius");
      expect(contract.activeCharacterIds).toContain("maya");
      expect(contract.members.find((m) => m.characterId === "marius")?.role).toBe("hero");
      expect(contract.members.find((m) => m.characterId === "maya")?.role).toBe("support");
      expect(contract.npcGroups).toHaveLength(1);
    });

    it("utilise focusCharacterIds[0] si heroCharacterId absent", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: null,
        focusCharacterIds: ["marius", "maya"],
        characters: [
          { id: "marius", name: "Marius" },
          { id: "maya", name: "Maya" },
        ],
      });

      expect(contract.heroCharacterId).toBe("marius");
    });

    it("lance une erreur si aucun héros ne peut être déduit", () => {
      expect(() =>
        buildChapterCastContract({
          chapterId: "ch-1",
          heroCharacterId: null,
          focusCharacterIds: [],
          characters: [],
        }),
      ).toThrow(ChapterCastContractError);
    });

    it("insère le héros secondaire juste après le héros dans activeCharacterIds", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "marius",
        secondaryHeroCharacterId: "maya",
        focusCharacterIds: ["marius", "carlos", "maya"],
        characters: [
          { id: "marius", name: "Marius", roleType: "main_hero" },
          { id: "maya", name: "Maya", roleType: "deuteragonist" },
          { id: "carlos", name: "Carlos", roleType: "support" },
        ],
      });

      expect(contract.secondaryHeroCharacterId).toBe("maya");
      expect(contract.activeCharacterIds.slice(0, 2)).toEqual(["marius", "maya"]);
      expect(contract.members.find((m) => m.characterId === "maya")?.role).toBe("support");
    });

    it("lance une erreur si secondaryHeroCharacterId === heroCharacterId", () => {
      expect(() =>
        buildChapterCastContract({
          chapterId: "ch-1",
          heroCharacterId: "marius",
          secondaryHeroCharacterId: "marius",
          focusCharacterIds: ["marius", "maya"],
          characters: [
            { id: "marius", name: "Marius" },
            { id: "maya", name: "Maya" },
          ],
        }),
      ).toThrow(ChapterCastContractError);
    });

    it("lance une erreur si secondaryHeroCharacterId absent de la liste characters", () => {
      expect(() =>
        buildChapterCastContract({
          chapterId: "ch-1",
          heroCharacterId: "marius",
          secondaryHeroCharacterId: "ghost",
          focusCharacterIds: ["marius", "maya"],
          characters: [
            { id: "marius", name: "Marius" },
            { id: "maya", name: "Maya" },
          ],
        }),
      ).toThrow(ChapterCastContractError);
    });

    it("ajoute automatiquement le héros dans activeCharacterIds", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "marius",
        activeCharacterIds: ["maya"], // marius absent
        characters: [
          { id: "marius", name: "Marius" },
          { id: "maya", name: "Maya" },
        ],
      });

      expect(contract.activeCharacterIds).toContain("marius");
      expect(contract.activeCharacterIds[0]).toBe("marius"); // en premier
    });
  });

  describe("formatCastContractLog", () => {
    it("produit le format de log attendu", () => {
      const log = formatCastContractLog(validContract);
      expect(log).toContain("[cast-contract]");
      expect(log).toContain("hero=marius");
      expect(log).toContain("active=marius,maya");
      expect(log).toContain("support=maya");
      expect(log).toContain("npcGroups=pêcheurs du port");
    });
    it("affiche secondary= dans le log quand défini", () => {
      const log = formatCastContractLog({
        ...validContract,
        secondaryHeroCharacterId: "maya",
      });
      expect(log).toContain("secondary=maya");
    });
  });

  describe("orderedEditorHeroCharacterIds", () => {
    it("place le héros secondaire en deuxième position", () => {
      const ids = orderedEditorHeroCharacterIds({
        ...validContract,
        secondaryHeroCharacterId: "maya",
      });
      expect(ids).toEqual(["marius", "maya"]);
    });

    it("sans héros secondaire, conserve l’ordre des actifs", () => {
      const ids = orderedEditorHeroCharacterIds(validContract);
      expect(ids).toEqual(["marius", "maya"]);
    });
  });

  describe("P2.7 — Anti-régression : seul heroCharacterId devient protagonist", () => {
    it("focusCharacterIds ne deviennent PAS tous hero", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "marius",
        focusCharacterIds: ["marius", "maya", "carlos"],
        characters: [
          { id: "marius", name: "Marius", roleType: "main_hero" },
          { id: "maya", name: "Maya", roleType: "support" },
          { id: "carlos", name: "Carlos", roleType: "hero" }, // roleType hero mais pas heroCharacterId
        ],
      });

      // Seul marius (heroCharacterId) a le rôle hero
      expect(contract.members.find((m) => m.characterId === "marius")?.role).toBe("hero");

      // maya et carlos doivent être support, PAS hero
      expect(contract.members.find((m) => m.characterId === "maya")?.role).toBe("support");
      expect(contract.members.find((m) => m.characterId === "carlos")?.role).toBe("support");

      // Il ne doit y avoir qu'un seul hero
      const heroCount = contract.members.filter((m) => m.role === "hero").length;
      expect(heroCount).toBe(1);
    });

    it("un personnage avec roleType=hero qui n'est pas heroCharacterId devient support", () => {
      const contract = buildChapterCastContract({
        chapterId: "ch-1",
        heroCharacterId: "newguy",
        focusCharacterIds: ["newguy", "oldhero"],
        characters: [
          { id: "newguy", name: "New Guy", roleType: "npc" },
          { id: "oldhero", name: "Old Hero", roleType: "main_hero" },
        ],
      });

      // newguy est le héros officiel de CE chapitre
      expect(contract.members.find((m) => m.characterId === "newguy")?.role).toBe("hero");

      // oldhero a roleType=main_hero mais n'est pas heroCharacterId
      // Il doit être "support" dans CE chapitre, pas "hero"
      expect(contract.members.find((m) => m.characterId === "oldhero")?.role).toBe("support");
    });

    it("refuse un contrat où un non-héros a le rôle hero", () => {
      const badContract: ChapterCastContract = {
        chapterId: "ch-1",
        heroCharacterId: "marius",
        activeCharacterIds: ["marius", "maya"],
        supportCharacterIds: [],
        antagonistCharacterIds: [],
        npcGroups: [],
        members: [
          {
            characterId: "marius",
            name: "Marius",
            role: "hero",
            allowsCloseup: true,
            canSpeak: true,
            requiredInBeatIds: [],
            forbiddenInBeatIds: [],
          },
          {
            characterId: "maya",
            name: "Maya",
            role: "hero", // ERREUR : maya n'est pas heroCharacterId
            allowsCloseup: true,
            canSpeak: true,
            requiredInBeatIds: [],
            forbiddenInBeatIds: [],
          },
        ],
      };

      const result = validateChapterCastContract(badContract);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.NON_HERO_AS_PROTAGONIST),
      ).toBe(true);
    });

    it("refuse un contrat où heroCharacterId n'a pas le rôle hero", () => {
      const badContract: ChapterCastContract = {
        chapterId: "ch-1",
        heroCharacterId: "marius",
        activeCharacterIds: ["marius"],
        supportCharacterIds: [],
        antagonistCharacterIds: [],
        npcGroups: [],
        members: [
          {
            characterId: "marius",
            name: "Marius",
            role: "support", // ERREUR : le héros officiel n'a pas le rôle hero
            allowsCloseup: true,
            canSpeak: true,
            requiredInBeatIds: [],
            forbiddenInBeatIds: [],
          },
        ],
      };

      const result = validateChapterCastContract(badContract);
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.code === CAST_CONTRACT_ERROR_CODES.HERO_ROLE_MISMATCH),
      ).toBe(true);
    });
  });
});
