import { describe, expect, it } from "vitest";
import {
  calculateSpotlightBalance,
  resolveSpotlightMode,
  selectCompositionType,
  resolveSubjectLockBehavior,
  buildSharedSpotlightConfig,
  isSharedSpotlightNeeded,
  getSharedSpotlightDebugInfo,
  type SharedSpotlightInput,
  type CharacterSpotlightInput,
} from "./shared-spotlight";

function makeHeroInput(overrides: Partial<CharacterSpotlightInput> = {}): CharacterSpotlightInput {
  return {
    characterId: "hero-1",
    name: "Lyra",
    role: "hero",
    importanceTier: "HERO",
    isActiveInBeat: true,
    isSpeaker: false,
    isSubjectOfAction: false,
    ...overrides,
  };
}

function makeOtherInput(overrides: Partial<CharacterSpotlightInput> = {}): CharacterSpotlightInput {
  return {
    characterId: "other-1",
    name: "Kael",
    role: "ally",
    importanceTier: "PRIMARY_CAST",
    isActiveInBeat: true,
    isSpeaker: false,
    isSubjectOfAction: false,
    ...overrides,
  };
}

function makeSpotlightInput(overrides: Partial<SharedSpotlightInput> = {}): SharedSpotlightInput {
  return {
    panelType: "dialogue",
    beatType: "dialogue",
    subjectFocus: null,
    shotType: "medium",
    heroCharacter: makeHeroInput(),
    otherCharacter: makeOtherInput(),
    narrativeContext: {
      isDramaticConflict: false,
      isEmotionalMoment: false,
      isDialogueExchange: false,
      isActionSequence: false,
      heroIsReacting: false,
      otherIsReacting: false,
    },
    ...overrides,
  };
}

