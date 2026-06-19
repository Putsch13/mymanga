import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateGeneratedPanel } from "./panel-validator";
import type { SceneBlueprint } from "@manga-ai-studio/world";

const analyzePanelWithVisionMock = vi.fn();

vi.mock("./services/panel-vision-analyzer", () => ({
  analyzePanelWithVision: (...args: unknown[]) => analyzePanelWithVisionMock(...args),
}));

describe("panel-validator QA critique", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
  });

  const requiredCharacters = [
    {
      characterId: "hero-1",
      characterName: "Aiko",
      fingerprint: {
        hair: { color: "silver" },
        face: { eyeColor: "blue" },
        identity: { gender: "female" },
        permanentMarkers: [],
        forbiddenDrift: [],
        defaultOutfit: [],
      } as never,
    },
  ];

  it("signale un avertissement si l'analyzer visuel est indisponible (non bloquant)", async () => {
    analyzePanelWithVisionMock.mockResolvedValue(null);

    const validation = await validateGeneratedPanel({
      panelId: "panel-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters,
      metadata: {
        prompt: "Aiko silver hair blue eyes closeup manga panel",
        panelContract: { shotType: "closeup", purpose: "reaction", mustShow: [], backgroundExtras: [] },
        panelQa: {
          panelCategory: "CHARACTER_LOCK",
          panelNumber: 1,
          pagePanelCount: 4,
          characterRoles: ["hero"],
          characterIds: ["hero-1"],
          explicitCriticality: { level: "CRITICAL", reasons: ["hero_closeup"] },
        },
      },
    });

    expect(validation.qaWasRequired).toBe(true);
    expect(validation.qaWasExecuted).toBe(false);
    expect(validation.qaFailureReason).toBe("visual_analyzer_unavailable_for_critical_panel");
    // Vision QA indisponible = avertissement uniquement, pas un reroll requis (ne doit pas bloquer le rendu)
    expect(validation.requiredReroll).toBe(false);
  });

  it("autorise explicitement un panel non critique sans analyzer", async () => {
    analyzePanelWithVisionMock.mockResolvedValue(null);

    const validation = await validateGeneratedPanel({
      panelId: "panel-2",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "city street medium shot manga panel",
        panelContract: { shotType: "medium", purpose: "dialogue", mustShow: [], backgroundExtras: [] },
        panelQa: {
          panelCategory: "CHARACTER_IN_SCENE",
          panelNumber: 1,
          pagePanelCount: 3,
          characterRoles: [],
          characterIds: [],
          explicitCriticality: { level: "NON_CRITICAL", reasons: [] },
        },
      },
    });

    expect(validation.qaWasRequired).toBe(false);
    expect(validation.qaWasExecuted).toBe(false);
    expect(validation.qaBypassReason).toBe("non_critical_panel");
  });
});

const blueprint: SceneBlueprint = {
  id: "panel-1",
  seed: 42,
  narrativeContext: {
    chapterGoal: "survivre",
    sceneSummary: "Luna fuit dans une ruelle néon sous la pluie.",
    scenePurpose: "installer le danger",
    panelIntent: "Luna glisse entre les enseignes et se plaque au mur.",
    panelNarration: null,
    pageRole: "setup",
    progressionBeat: "installer le danger -> esquive",
  },
  styleContext: {
    universe: "cyberpunk",
    tone: "tendu",
    visualStyle: "premium manga noir",
    renderFamily: "manga",
    cameraLanguage: "manga_dynamic",
    backgroundDensity: "high",
    noveltyLevel: 60,
    worldStrictness: 85,
    visualExoticism: 50,
    npcVariety: 55,
    environmentRichness: 85,
  },
  environment: {
    primaryLocation: "ruelle cyberpunk",
    secondaryLocationSignals: ["flaques lumineuses"],
    weather: "rain",
    timeOfDay: "night",
    atmosphereSignals: ["vapeur", "perspective néon"],
    foregroundElements: ["Luna"],
    midgroundElements: ["passant augmenté"],
    backgroundElements: ["enseignes verticales", "flaques lumineuses"],
    mustShowLocationSignals: ["ruelle cyberpunk", "enseignes verticales", "flaques lumineuses"],
    persistentSceneAnchors: ["ruelle cyberpunk", "enseignes verticales"],
    props: ["parapluie transparent"],
    traces: ["vapeur sortant des bouches d’aération"],
  },
  cast: {
    foregroundSubjects: ["Luna"],
    midgroundSubjects: ["passant augmenté"],
    backgroundSubjects: ["silhouettes en profondeur"],
    npcPresence: ["passant augmenté"],
    creaturePresence: [],
  },
  composition: {
    shotType: "wide",
    cameraAngle: "eye_level",
    framingRules: ["full environment visible"],
    interactionBeat: "oblige à se coller aux murs",
    spatialRelations: ["foreground: Luna", "midground: passant augmenté", "background: enseignes verticales"],
  },
  constraints: {
    hard: ["Respect universe: cyberpunk"],
    soft: ["Environment richness bounded at 85/100"],
    graph: { nodes: [], edges: [] },
    decision: { accepted: true, hardFailures: [], softWarnings: [], score: 1 },
  },
  procedural: {
    selectedNpcs: { primary: [], secondary: [], traces: [] },
    selectedLocations: { primary: [], secondary: [], traces: [] },
    selectedCreatures: { primary: [], secondary: [], traces: [] },
  },
  promptBridge: {
    actionLine: "Luna se plaque au mur.",
    sceneContextLine: "progression: danger",
    environmentLine: "location signals: ruelle cyberpunk, enseignes verticales",
    hardConstraintLine: "Respect universe: cyberpunk",
    softConstraintLine: "Environment richness bounded at 85/100",
  },
};

