import { describe, it, expect } from "vitest";
import {
  buildFalPromptPayload,
  validatePayloadForIntent,
  type FalPromptPayloadInput,
} from "./fal-prompt-payload-builder";
import type { CanonicalImagePromptPacket } from "@manga-ai-studio/core";

function makePacket(overrides: Partial<CanonicalImagePromptPacket> = {}): CanonicalImagePromptPacket {
  const base: CanonicalImagePromptPacket = {
    packetVersion: "1.0.0",
    projectId: "proj",
    chapterId: "ch1",
    imageId: "img1",
    sceneImageId: null,
    panelBlueprintId: null,
    sourceBeatId: "b1",
    pageIndex: 0,
    panelIndex: 0,
    beatIndex: 0,
    imageIntentType: "hero_focus",
    contentRating: "teen",
    universeProfile: {
      universeId: "u1",
      universeName: "World",
      tone: "adventure",
      era: null,
      magicLevel: "low",
    },
    mangaStyleProfile: {
      styleId: "s1",
      styleName: "shonen",
      medium: "manga",
      inkingStyle: "clean",
      shadingStyle: "tones",
      compositionStyle: "dynamic",
      referenceMangaTitle: null,
    },
    visualClassification: {
      rating: "teen",
      audience: "teen",
      violenceLevel: "mild",
      sensualityLevel: "none",
      allowedTokens: [],
      forbiddenTokens: [],
    },
    storyContext: {
      chapterTitle: "T",
      chapterSummary: "s",
      beatTitle: "B",
      beatNarrativeFunction: "f",
      previousBeatId: null,
      nextBeatId: null,
    },
    sceneContext: {
      sceneId: "sc",
      sceneFunction: "intro",
      mood: "calm",
      tension: "low",
      actionSummary: "hero walks",
    },
    dialogueContext: null,
    environmentContext: {
      locationId: "loc",
      locationName: "Forest",
      locationCanonDescription: "deep green canopy",
      timeOfDay: "dawn",
      weather: null,
      mustShowLocationSignals: [],
      atmosphereTokens: [],
    },
    continuityContext: {
      anchors: [],
      recentBeatsSummary: "",
      heroKnownInjuries: [],
      heroKnownOutfit: null,
      activeInventory: [],
    },
    characterContext: [
      {
        characterId: "hero",
        characterName: "Lyra",
        role: "hero",
        isHero: true,
        importanceTier: "MAIN_HERO",
        canonDescription: "silver hair",
        currentOutfit: null,
        presenceMode: "primary",
        visualWeight: 0.9,
        requiredFacialReadability: true,
        canonRefAssetIds: [],
      },
    ],
    npcContext: [],
    propContext: [],
    groupContext: null,
    dominantSubjectKind: "hero",
    heroPresenceMode: "primary",
    heroVisualWeight: 0.9,
    subjectBalance: {
      primarySubjects: ["Lyra"],
      weightByEntityId: { Lyra: 0.9 },
      requiredReadableFaces: ["Lyra"],
      requiredRelativePosition: null,
      forbiddenSoloFraming: false,
    },
    loraBindings: [],
    canonBindings: [],
    promptSections: [],
    finalFrenchStructuredPrompt: "[MANGA_MEDIUM] Panel manga",
    finalEnglishStructuredPrompt: "[MANGA_MEDIUM] Manga panel, manga visual language",
    negativePromptEnglish: "photorealistic, 3d render",
    provider: "fal",
    modelRoutingDecision: {
      modelId: "",
      referencePolicy: "NONE",
      usedRefAssetIds: [],
      usedIpAdapterRefAssetIds: [],
      reason: "",
    },
    providerPayload: {
      prompt: "",
      negativePrompt: "",
      width: 0,
      height: 0,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    },
    buildWarnings: [],
    buildTimestamp: 0,
  };
  return { ...base, ...overrides };
}

function makeInput(packet: CanonicalImagePromptPacket, refs: FalPromptPayloadInput["characterRefAssets"] = []): FalPromptPayloadInput {
  return {
    packet,
    characterRefAssets: refs,
    styleRefAssets: [],
    sceneRefAssets: [],
  };
}

describe("buildFalPromptPayload — payload shape", () => {
  it("uses flattened English prompt (manga-first, no [TAG], never FR)", () => {
    // Sprint A — On ne passe plus le prompt structuré brut mais une forme
    // dense manga-first. Le structuré reste dans `extra.structuredPromptForDebug`.
    const packet = makePacket();
    const { payload } = buildFalPromptPayload(makeInput(packet));
    expect(payload.prompt.toLowerCase().startsWith("manga panel")).toBe(true);
    expect(/\[[A-Z_]+\]/.test(payload.prompt)).toBe(false);
    expect(payload.prompt).not.toBe(packet.finalFrenchStructuredPrompt);
    expect(payload.extra?.structuredPromptForDebug).toBe(packet.finalEnglishStructuredPrompt);
  });

  it("sets negativePrompt from packet", () => {
    const packet = makePacket();
    const { payload } = buildFalPromptPayload(makeInput(packet));
    expect(payload.negativePrompt).toBe(packet.negativePromptEnglish);
  });

  it("uses landscape dimensions for environment_establishing", () => {
    const packet = makePacket({
      imageIntentType: "environment_establishing",
      finalEnglishStructuredPrompt: "[MANGA_MEDIUM] Manga panel, wide establishing",
      characterContext: [],
    });
    const { payload } = buildFalPromptPayload(makeInput(packet));
    expect(payload.width).toBeGreaterThan(payload.height);
  });

  it("uses portrait dimensions for hero_emotion", () => {
    const packet = makePacket({ imageIntentType: "hero_emotion" });
    const { payload } = buildFalPromptPayload(makeInput(packet));
    expect(payload.height).toBeGreaterThan(payload.width);
  });
});

