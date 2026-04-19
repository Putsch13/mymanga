import { describe, expect, it } from "vitest";
import {
  buildPanelGenerationIntent,
  planChapterGenerationIntents,
  type PanelPlanInput,
  type CharacterCastInfo,
} from "./generation-intent-planner";

function makePanelInput(overrides: Partial<PanelPlanInput> = {}): PanelPlanInput {
  return {
    panelId: "panel-1",
    panelNumber: 1,
    pageNumber: 1,
    beatId: "beat-1",
    beatType: "action",
    subjectFocus: null,
    cutawayType: null,
    shotType: "medium",
    cameraAngle: null,
    purpose: null,
    caption: "A test panel",
    characterIds: [],
    requiredProps: [],
    mustShowLocationSignals: [],
    heroCenterAllowed: false,
    speakerAnchorCharacterId: null,
    npcGroupPresence: [],
    creaturePresence: [],
    ...overrides,
  };
}

function makeCastMap(entries: Array<[string, Partial<CharacterCastInfo>]>): Map<string, CharacterCastInfo> {
  const map = new Map<string, CharacterCastInfo>();
  for (const [id, info] of entries) {
    map.set(id, {
      characterId: id,
      name: info.name ?? `Character ${id}`,
      role: info.role ?? "extra",
      importanceTier: info.importanceTier ?? "BACKGROUND_EXTRA",
      isHero: info.isHero ?? false,
    });
  }
  return map;
}