describe("panel validator premium scoring", () => {
  beforeEach(() => {
    process.env.ENABLE_PREMIUM_VISION_QA = "false";
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ENABLE_PREMIUM_VISION_QA;
  });

  it("flags weak environment on wide shots", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "close framing on Luna portrait, moody face, soft blur background",
        sceneBlueprint: blueprint,
        panelContract: {
          shotType: "wide",
          backgroundExtras: ["enseignes verticales", "flaques lumineuses"],
        },
        stylePack: {
          renderFamily: "manga",
          cameraLanguage: "manga_dynamic",
          backgroundDensity: "high",
        },
      },
    });

    expect(result.requiredReroll).toBe(true);
    expect(result.qualityScores?.backgroundPresenceScore).toBeLessThan(0.62);
    expect(result.issues.some((issue) => issue.type === "empty_background")).toBe(true);
  });

  it("keeps strong structured prompts above release threshold", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-2",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt:
          "wide shot, full environment visible, Luna in foreground, passant augmenté in midground, enseignes verticales and flaques lumineuses in background, character and environment both readable, spatial relation preserved, environment affects action, oblige à se coller aux murs, location signals: ruelle cyberpunk, enseignes verticales, flaques lumineuses, manga, manga_dynamic, high background density, medium line weight, ink_bw shading, dramatic contrast",
        sceneBlueprint: blueprint,
        panelContract: {
          shotType: "wide",
          backgroundExtras: ["enseignes verticales", "flaques lumineuses"],
        },
        stylePack: {
          renderFamily: "manga",
          lineWeight: "medium",
          shadingMode: "ink_bw",
          contrastProfile: "dramatic",
          cameraLanguage: "manga_dynamic",
          backgroundDensity: "high",
        },
      },
    });

    expect(result.requiredReroll).toBe(false);
    expect(result.qualityScores?.releaseScore).toBeGreaterThan(0.72);
  });

  it("merges vision QA when available", async () => {
    analyzePanelWithVisionMock.mockResolvedValue({
      characterConsistencyScore: 0.9,
      backgroundPresenceScore: 0.88,
      environmentReadabilityScore: 0.9,
      interactionScore: 0.81,
      shotComplianceScore: 0.92,
      styleConsistencyScore: 0.89,
      releaseScore: 0.9,
      confidence: 0.8,
      findings: ["decor riche et lisible", "interaction credible"],
      model: "mock-vision",
    });

    const result = await validateGeneratedPanel({
      panelId: "panel-vision",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt:
          "wide shot, full environment visible, Luna in foreground, passant augmenté in midground, enseignes verticales and flaques lumineuses in background, character and environment both readable, spatial relation preserved, environment affects action, oblige à se coller aux murs, location signals: ruelle cyberpunk, enseignes verticales, flaques lumineuses, manga, manga_dynamic, high background density, medium line weight, ink_bw shading, dramatic contrast",
        sceneBlueprint: blueprint,
        panelContract: {
          shotType: "wide",
          backgroundExtras: ["enseignes verticales", "flaques lumineuses"],
        },
        stylePack: {
          renderFamily: "manga",
          lineWeight: "medium",
          shadingMode: "ink_bw",
          contrastProfile: "dramatic",
          cameraLanguage: "manga_dynamic",
          backgroundDensity: "high",
        },
      },
    });

    expect(result.visionAnalysis?.enabled).toBe(true);
    expect(result.qualityScores?.visionScore).toBe(0.9);
    expect(result.qualityScores?.releaseScore).toBeGreaterThan(0.8);
    expect(result.visionAnalysis?.findings).toContain("decor riche et lisible");
  });
});

describe("panel-validator QA premium — propComplianceScore", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  it("détecte missing_prop si un prop obligatoire est absent du prompt", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-prop-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero standing in the dojo, medium shot",
        panelContract: {
          shotType: "medium",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          requiredPropsTyped: [
            { canonicalName: "katana", mustBeVisible: true, narrativeRole: "weapon", visibilityMode: "in_hand" },
          ],
        },
      },
    });

    const propIssue = result.issues.find((i) => i.type === "missing_prop" || i.type === "missing_weapon");
    expect(propIssue).toBeDefined();
    expect(result.qualityScores?.propComplianceScore).toBeDefined();
    expect(result.qualityScores!.propComplianceScore!).toBeLessThan(1.0);
  });

  it("ne génère pas missing_prop si le prop est présent dans le prompt", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-prop-2",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero holding katana in the dojo, medium shot, katana clearly visible",
        panelContract: {
          shotType: "medium",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          requiredPropsTyped: [
            { canonicalName: "katana", mustBeVisible: true, narrativeRole: "weapon", visibilityMode: "in_hand" },
          ],
        },
      },
    });

    const propIssue = result.issues.find((i) => i.type === "missing_prop" || i.type === "missing_weapon");
    expect(propIssue).toBeUndefined();
    expect(result.qualityScores?.propComplianceScore).toBe(1.0);
  });
});

