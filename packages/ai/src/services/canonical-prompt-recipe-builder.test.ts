import { describe, it, expect } from "vitest";
import {
  buildCanonicalPromptRecipe,
  type CanonicalPromptRecipeInput,
} from "./canonical-prompt-recipe-builder";
import { detectResidualFrenchTokens } from "./prompt-translator";
import type {
  ImageIntentType,
  ContentRating,
  HeroPresenceMode,
  CharacterContextEntry,
  GroupContextEntry,
  DialogueContext,
} from "@manga-ai-studio/core";

function makeHero(): CharacterContextEntry {
  return {
    characterId: "char_hero",
    characterName: "Lyra",
    role: "hero",
    isHero: true,
    importanceTier: "MAIN_HERO",
    canonDescription: "short silver hair, green eyes, slim build, teen girl",
    currentOutfit: "travel cloak with leather boots",
    presenceMode: "primary",
    visualWeight: 0.9,
    requiredFacialReadability: true,
    canonRefAssetIds: ["asset_hero_face"],
  };
}

function makeInput(overrides: {
  intent: ImageIntentType;
  rating?: ContentRating;
  heroPresence?: HeroPresenceMode;
  characters?: CharacterContextEntry[];
  group?: GroupContextEntry | null;
  dialogue?: DialogueContext | null;
  forbiddenTokens?: string[];
  forbiddenClauses?: string[];
}): CanonicalPromptRecipeInput {
  return {
    imageIntentType: overrides.intent,
    contentRating: overrides.rating ?? "teen",
    visualClassification: {
      rating: overrides.rating ?? "teen",
      audience: "teen 13+",
      violenceLevel: "mild",
      sensualityLevel: "none",
      allowedTokens: [],
      forbiddenTokens: overrides.forbiddenTokens ?? [],
    },
    mangaStyle: {
      styleId: "mstyle_shonen_classic",
      styleName: "shonen classic",
      medium: "manga",
      inkingStyle: "clean bold lines",
      shadingStyle: "screen tones",
      compositionStyle: "dynamic panel layout",
      referenceMangaTitle: "Hunter x Hunter",
    },
    storyContext: {
      chapterTitle: "The Gate Opens",
      chapterSummary: "Lyra crosses into the second realm",
      beatTitle: "Arrival at the gate",
      beatNarrativeFunction: "introduction_of_new_world",
      previousBeatId: null,
      nextBeatId: null,
    },
    sceneActionSummary: "Lyra approaches a massive stone gate guarded by stoic figures",
    environment: {
      locationId: "loc_gate",
      locationName: "Ancient Gate",
      locationCanonDescription: "towering carved stone archway covered in runes",
      timeOfDay: "dusk",
      weather: "overcast",
      mustShowLocationSignals: ["rune glyphs", "stone pillars"],
      atmosphereTokens: ["mystical", "heavy"],
    },
    characters: overrides.characters ?? [makeHero()],
    npcs: [],
    props: [],
    group: overrides.group ?? null,
    dialogue: overrides.dialogue ?? null,
    continuity: {
      anchors: [],
      recentBeatsSummary: "",
      heroKnownInjuries: [],
      heroKnownOutfit: "travel cloak",
      activeInventory: ["runed amulet"],
    },
    subjectBalance: {
      primarySubjects: ["Lyra"],
      weightByEntityId: { Lyra: 0.9 },
      requiredReadableFaces: ["Lyra"],
      requiredRelativePosition: null,
      forbiddenSoloFraming: false,
    },
    heroPresenceMode: overrides.heroPresence ?? "primary",
    forbiddenPromptClauses: overrides.forbiddenClauses ?? [],
    forbiddenTokens: overrides.forbiddenTokens ?? [],
  };
}

describe("buildCanonicalPromptRecipe — required sections", () => {
  it("always includes [MANGA_MEDIUM] with explicit manga language", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus" }));
    expect(out.finalEnglishStructuredPrompt).toContain("[MANGA_MEDIUM]");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("manga panel");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("manga visual language");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("same manga style");
  });

  it("always includes rating in content classification section", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus", rating: "mature" }));
    expect(out.finalEnglishStructuredPrompt).toContain("[CONTENT_CLASSIFICATION]");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("mature");
  });

  it("includes 8 mandatory sections with no missing-section warnings", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus" }));
    expect(out.warnings).toEqual([]);
    const mandatoryTags = [
      "MANGA_MEDIUM",
      "VISUAL_STYLE",
      "CONTENT_CLASSIFICATION",
      "SCENE_ACTION",
      "ENVIRONMENT",
      "STORY_CONTEXT",
      "CANON_CONSTRAINTS",
      "FORBIDDEN_ELEMENTS",
    ];
    for (const tag of mandatoryTags) {
      expect(out.finalEnglishStructuredPrompt).toContain(`[${tag}]`);
      expect(out.finalFrenchStructuredPrompt).toContain(`[${tag}]`);
    }
  });
});

