/**
 * Tests d'intégration Sprint A — chaîne complète canonical-recipe → flatten → FAL.
 *
 * Sécurise : pour chaque grand type d'intent (hero_focus, environment_establishing,
 * prop_insert, hero_duo, crowd_presence), le prompt finalement envoyé à FAL
 *   - commence par "manga panel"
 *   - contient le sujet visuel principal attendu
 *   - ne contient pas de [TAG] ni de métadonnée de classification
 *   - reste dans les bornes de longueur
 */

import { describe, expect, it } from "vitest";
import type {
  CanonicalPromptRecipeInput,
  CanonicalPromptRecipeOutput,
} from "../services/canonical-prompt-recipe-builder";
import { buildCanonicalPromptRecipe } from "../services/canonical-prompt-recipe-builder";
import { auditFalPrompt, flattenSectionsForFal } from "./fal-prompt-flattener";

function baseInput(overrides: Partial<CanonicalPromptRecipeInput> = {}): CanonicalPromptRecipeInput {
  return {
    imageIntentType: "hero_focus",
    contentRating: "teen",
    visualClassification: {
      rating: "teen",
      audience: "teen",
      violenceLevel: "mild",
      sensualityLevel: "none",
      allowedTokens: [],
      forbiddenTokens: [],
    },
    mangaStyle: {
      styleId: "s1",
      styleName: "shonen adventure",
      medium: "manga",
      inkingStyle: "clean bold lines",
      shadingStyle: "screentones and ink",
      compositionStyle: "dynamic diagonals",
      referenceMangaTitle: null,
    },
    storyContext: {
      chapterTitle: "The Sanctuary",
      chapterSummary: "Lyra reaches the sanctuary gate",
      beatTitle: "Revelation",
      beatNarrativeFunction: "reveal",
      previousBeatId: null,
      nextBeatId: null,
    },
    sceneActionSummary: "hero walks",
    environment: {
      locationId: "loc",
      locationName: "Stone Sanctuary",
      locationCanonDescription: "ancient carved stone walls, moss-covered",
      timeOfDay: "dusk",
      weather: null,
      mustShowLocationSignals: ["carved stone runes", "torch fires"],
      atmosphereTokens: ["solemn", "hushed"],
    },
    characters: [
      {
        characterId: "hero",
        characterName: "Lyra",
        role: "hero",
        isHero: true,
        importanceTier: "MAIN_HERO",
        canonDescription: "silver hair, dark cloak, grey eyes",
        currentOutfit: "travelers cloak",
        presenceMode: "primary",
        visualWeight: 0.9,
        requiredFacialReadability: true,
        canonRefAssetIds: [],
      },
    ],
    npcs: [],
    props: [],
    group: null,
    dialogue: null,
    continuity: {
      anchors: [],
      recentBeatsSummary: "",
      heroKnownInjuries: [],
      heroKnownOutfit: null,
      activeInventory: [],
    },
    subjectBalance: {
      primarySubjects: ["Lyra"],
      weightByEntityId: { Lyra: 0.9 },
      requiredReadableFaces: ["Lyra"],
      requiredRelativePosition: null,
      forbiddenSoloFraming: false,
    },
    heroPresenceMode: "primary",
    forbiddenPromptClauses: [],
    forbiddenTokens: [],
    ...overrides,
  };
}

function buildRecipe(overrides: Partial<CanonicalPromptRecipeInput> = {}): CanonicalPromptRecipeOutput {
  return buildCanonicalPromptRecipe(baseInput(overrides));
}