describe("panel-validator QA premium — subjectFocusScore", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  it("détecte wrong_subject_focus si focus=enemy mais prompt centré sur héros", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-focus-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero portrait, hero face closeup, hero expression",
        panelContract: {
          shotType: "medium",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          subjectFocus: "enemy",
        },
      },
    });

    const focusIssue = result.issues.find((i) => i.type === "wrong_subject_focus");
    expect(focusIssue).toBeDefined();
    expect(result.qualityScores?.subjectFocusScore).toBeDefined();
    expect(result.qualityScores!.subjectFocusScore!).toBeLessThan(1.0);
  });
});

describe("panel-validator QA premium — enemyPresenceScore", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  it("détecte missing_enemy_presence si mustShowEnemy=true mais ennemi absent", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-enemy-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero standing alone in the dojo, medium shot",
        panelContract: {
          shotType: "medium",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          mustShowEnemy: true,
        },
      },
    });

    const enemyIssue = result.issues.find((i) => i.type === "missing_enemy_presence");
    expect(enemyIssue).toBeDefined();
    expect(result.qualityScores?.enemyPresenceScore).toBeDefined();
    expect(result.qualityScores!.enemyPresenceScore!).toBeLessThan(1.0);
  });
});

describe("panel-validator QA premium — cutawayComplianceScore", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  it("détecte cutaway_collapsed_to_hero si cutaway mais prompt est portrait héros", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-cutaway-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero portrait close-up face, hero face dominant",
        panelContract: {
          shotType: "closeup",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          cutawayType: "environment_establishing",
          heroCenterAllowed: false,
        },
      },
    });

    const cutawayIssue = result.issues.find((i) => i.type === "cutaway_collapsed_to_hero");
    expect(cutawayIssue).toBeDefined();
    expect(result.qualityScores?.cutawayComplianceScore).toBeDefined();
    expect(result.qualityScores!.cutawayComplianceScore!).toBeLessThan(0.5);
  });

  it("détecte wrong_cutaway_target si le sujet du cutaway est absent", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-cutaway-2",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero standing in a vague space, medium shot",
        panelContract: {
          shotType: "medium",
          purpose: "establishing",
          mustShow: [],
          backgroundExtras: [],
          cutawayType: "enemy_reveal",
          heroCenterAllowed: false,
        },
      },
    });

    const wrongTargetIssue = result.issues.find((i) => i.type === "wrong_cutaway_target");
    expect(wrongTargetIssue).toBeDefined();
    expect(result.qualityScores?.cutawayComplianceScore).toBeDefined();
    expect(result.qualityScores!.cutawayComplianceScore!).toBeLessThan(0.5);
  });

  it("ne génère pas d'issue cutaway si le cutaway est respecté", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-cutaway-3",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "environment establishing shot, landscape visible, location readable, exterior building",
        panelContract: {
          shotType: "wide",
          purpose: "establishing",
          mustShow: [],
          backgroundExtras: [],
          cutawayType: "environment_establishing",
          heroCenterAllowed: false,
        },
      },
    });

    const cutawayIssue = result.issues.find((i) =>
      i.type === "cutaway_collapsed_to_hero" || i.type === "wrong_cutaway_target"
    );
    expect(cutawayIssue).toBeUndefined();
    expect(result.qualityScores?.cutawayComplianceScore).toBe(1.0);
  });
});

describe("panel-validator QA premium — populationScore", () => {
  beforeEach(() => {
    analyzePanelWithVisionMock.mockReset();
    analyzePanelWithVisionMock.mockResolvedValue(null);
  });

  it("détecte npc_population_missing si requiredNpcCount > 0 mais foule absente", async () => {
    const result = await validateGeneratedPanel({
      panelId: "panel-npc-1",
      imageUrl: "https://example.com/panel.png",
      requiredCharacters: [],
      metadata: {
        prompt: "hero standing alone in the market, medium shot",
        panelContract: {
          shotType: "medium",
          purpose: "action",
          mustShow: [],
          backgroundExtras: [],
          requiredNpcCount: 3,
        },
      },
    });

    const npcIssue = result.issues.find((i) => i.type === "npc_population_missing");
    expect(npcIssue).toBeDefined();
    expect(result.qualityScores?.populationScore).toBeDefined();
    expect(result.qualityScores!.populationScore!).toBeLessThan(1.0);
  });
});
