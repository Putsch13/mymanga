import { describe, expect, it } from "vitest";
import {
  buildPromptRecipe,
  validatePromptRecipe,
  getRecipeDebugInfo,
} from "./prompt-recipe-builder";
import type { PanelGenerationIntent } from "./generation-intent-planner";

function makeIntent(overrides: Partial<PanelGenerationIntent> = {}): PanelGenerationIntent {
  return {
    panelId: "panel-1",
    panelNumber: 1,
    pageNumber: 1,
    beatId: "beat-1",
    intentType: "hero_portrait",
    beatType: "dialogue",
    panelFunction: "hero_portrait",
    dominantSubject: "hero",
    secondarySubjects: [],
    cutawayType: null,
    cameraIntent: "closeup",
    compositionIntent: "closeup shot focused on hero",
    shotType: "closeup",
    cameraAngle: null,
    environmentPriority: 25,
    characterPriority: 90,
    propPriority: 30,
    crowdPriority: 15,
    requiredVisibleEntities: [],
    requiredVisibleProps: [],
    requiredLocationSignals: [],
    suppressedEntities: [],
    suppressedPromptClauses: [],
    allowedReferencePolicy: "STRONG",
    requiredReferenceSet: {
      characterRefs: true,
      sceneRefs: false,
      styleRefs: true,
      environmentRefs: false,
    },
    forbiddenFraming: [],
    forbiddenPromptTokens: [],
    visualHierarchy: {
      foreground: ["protagonist centered and readable"],
      midground: ["supporting environment"],
      background: ["setting details"],
    },
    reason: "intentType=hero_portrait dominant=hero shotType=closeup",
    ...overrides,
  };
}