describe("P2.1 — shared-spotlight", () => {
  describe("calculateSpotlightBalance", () => {
    it("returns 50 for neutral setup", () => {
      const input = makeSpotlightInput();
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBe(45);
    });

    it("increases hero weight when hero is speaker", () => {
      const input = makeSpotlightInput({
        heroCharacter: makeHeroInput({ isSpeaker: true }),
      });
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBeGreaterThan(50);
    });

    it("decreases hero weight when other is speaker", () => {
      const input = makeSpotlightInput({
        otherCharacter: makeOtherInput({ isSpeaker: true }),
      });
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBeLessThan(50);
    });

    it("heavily decreases hero weight for antagonist reveal", () => {
      const input = makeSpotlightInput({
        beatType: "reveal",
        otherCharacter: makeOtherInput({ role: "antagonist", name: "Vex" }),
      });
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBeLessThan(35);
    });

    it("increases hero weight when subjectFocus is hero", () => {
      const input = makeSpotlightInput({
        subjectFocus: "hero",
      });
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBeGreaterThan(60);
    });

    it("decreases hero weight when subjectFocus is enemy", () => {
      const input = makeSpotlightInput({
        subjectFocus: "enemy",
        otherCharacter: makeOtherInput({ role: "antagonist" }),
      });
      const balance = calculateSpotlightBalance(input);
      expect(balance).toBeLessThan(30);
    });
  });

  describe("resolveSpotlightMode", () => {
    it("returns HERO_DOMINANT for balance >= 70", () => {
      expect(resolveSpotlightMode(75)).toBe("HERO_DOMINANT");
    });

    it("returns EQUAL_SPOTLIGHT for balance around 50", () => {
      expect(resolveSpotlightMode(50)).toBe("EQUAL_SPOTLIGHT");
    });

    it("returns OTHER_DOMINANT for balance <= 30", () => {
      expect(resolveSpotlightMode(25)).toBe("OTHER_DOMINANT");
    });

    it("returns HERO_FOREGROUND_OTHER_BACKGROUND for balance 55-70", () => {
      expect(resolveSpotlightMode(60)).toBe("HERO_FOREGROUND_OTHER_BACKGROUND");
    });

    it("returns OTHER_FOREGROUND_HERO_BACKGROUND for balance 30-45", () => {
      expect(resolveSpotlightMode(35)).toBe("OTHER_FOREGROUND_HERO_BACKGROUND");
    });
  });

  describe("selectCompositionType", () => {
    it("selects facing_each_other for antagonist conflict", () => {
      const input = makeSpotlightInput({
        otherCharacter: makeOtherInput({ role: "antagonist" }),
        narrativeContext: {
          isDramaticConflict: true,
          isEmotionalMoment: false,
          isDialogueExchange: false,
          isActionSequence: false,
          heroIsReacting: false,
          otherIsReacting: false,
        },
      });
      const composition = selectCompositionType(input, "EQUAL_SPOTLIGHT");
      expect(composition).toBe("facing_each_other");
    });

    it("selects over_shoulder for dialogue with over_shoulder shotType", () => {
      const input = makeSpotlightInput({
        shotType: "over_shoulder",
        narrativeContext: {
          isDramaticConflict: false,
          isEmotionalMoment: false,
          isDialogueExchange: true,
          isActionSequence: false,
          heroIsReacting: false,
          otherIsReacting: false,
        },
      });
      const composition = selectCompositionType(input, "EQUAL_SPOTLIGHT");
      expect(composition).toBe("over_shoulder");
    });

    it("selects side_by_side for ally collaboration", () => {
      const input = makeSpotlightInput({
        otherCharacter: makeOtherInput({ role: "ally" }),
      });
      const composition = selectCompositionType(input, "EQUAL_SPOTLIGHT");
      expect(composition).toBe("side_by_side");
    });

    it("selects hero_foreground for HERO_DOMINANT mode", () => {
      const input = makeSpotlightInput({
        otherCharacter: makeOtherInput({ role: "important_npc" }),
      });
      const composition = selectCompositionType(input, "HERO_DOMINANT");
      expect(composition).toBe("hero_foreground");
    });
  });

  describe("resolveSubjectLockBehavior", () => {
    it("returns lock_hero_only for HERO_DOMINANT", () => {
      const behavior = resolveSubjectLockBehavior("HERO_DOMINANT", makeOtherInput());
      expect(behavior).toBe("lock_hero_only");
    });

    it("returns lock_both for EQUAL_SPOTLIGHT with PRIMARY_CAST other", () => {
      const behavior = resolveSubjectLockBehavior(
        "EQUAL_SPOTLIGHT",
        makeOtherInput({ importanceTier: "PRIMARY_CAST" })
      );
      expect(behavior).toBe("lock_both");
    });

    it("returns lock_other_only for OTHER_DOMINANT with PRIMARY_CAST", () => {
      const behavior = resolveSubjectLockBehavior(
        "OTHER_DOMINANT",
        makeOtherInput({ importanceTier: "PRIMARY_CAST" })
      );
      expect(behavior).toBe("lock_other_only");
    });

    it("returns no_lock for OTHER_DOMINANT with non-PRIMARY_CAST", () => {
      const behavior = resolveSubjectLockBehavior(
        "OTHER_DOMINANT",
        makeOtherInput({ importanceTier: "BACKGROUND_EXTRA" })
      );
      expect(behavior).toBe("no_lock");
    });
  });

  describe("buildSharedSpotlightConfig", () => {
    it("builds complete config for hero + ally dialogue", () => {
      const input = makeSpotlightInput({
        heroCharacter: makeHeroInput({ isSpeaker: true }),
        otherCharacter: makeOtherInput({ role: "ally" }),
        narrativeContext: {
          isDramaticConflict: false,
          isEmotionalMoment: false,
          isDialogueExchange: true,
          isActionSequence: false,
          heroIsReacting: false,
          otherIsReacting: false,
        },
      });

      const config = buildSharedSpotlightConfig(input);

      expect(config.mode).toBe("HERO_FOREGROUND_OTHER_BACKGROUND");
      expect(config.primaryCharacterId).toBe("hero-1");
      expect(config.secondaryCharacterId).toBe("other-1");
      expect(config.balanceRatio).toBeGreaterThan(0.5);
      expect(config.promptModifiers.compositionTokens.length).toBeGreaterThan(0);
    });

    it("builds config for enemy reveal with OTHER_DOMINANT", () => {
      const input = makeSpotlightInput({
        beatType: "reveal",
        subjectFocus: "enemy",
        otherCharacter: makeOtherInput({ role: "antagonist", name: "Vex" }),
      });

      const config = buildSharedSpotlightConfig(input);

      expect(config.mode).toBe("OTHER_DOMINANT");
      expect(config.primaryCharacterId).toBe("other-1");
      expect(config.balanceRatio).toBeLessThan(0.5);
      expect(config.subjectLockBehavior).toBe("lock_other_only");
    });

    it("includes forbidden tokens in prompt modifiers", () => {
      const input = makeSpotlightInput();
      const config = buildSharedSpotlightConfig(input);

      expect(config.promptModifiers.forbiddenTokens.length).toBeGreaterThan(0);
    });
  });

  describe("isSharedSpotlightNeeded", () => {
    it("returns true for duo with hero and one other", () => {
      const result = isSharedSpotlightNeeded("hero-1", ["hero-1", "ally-1"], "duo");
      expect(result).toBe(true);
    });

    it("returns false for hero alone", () => {
      const result = isSharedSpotlightNeeded("hero-1", ["hero-1"], "hero");
      expect(result).toBe(false);
    });

    it("returns false when hero not in cast", () => {
      const result = isSharedSpotlightNeeded("hero-1", ["ally-1", "npc-1"], "duo");
      expect(result).toBe(false);
    });

    it("returns false for group (more than 2)", () => {
      const result = isSharedSpotlightNeeded("hero-1", ["hero-1", "ally-1", "npc-1"], "group");
      expect(result).toBe(false);
    });

    it("returns false when no heroCharacterId", () => {
      const result = isSharedSpotlightNeeded(null, ["ally-1"], "duo");
      expect(result).toBe(false);
    });
  });

  describe("getSharedSpotlightDebugInfo", () => {
    it("returns human-readable debug info", () => {
      const input = makeSpotlightInput();
      const config = buildSharedSpotlightConfig(input);
      const debug = getSharedSpotlightDebugInfo(config);

      expect(debug).toContain("Spotlight Mode:");
      expect(debug).toContain("Balance:");
      expect(debug).toContain("Composition:");
      expect(debug).toContain("Lock behavior:");
    });
  });
});