describe("integration canonical-recipe → FAL flatten — par intent type", () => {
  it("hero_focus : manga-first, Lyra visible, sanctuary présent, pas de classification", () => {
    const recipe = buildRecipe({ imageIntentType: "hero_focus" });
    const prompt = flattenSectionsForFal(recipe.sections, { maxLength: 1200 });
    expect(auditFalPrompt(prompt)).toEqual([]);
    const lower = prompt.toLowerCase();
    expect(lower.startsWith("manga panel")).toBe(true);
    expect(lower).toContain("lyra");
    expect(lower).toContain("sanctuary");
    expect(lower).not.toContain("content rating");
    expect(lower).not.toContain("audience teen");
    expect(lower).not.toContain("chapter \"");
  });

  it("environment_establishing : hero présent mais pas centre, env dominant", () => {
    const recipe = buildRecipe({
      imageIntentType: "environment_establishing",
      heroPresenceMode: "silhouette",
      sceneActionSummary: "wide shot of sanctuary at dusk",
    });
    const prompt = flattenSectionsForFal(recipe.sections);
    const lower = prompt.toLowerCase();
    expect(lower.startsWith("manga panel")).toBe(true);
    expect(lower).toContain("sanctuary");
    expect(lower).toContain("carved stone runes");
    expect(auditFalPrompt(prompt)).toEqual([]);
  });

  it("prop_insert : prop visible, pas de framing héros imposé", () => {
    const recipe = buildRecipe({
      imageIntentType: "prop_insert",
      sceneActionSummary: "close insert on glowing amulet",
      props: [
        {
          propId: "p1",
          propName: "ancient amulet",
          canonDescription: "glowing runic metal",
          ownerCategory: "hero",
          visualSignificance: "critical",
        },
      ],
    });
    const prompt = flattenSectionsForFal(recipe.sections);
    const lower = prompt.toLowerCase();
    expect(lower.startsWith("manga panel")).toBe(true);
    expect(lower).toContain("ancient amulet");
    expect(lower).toContain("glowing runic metal");
    expect(auditFalPrompt(prompt)).toEqual([]);
  });

  it("hero_duo : 2 sujets lisibles, ordre respecté", () => {
    const recipe = buildRecipe({
      imageIntentType: "hero_duo",
      sceneActionSummary: "Lyra and Kael face the threshold together",
      characters: [
        {
          characterId: "hero",
          characterName: "Lyra",
          role: "hero",
          isHero: true,
          importanceTier: "MAIN_HERO",
          canonDescription: "silver hair, grey eyes",
          currentOutfit: null,
          presenceMode: "primary",
          visualWeight: 0.6,
          requiredFacialReadability: true,
          canonRefAssetIds: [],
        },
        {
          characterId: "kael",
          characterName: "Kael",
          role: "secondary",
          isHero: false,
          importanceTier: "SECONDARY_CORE",
          canonDescription: "black hair, scarred face",
          currentOutfit: null,
          presenceMode: "primary",
          visualWeight: 0.6,
          requiredFacialReadability: true,
          canonRefAssetIds: [],
        },
      ],
      subjectBalance: {
        primarySubjects: ["Lyra", "Kael"],
        weightByEntityId: { Lyra: 0.5, Kael: 0.5 },
        requiredReadableFaces: ["Lyra", "Kael"],
        requiredRelativePosition: "side-by-side",
        forbiddenSoloFraming: true,
      },
    });
    const prompt = flattenSectionsForFal(recipe.sections);
    const lower = prompt.toLowerCase();
    expect(lower.startsWith("manga panel")).toBe(true);
    expect(lower).toContain("lyra");
    expect(lower).toContain("kael");
    expect(auditFalPrompt(prompt)).toEqual([]);
  });

  it("crowd_presence : groupe dominant, pas de héros centré", () => {
    const recipe = buildRecipe({
      imageIntentType: "crowd_presence",
      heroPresenceMode: "secondary",
      sceneActionSummary: "market crowd turns to watch",
      group: {
        groupKind: "crowd",
        count: 24,
        postureDescription: "curious onlookers turning heads in a busy market",
        threatLevel: "none",
        groupProps: [],
      },
    });
    const prompt = flattenSectionsForFal(recipe.sections);
    const lower = prompt.toLowerCase();
    expect(lower.startsWith("manga panel")).toBe(true);
    expect(lower).toContain("crowd");
    expect(lower).toContain("curious onlookers");
    expect(auditFalPrompt(prompt)).toEqual([]);
  });

  it("tous les intents : audit clean, longueur raisonnable", () => {
    const intents = [
      "hero_focus",
      "hero_action",
      "hero_emotion",
      "hero_reaction",
      "environment_establishing",
      "environment_transition",
      "prop_insert",
      "symbolic_insert",
      "aftermath",
      "reaction_cutaway",
      "dialogue_two_shot",
      "hero_duo",
    ] as const;
    for (const intent of intents) {
      const recipe = buildRecipe({ imageIntentType: intent });
      const prompt = flattenSectionsForFal(recipe.sections);
      expect(auditFalPrompt(prompt), `audit issues for intent=${intent}`).toEqual([]);
      expect(prompt.length, `length for intent=${intent}`).toBeGreaterThan(60);
      expect(prompt.length, `length for intent=${intent}`).toBeLessThanOrEqual(1200);
    }
  });
});