describe("P1.3 — prompt-recipe-builder", () => {
  describe("buildPromptRecipe", () => {
    it("builds recipe for hero_portrait with subject_lock included", () => {
      const intent = makeIntent({ intentType: "hero_portrait", dominantSubject: "hero" });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.intentType).toBe("hero_portrait");
      expect(recipe.dominantSubject).toBe("hero");
      expect(recipe.includeBlocks.some((b) => b.blockType === "subject_lock")).toBe(true);
      expect(recipe.excludeBlocks.some((b) => b.blockType === "subject_lock")).toBe(false);
    });

    it("builds recipe for environment_establishing without subject_lock", () => {
      const intent = makeIntent({
        intentType: "environment_establishing",
        dominantSubject: "environment",
        cameraIntent: "establishing",
      });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.intentType).toBe("environment_establishing");
      expect(recipe.excludeBlocks.some((b) => b.blockType === "subject_lock")).toBe(true);
      expect(recipe.excludeBlocks.some((b) => b.blockType === "character_description")).toBe(true);
      expect(recipe.negativeTokens).toContain("hero panel");
      expect(recipe.framingTokens).toContain("establishing shot");
    });

    it("builds recipe for guard_presence with crowd_instruction critical", () => {
      const intent = makeIntent({
        intentType: "guard_presence",
        dominantSubject: "guard_group",
        cameraIntent: "medium",
      });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.intentType).toBe("guard_presence");
      const crowdBlock = recipe.includeBlocks.find((b) => b.blockType === "crowd_instruction");
      expect(crowdBlock).toBeDefined();
      expect(crowdBlock?.priority).toBe("critical");
      expect(recipe.excludeBlocks.some((b) => b.blockType === "subject_lock")).toBe(true);
    });

    it("builds recipe for prop_insert with props_description critical", () => {
      const intent = makeIntent({
        intentType: "prop_insert",
        dominantSubject: "prop",
        cameraIntent: "insert",
      });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.intentType).toBe("prop_insert");
      const propsBlock = recipe.includeBlocks.find((b) => b.blockType === "props_description");
      expect(propsBlock).toBeDefined();
      expect(propsBlock?.priority).toBe("critical");
      expect(recipe.excludeBlocks.some((b) => b.blockType === "character_description")).toBe(true);
    });

    it("includes framing tokens from cameraIntent", () => {
      const intent = makeIntent({
        intentType: "hero_portrait",
        cameraIntent: "closeup",
      });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.framingTokens).toContain("close-up");
      expect(recipe.framingTokens).toContain("tight framing");
    });

    it("merges forbidden tokens from intent into negativeTokens", () => {
      const intent = makeIntent({
        intentType: "guard_presence",
        dominantSubject: "guard_group",
        forbiddenPromptTokens: ["custom forbidden token"],
      });
      const recipe = buildPromptRecipe(intent);

      expect(recipe.negativeTokens).toContain("custom forbidden token");
      expect(recipe.negativeTokens).toContain("hero panel");
    });

    it("adds composition override from visual hierarchy foreground", () => {
      const intent = makeIntent({
        visualHierarchy: {
          foreground: ["guards in formation", "weapons visible"],
          midground: [],
          background: [],
        },
      });
      const recipe = buildPromptRecipe(intent);

      const compositionOverride = recipe.blockOverrides.find(
        (o) => o.blockType === "composition_guide" && o.action === "prepend"
      );
      expect(compositionOverride).toBeDefined();
      expect(compositionOverride?.value).toContain("guards in formation");
    });

    it("adds character suppression override when hero is silhouette in background", () => {
      const intent = makeIntent({
        intentType: "guard_presence",
        dominantSubject: "guard_group",
        visualHierarchy: {
          foreground: ["guards as primary subjects"],
          midground: [],
          background: ["hero as small silhouette only"],
        },
      });
      const recipe = buildPromptRecipe(intent);

      const charOverride = recipe.blockOverrides.find(
        (o) => o.blockType === "character_description" && o.action === "suppress_keywords"
      );
      expect(charOverride).toBeDefined();
      expect(charOverride?.value).toContain("detailed face");
    });
  });

  describe("validatePromptRecipe", () => {
    it("validates a correct hero_portrait recipe", () => {
      const intent = makeIntent({ intentType: "hero_portrait", dominantSubject: "hero" });
      const recipe = buildPromptRecipe(intent);
      const result = validatePromptRecipe(recipe);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates a correct environment_establishing recipe", () => {
      const intent = makeIntent({
        intentType: "environment_establishing",
        dominantSubject: "environment",
      });
      const recipe = buildPromptRecipe(intent);
      const result = validatePromptRecipe(recipe);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects include/exclude conflict", () => {
      const intent = makeIntent({ intentType: "hero_portrait" });
      const recipe = buildPromptRecipe(intent);
      recipe.excludeBlocks.push({ blockType: "subject_lock", reason: "test conflict" });

      const result = validatePromptRecipe(recipe);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("both included and excluded"))).toBe(true);
    });

    it("warns about out-of-range weights", () => {
      const intent = makeIntent({ intentType: "hero_portrait" });
      const recipe = buildPromptRecipe(intent);
      recipe.elementWeights.character = 150;

      const result = validatePromptRecipe(recipe);

      expect(result.warnings.some((w) => w.includes("out of range"))).toBe(true);
    });

    it("warns when non-hero panel has subject_lock without exclusion", () => {
      const intent = makeIntent({
        intentType: "environment_establishing",
        dominantSubject: "environment",
      });
      const recipe = buildPromptRecipe(intent);
      recipe.includeBlocks.push({ blockType: "subject_lock", priority: "critical" });
      recipe.excludeBlocks = [];

      const result = validatePromptRecipe(recipe);

      expect(result.warnings.some((w) => w.includes("Non-hero panel"))).toBe(true);
    });
  });

  describe("getRecipeDebugInfo", () => {
    it("returns human-readable debug info", () => {
      const intent = makeIntent({ intentType: "hero_action", dominantSubject: "hero" });
      const recipe = buildPromptRecipe(intent);
      const debug = getRecipeDebugInfo(recipe);

      expect(debug).toContain("hero_action");
      expect(debug).toContain("dominant: hero");
      expect(debug).toContain("Include:");
      expect(debug).toContain("Exclude:");
      expect(debug).toContain("Framing:");
      expect(debug).toContain("Weights:");
    });
  });

  describe("element weights are appropriate for intent type", () => {
    it("hero_portrait has high character weight", () => {
      const intent = makeIntent({ intentType: "hero_portrait" });
      const recipe = buildPromptRecipe(intent);
      expect(recipe.elementWeights.character).toBeGreaterThan(80);
    });

    it("environment_establishing has high environment weight", () => {
      const intent = makeIntent({ intentType: "environment_establishing", dominantSubject: "environment" });
      const recipe = buildPromptRecipe(intent);
      expect(recipe.elementWeights.environment).toBeGreaterThan(80);
    });

    it("prop_insert has high prop weight", () => {
      const intent = makeIntent({ intentType: "prop_insert", dominantSubject: "prop" });
      const recipe = buildPromptRecipe(intent);
      expect(recipe.elementWeights.prop).toBeGreaterThan(80);
    });

    it("guard_presence has high crowd weight", () => {
      const intent = makeIntent({ intentType: "guard_presence", dominantSubject: "guard_group" });
      const recipe = buildPromptRecipe(intent);
      expect(recipe.elementWeights.crowd).toBeGreaterThan(80);
    });
  });
});