describe("buildCanonicalPromptRecipe — non-hero dominant intents", () => {
  it("adds hero-tuck clause on environment_establishing when hero silhouette", () => {
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "environment_establishing",
        heroPresence: "silhouette",
      }),
    );
    expect(out.finalEnglishStructuredPrompt).toContain("silhouette");
  });

  it("forbids hero portrait tokens in negative prompt for prop_insert", () => {
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "prop_insert",
        heroPresence: "absent",
      }),
    );
    expect(out.negativePromptEnglish.toLowerCase()).toContain("hero portrait");
    expect(out.negativePromptEnglish.toLowerCase()).toContain("hero centered");
    expect(out.negativePromptEnglish.toLowerCase()).toContain("face filling frame");
  });

  it("forbids close up on environment_establishing", () => {
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "environment_establishing",
        heroPresence: "silhouette",
      }),
    );
    expect(out.negativePromptEnglish.toLowerCase()).toContain("close up");
  });

  it("flags the hero as not-centered when intent is enemy_focus and hero is present as secondary", () => {
    const hero = { ...makeHero(), presenceMode: "secondary" as HeroPresenceMode };
    const enemy: CharacterContextEntry = {
      characterId: "char_enemy",
      characterName: "Varga",
      role: "enemy",
      isHero: false,
      importanceTier: "IMPORTANT_SUPPORTING_CHARACTER",
      canonDescription: "tall man with scarred face, dark robe",
      currentOutfit: "dark robe",
      presenceMode: "primary",
      visualWeight: 0.9,
      requiredFacialReadability: true,
      canonRefAssetIds: [],
    };
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "enemy_focus",
        heroPresence: "secondary",
        characters: [hero, enemy],
      }),
    );
    expect(out.finalEnglishStructuredPrompt).toContain("never centered");
    expect(out.finalEnglishStructuredPrompt).toContain("never foreground");
  });
});

describe("buildCanonicalPromptRecipe — group / crowd", () => {
  it("emits explicit group section when group focus", () => {
    const group: GroupContextEntry = {
      groupKind: "guards",
      count: 5,
      postureDescription: "standing in formation, weapons ready",
      threatLevel: "latent",
      groupProps: ["halberd", "chain mail"],
    };
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "guard_group_focus",
        heroPresence: "secondary",
        group,
      }),
    );
    expect(out.finalEnglishStructuredPrompt).toContain("[GROUP_DESCRIPTION]");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("guards");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain("halberd");
    expect(out.finalEnglishStructuredPrompt.toLowerCase()).toContain(
      "readable subject of the panel",
    );
  });
});

describe("buildCanonicalPromptRecipe — dialogue", () => {
  it("includes dialogue context section with readable lines", () => {
    const dialogue: DialogueContext = {
      primarySpeakerId: "char_hero",
      lines: [
        { speakerId: "char_hero", speakerName: "Lyra", text: "We have to go now.", emotion: "urgent" },
        { speakerId: "char_ally", speakerName: "Ren", text: "Not without the key.", emotion: "firm" },
      ],
      dialogueBeat: "urgency_vs_caution",
    };
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "dialogue_two_shot",
        heroPresence: "primary",
        dialogue,
      }),
    );
    expect(out.finalEnglishStructuredPrompt).toContain("[DIALOGUE_CONTEXT]");
    expect(out.finalEnglishStructuredPrompt).toContain("Lyra");
    expect(out.finalEnglishStructuredPrompt).toContain("Ren");
    expect(out.finalEnglishStructuredPrompt).toContain("urgent");
  });
});

describe("buildCanonicalPromptRecipe — English output safety", () => {
  it("produces a final english prompt with no residual FR tokens for hero_focus", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus" }));
    const residual = detectResidualFrenchTokens(out.finalEnglishStructuredPrompt);
    expect(residual).toEqual([]);
  });

  it("produces a final english prompt with no residual FR tokens for environment_establishing", () => {
    const out = buildCanonicalPromptRecipe(
      makeInput({
        intent: "environment_establishing",
        heroPresence: "silhouette",
      }),
    );
    const residual = detectResidualFrenchTokens(out.finalEnglishStructuredPrompt);
    expect(residual).toEqual([]);
  });

  it("final french prompt is different from final english prompt", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus" }));
    expect(out.finalFrenchStructuredPrompt).not.toBe(out.finalEnglishStructuredPrompt);
  });
});

describe("buildCanonicalPromptRecipe — negative prompt base tokens", () => {
  it("always contains anti-photorealism tokens", () => {
    const out = buildCanonicalPromptRecipe(makeInput({ intent: "hero_focus" }));
    expect(out.negativePromptEnglish.toLowerCase()).toContain("photorealistic");
    expect(out.negativePromptEnglish.toLowerCase()).toContain("3d render");
    expect(out.negativePromptEnglish.toLowerCase()).toContain("western comic style");
  });
});