describe("P1.1 — generation-intent-planner", () => {
  describe("resolves intentType correctly", () => {
    it("detects environment_establishing from cutawayType", () => {
      const panel = makePanelInput({ cutawayType: "environment_establishing" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.intentType).toBe("environment_establishing");
      expect(intent.dominantSubject).toBe("environment");
    });

    it("detects prop_insert from cutawayType", () => {
      const panel = makePanelInput({ cutawayType: "prop_insert" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.intentType).toBe("prop_insert");
      expect(intent.dominantSubject).toBe("prop");
    });

    it("detects guard_presence from npc_group cutaway", () => {
      const panel = makePanelInput({ cutawayType: "npc_group" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.intentType).toBe("guard_presence");
      expect(intent.dominantSubject).toBe("guard_group");
    });

    it("detects crowd_cutaway from crowd cutawayType", () => {
      const panel = makePanelInput({ cutawayType: "crowd" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.intentType).toBe("crowd_cutaway");
      expect(intent.dominantSubject).toBe("crowd");
    });

    it("detects hero_portrait from hero focus + closeup", () => {
      const panel = makePanelInput({
        subjectFocus: "hero",
        shotType: "closeup",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.intentType).toBe("hero_portrait");
      expect(intent.dominantSubject).toBe("hero");
    });

    it("detects hero_duo from hero + one other character", () => {
      const panel = makePanelInput({
        characterIds: ["hero-1", "ally-1"],
        shotType: "medium",
      });
      const castMap = makeCastMap([
        ["hero-1", { name: "Lyra", role: "protagonist", isHero: true }],
        ["ally-1", { name: "Kael", role: "ally" }],
      ]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.intentType).toBe("hero_duo");
      expect(intent.dominantSubject).toBe("duo");
    });

    it("detects enemy_focus from enemy subjectFocus", () => {
      const panel = makePanelInput({
        subjectFocus: "enemy",
        shotType: "closeup",
        characterIds: ["enemy-1"],
      });
      const castMap = makeCastMap([["enemy-1", { name: "Vex", role: "antagonist" }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.intentType).toBe("enemy_focus");
      expect(intent.dominantSubject).toBe("enemy");
    });

    it("detects reaction_cutaway from reaction cutaway", () => {
      const panel = makePanelInput({
        cutawayType: "reaction",
        heroCenterAllowed: false,
      });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.intentType).toBe("reaction_cutaway");
      expect(intent.dominantSubject).toBe("npc");
    });
  });

  describe("sets forbidden framing and tokens correctly", () => {
    it("forbids portrait/closeup framing on environment panels", () => {
      const panel = makePanelInput({ cutawayType: "environment_establishing" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.forbiddenFraming).toContain("portrait");
      expect(intent.forbiddenFraming).toContain("closeup");
    });

    it("forbids hero tokens on guard_presence panels", () => {
      const panel = makePanelInput({ cutawayType: "npc_group" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.forbiddenPromptTokens).toContain("hero panel");
      expect(intent.forbiddenPromptTokens).toContain("protagonist centered");
    });

    it("allows hero tokens on hero_portrait panels", () => {
      const panel = makePanelInput({
        subjectFocus: "hero",
        shotType: "closeup",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.forbiddenPromptTokens).not.toContain("hero panel");
    });
  });

  describe("builds visual hierarchy correctly", () => {
    it("puts environment in foreground for establishing panels", () => {
      const panel = makePanelInput({ cutawayType: "environment_establishing" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.visualHierarchy.foreground).toContain("architectural elements");
    });

    it("relegates hero to background on guard panels", () => {
      const panel = makePanelInput({
        cutawayType: "npc_group",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.visualHierarchy.background.some((s) => s.includes("silhouette"))).toBe(true);
    });
  });

  describe("sets reference policy correctly", () => {
    it("uses STRONG for hero_portrait", () => {
      const panel = makePanelInput({
        subjectFocus: "hero",
        shotType: "closeup",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.allowedReferencePolicy).toBe("STRONG");
    });

    it("uses NONE for environment_establishing", () => {
      const panel = makePanelInput({ cutawayType: "environment_establishing" });
      const intent = buildPanelGenerationIntent(panel, null, new Map(), new Map());
      expect(intent.allowedReferencePolicy).toBe("NONE");
    });

    it("uses LIGHT for duo panels", () => {
      const panel = makePanelInput({
        characterIds: ["hero-1", "ally-1"],
      });
      const castMap = makeCastMap([
        ["hero-1", { name: "Lyra", role: "protagonist", isHero: true }],
        ["ally-1", { name: "Kael", role: "ally" }],
      ]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      expect(intent.allowedReferencePolicy).toBe("LIGHT");
    });
  });

  describe("builds suppressed entities for cutaways", () => {
    it("suppresses hero on environment panels with hero present", () => {
      const panel = makePanelInput({
        cutawayType: "environment_establishing",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      const heroSuppressed = intent.suppressedEntities.find((e) => e.label === "hero");
      expect(heroSuppressed).toBeDefined();
      expect(heroSuppressed?.reason).toContain("cutaway");
    });

    it("does not suppress hero on hero_portrait", () => {
      const panel = makePanelInput({
        subjectFocus: "hero",
        shotType: "closeup",
        characterIds: ["hero-1"],
      });
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);
      const intent = buildPanelGenerationIntent(panel, "hero-1", castMap, new Map());
      const heroSuppressed = intent.suppressedEntities.find((e) => e.label === "hero");
      expect(heroSuppressed).toBeUndefined();
    });
  });

  describe("planChapterGenerationIntents", () => {
    it("plans all panels in a chapter", () => {
      const panels = [
        makePanelInput({ panelId: "p1", cutawayType: "environment_establishing" }),
        makePanelInput({
          panelId: "p2",
          subjectFocus: "hero",
          characterIds: ["hero-1"],
          shotType: "closeup",
          beatType: "dialogue",
        }),
        makePanelInput({ panelId: "p3", cutawayType: "npc_group" }),
      ];
      const castMap = makeCastMap([["hero-1", { name: "Lyra", role: "protagonist", isHero: true }]]);

      const intents = planChapterGenerationIntents({
        chapterId: "ch-1",
        panels,
        castByCharacterId: castMap,
        heroCharacterId: "hero-1",
        locationCanon: new Map(),
        narrativeFacts: [],
      });

      expect(intents).toHaveLength(3);
      expect(intents[0]!.intentType).toBe("environment_establishing");
      expect(intents[1]!.intentType).toBe("hero_portrait");
      expect(intents[2]!.intentType).toBe("guard_presence");
    });
  });
});
