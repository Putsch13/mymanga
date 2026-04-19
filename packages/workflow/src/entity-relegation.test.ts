import { describe, expect, it } from "vitest";
import {
  buildRelegationConfig,
  isHeroRelegated,
  getHeroRelegationTokens,
  getAllRelegationPromptTokens,
  getAllRelegationNegativeTokens,
  type RelegationInput,
} from "./entity-relegation";

function makeInput(overrides: Partial<RelegationInput> = {}): RelegationInput {
  return {
    dominantSubjectKind: "hero",
    heroCharacterId: "hero-1",
    heroCharacterName: "Lyra",
    presentCharacters: [
      { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: true },
    ],
    cutawayType: null,
    subjectFocus: null,
    ...overrides,
  };
}

describe("P3.2 — entity-relegation", () => {
  describe("buildRelegationConfig", () => {
    it("does not relegate hero on hero panel", () => {
      const input = makeInput({
        dominantSubjectKind: "hero",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: true },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("NONE");
      expect(config.relegatedEntities).toHaveLength(0);
    });

    it("relegates hero to SILHOUETTE on environment panel", () => {
      const input = makeInput({
        dominantSubjectKind: "environment",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("SILHOUETTE");
      expect(config.relegatedEntities).toHaveLength(1);
      expect(config.relegatedEntities[0]!.relegationMode).toBe("SILHOUETTE");
      expect(config.relegatedEntities[0]!.promptTokens.some((t) => t.includes("silhouette"))).toBe(true);
    });

    it("fully hides hero on prop panel", () => {
      const input = makeInput({
        dominantSubjectKind: "prop",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("FULLY_HIDDEN");
    });

    it("relegates hero to SILHOUETTE on guard_group panel", () => {
      const input = makeInput({
        dominantSubjectKind: "guard_group",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("SILHOUETTE");
      expect(config.forbiddenCompositionTokens).toContain("hero centered");
    });

    it("relegates hero to SILHOUETTE on crowd panel", () => {
      const input = makeInput({
        dominantSubjectKind: "crowd",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("SILHOUETTE");
    });

    it("relegates hero to BACKGROUND_BLUR on enemy panel", () => {
      const input = makeInput({
        dominantSubjectKind: "enemy",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
          { characterId: "enemy-1", name: "Vex", role: "antagonist", isHero: false, isDominant: true },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("BACKGROUND_BLUR");
      const heroEntity = config.relegatedEntities.find((e) => e.characterId === "hero-1");
      expect(heroEntity?.relegationMode).toBe("BACKGROUND_BLUR");
    });

    it("does not relegate dominant non-hero", () => {
      const input = makeInput({
        dominantSubjectKind: "enemy",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
          { characterId: "enemy-1", name: "Vex", role: "antagonist", isHero: false, isDominant: true },
        ],
      });
      const config = buildRelegationConfig(input);

      const enemyEntity = config.relegatedEntities.find((e) => e.characterId === "enemy-1");
      expect(enemyEntity).toBeUndefined();
    });

    it("relegates non-dominant non-hero on hero panel", () => {
      const input = makeInput({
        dominantSubjectKind: "hero",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: true },
          { characterId: "ally-1", name: "Kael", role: "ally", isHero: false, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.heroVisibilityMode).toBe("NONE");
      const allyEntity = config.relegatedEntities.find((e) => e.characterId === "ally-1");
      expect(allyEntity?.relegationMode).toBe("BACKGROUND_BLUR");
    });

    it("adds composition tokens for environment panels", () => {
      const input = makeInput({
        dominantSubjectKind: "environment",
        presentCharacters: [],
      });
      const config = buildRelegationConfig(input);

      expect(config.compositionTokens.some((t) => t.includes("environment"))).toBe(true);
    });

    it("adds forbidden tokens when hero is relegated", () => {
      const input = makeInput({
        dominantSubjectKind: "guard_group",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(config.forbiddenCompositionTokens).toContain("hero centered");
      expect(config.forbiddenCompositionTokens).toContain("protagonist foreground");
    });
  });

  describe("helper functions", () => {
    it("isHeroRelegated returns true when hero is relegated", () => {
      const input = makeInput({
        dominantSubjectKind: "environment",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(isHeroRelegated(config)).toBe(true);
    });

    it("isHeroRelegated returns false when hero is dominant", () => {
      const input = makeInput({
        dominantSubjectKind: "hero",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: true },
        ],
      });
      const config = buildRelegationConfig(input);

      expect(isHeroRelegated(config)).toBe(false);
    });

    it("getHeroRelegationTokens returns tokens for relegated hero", () => {
      const input = makeInput({
        dominantSubjectKind: "environment",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);
      const tokens = getHeroRelegationTokens(config);

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.includes("Lyra"))).toBe(true);
    });

    it("getAllRelegationPromptTokens aggregates all prompt tokens", () => {
      const input = makeInput({
        dominantSubjectKind: "guard_group",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
          { characterId: "ally-1", name: "Kael", role: "ally", isHero: false, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);
      const tokens = getAllRelegationPromptTokens(config);

      expect(tokens.some((t) => t.includes("Lyra"))).toBe(true);
      expect(tokens.some((t) => t.includes("Kael"))).toBe(true);
    });

    it("getAllRelegationNegativeTokens includes forbidden tokens", () => {
      const input = makeInput({
        dominantSubjectKind: "guard_group",
        presentCharacters: [
          { characterId: "hero-1", name: "Lyra", role: "hero", isHero: true, isDominant: false },
        ],
      });
      const config = buildRelegationConfig(input);
      const negativeTokens = getAllRelegationNegativeTokens(config);

      expect(negativeTokens).toContain("hero centered");
    });
  });
});