describe("buildFalPromptPayload — reference policy", () => {
  it("activates STRONG policy when hero_focus with character refs", () => {
    const packet = makePacket({ imageIntentType: "hero_focus" });
    const { modelRoutingDecision, payload } = buildFalPromptPayload(
      makeInput(packet, [{ characterId: "hero", assetId: "a1", url: "https://x/1.png", kind: "face" }]),
    );
    expect(modelRoutingDecision.referencePolicy).toBe("STRONG");
    expect(payload.ipAdapterRefs.length).toBeGreaterThan(0);
  });

  it("drops character refs on environment_establishing (LIGHT policy)", () => {
    const packet = makePacket({
      imageIntentType: "environment_establishing",
      finalEnglishStructuredPrompt: "[MANGA_MEDIUM] Manga panel, wide landscape",
      characterContext: [],
    });
    const { modelRoutingDecision, payload } = buildFalPromptPayload(
      makeInput(packet, [{ characterId: "hero", assetId: "a1", url: "https://x/1.png", kind: "face" }]),
    );
    expect(modelRoutingDecision.referencePolicy).toBe("LIGHT");
    expect(payload.ipAdapterRefs).toEqual([]);
  });

  it("uses NONE policy for non-hero intents without character refs", () => {
    const packet = makePacket({
      imageIntentType: "guard_group_focus",
      finalEnglishStructuredPrompt: "[MANGA_MEDIUM] Manga panel, guards in formation",
      groupContext: {
        groupKind: "guards",
        count: 5,
        postureDescription: "formation",
        threatLevel: "latent",
        groupProps: [],
      },
    });
    const { modelRoutingDecision } = buildFalPromptPayload(makeInput(packet, []));
    expect(["NONE", "LIGHT"]).toContain(modelRoutingDecision.referencePolicy);
  });
});

describe("validatePayloadForIntent — preflight rules", () => {
  it("rejects portrait framing on environment_establishing", () => {
    const packet = makePacket({
      imageIntentType: "environment_establishing",
      finalEnglishStructuredPrompt: "[MANGA_MEDIUM] Manga panel, close-up portrait of hero",
      characterContext: [],
    });
    const result = validatePayloadForIntent(packet, {
      prompt: packet.finalEnglishStructuredPrompt,
      negativePrompt: "",
      width: 1024,
      height: 768,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PORTRAIT_FRAMING_ON_ENVIRONMENT"))).toBe(true);
  });

  it("rejects dialogue_two_shot with only 1 readable face", () => {
    const packet = makePacket({
      imageIntentType: "dialogue_two_shot",
      subjectBalance: {
        primarySubjects: ["Lyra"],
        weightByEntityId: {},
        requiredReadableFaces: ["Lyra"],
        requiredRelativePosition: null,
        forbiddenSoloFraming: true,
      },
    });
    const result = validatePayloadForIntent(packet, {
      prompt: "[MANGA_MEDIUM] manga",
      negativePrompt: "",
      width: 896,
      height: 1152,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("SHARED_SPOTLIGHT_MISSING_SECOND_SUBJECT"))).toBe(true);
  });

  it("rejects guard_group_focus without groupContext", () => {
    const packet = makePacket({
      imageIntentType: "guard_group_focus",
      groupContext: null,
    });
    const result = validatePayloadForIntent(packet, {
      prompt: "[MANGA_MEDIUM] manga",
      negativePrompt: "",
      width: 1024,
      height: 768,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("GROUP_INTENT_MISSING_GROUP_CONTEXT"))).toBe(true);
  });

  it("rejects teen rating with explicit tokens", () => {
    const packet = makePacket({
      contentRating: "teen",
      finalEnglishStructuredPrompt: "[MANGA_MEDIUM] manga panel with nude figure",
    });
    const result = validatePayloadForIntent(packet, {
      prompt: packet.finalEnglishStructuredPrompt,
      negativePrompt: "",
      width: 896,
      height: 1152,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("RATING_INCOMPATIBLE_TOKEN"))).toBe(true);
  });

  it("requires manga medium token in final prompt", () => {
    const packet = makePacket({
      finalEnglishStructuredPrompt: "[VISUAL_STYLE] random style",
    });
    const result = validatePayloadForIntent(packet, {
      prompt: packet.finalEnglishStructuredPrompt,
      negativePrompt: "",
      width: 896,
      height: 1152,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("MISSING_MANGA_MEDIUM_TOKEN"))).toBe(true);
  });

  it("accepts valid hero_focus payload", () => {
    const packet = makePacket();
    const { validation } = buildFalPromptPayload(makeInput(packet));
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
