import { describe, it, expect } from "vitest";
import {
  resolveRetryPacketBase,
  resolveEffectiveRetryOverrides,
  mergeOverrideField,
  mapRetryModeToRerollReason,
  retryBodySchema,
  buildPacketAwareRetryPrompt,
} from "@/lib/retry/retry-packet-resolver";
import type { CanonicalImagePromptPacket } from "@manga-ai-studio/core";

function makePacket(overrides: Partial<CanonicalImagePromptPacket> = {}): CanonicalImagePromptPacket {
  return {
    packetVersion: "1.0.0",
    projectId: "p1",
    chapterId: "c1",
    imageId: "img_1",
    sceneImageId: "scene-img-1",
    panelBlueprintId: null,
    sourceBeatId: "beat_1",
    pageIndex: 0,
    panelIndex: 0,
    beatIndex: 0,
    imageIntentType: "hero_focus",
    contentRating: "teen",
    universeProfile: { universeId: "u", universeName: "u", tone: "t", era: null, magicLevel: null },
    mangaStyleProfile: {
      styleId: "s",
      styleName: "s",
      medium: "manga",
      inkingStyle: "",
      shadingStyle: "",
      compositionStyle: "",
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
      chapterTitle: "",
      chapterSummary: "",
      beatTitle: "",
      beatNarrativeFunction: "",
      previousBeatId: null,
      nextBeatId: null,
    },
    sceneContext: { sceneId: "s", sceneFunction: "", mood: "", tension: "medium", actionSummary: "" },
    dialogueContext: null,
    environmentContext: {
      locationId: "l",
      locationName: "l",
      locationCanonDescription: "",
      timeOfDay: "day",
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
    characterContext: [],
    npcContext: [],
    propContext: [],
    groupContext: null,
    dominantSubjectKind: "hero",
    heroPresenceMode: "primary",
    heroVisualWeight: 1,
    subjectBalance: {
      primarySubjects: [],
      weightByEntityId: {},
      requiredReadableFaces: [],
      requiredRelativePosition: null,
      forbiddenSoloFraming: false,
    },
    loraBindings: [],
    canonBindings: [],
    promptSections: [],
    finalFrenchStructuredPrompt: "final fr",
    finalEnglishStructuredPrompt: "[MANGA_MEDIUM] canonical hero focus prompt",
    negativePromptEnglish: "photorealistic, 3d",
    provider: "fal",
    modelRoutingDecision: {
      modelId: "flux-dev",
      referencePolicy: "LIGHT",
      usedRefAssetIds: [],
      usedIpAdapterRefAssetIds: [],
      reason: "ok",
    },
    providerPayload: {
      prompt: "[MANGA_MEDIUM] canonical hero focus prompt",
      negativePrompt: "photorealistic, 3d",
      width: 1024,
      height: 1024,
      refs: [],
      ipAdapterRefs: [],
      guidanceScale: null,
      seed: null,
      extra: {},
    },
    buildWarnings: [],
    buildTimestamp: 0,
    ...overrides,
  };
}

describe("resolveRetryPacketBase", () => {
  it("utilise le packet canonique quand présent", () => {
    const packet = makePacket();
    const out = resolveRetryPacketBase({
      metadataCanonicalPacket: packet,
      sceneImagePrompt: "legacy",
      sceneImageNegativePrompt: "legacy neg",
    });
    expect(out.source).toBe("canonical");
    expect(out.basePrompt).toContain("canonical hero focus");
    expect(out.baseNegativePrompt).toContain("photorealistic");
    expect(out.packet).not.toBeNull();
    expect(out.packetVersion).toBe("1.0.0");
  });

  it("fallback legacy si pas de packet", () => {
    const out = resolveRetryPacketBase({
      metadataCanonicalPacket: null,
      sceneImagePrompt: "legacy prompt",
      sceneImageNegativePrompt: "legacy neg",
    });
    expect(out.source).toBe("legacy");
    expect(out.basePrompt).toBe("legacy prompt");
    expect(out.packet).toBeNull();
  });

  it("fallback legacy si packet shape invalide", () => {
    const out = resolveRetryPacketBase({
      metadataCanonicalPacket: { foo: "bar" },
      sceneImagePrompt: "legacy prompt",
      sceneImageNegativePrompt: "legacy neg",
    });
    expect(out.source).toBe("legacy");
  });
});

describe("mergeOverrideField (tri-état)", () => {
  it("undefined preserve la valeur précédente", () => {
    expect(mergeOverrideField("hello", undefined)).toBe("hello");
    expect(mergeOverrideField(null, undefined)).toBe(null);
  });
  it("null clear la valeur précédente", () => {
    expect(mergeOverrideField("hello", null)).toBe(null);
  });
  it("string set la nouvelle valeur", () => {
    expect(mergeOverrideField("hello", "world")).toBe("world");
  });
});

describe("resolveEffectiveRetryOverrides", () => {
  it("préserve les anciens overrides si body vide", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { userPromptAdditions: "keep me", userPromptExclusions: "bad" },
      body: {},
    });
    expect(out.effectiveUserPromptAdditions).toBe("keep me");
    expect(out.effectiveUserPromptExclusions).toBe("bad");
    expect(out.hasOverride).toBe(true);
  });

  it("clear avec null explicite", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { userPromptAdditions: "keep me", userPromptExclusions: "bad" },
      body: { userPromptAdditions: null, userPromptExclusions: undefined },
    });
    expect(out.effectiveUserPromptAdditions).toBe(null);
    expect(out.effectiveUserPromptExclusions).toBe("bad");
  });

  it("set écrase", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { userPromptAdditions: "keep me" },
      body: { userPromptAdditions: "new value" },
    });
    expect(out.effectiveUserPromptAdditions).toBe("new value");
  });

  it("forceOverrides: merge deep avec null=delete", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { forceOverrides: { shotType: "wide", subjectFocus: "hero" } },
      body: { forceOverrides: { shotType: null, cameraAngle: "low angle" } },
    });
    expect(out.effectiveForceOverrides).toEqual({
      subjectFocus: "hero",
      cameraAngle: "low angle",
    });
  });

  it("forceOverrides: null total wipe", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { forceOverrides: { shotType: "wide" } },
      body: { forceOverrides: null },
    });
    expect(out.effectiveForceOverrides).toEqual({});
  });

  it("hasOverride=false si tout est vide ou null", () => {
    const out = resolveEffectiveRetryOverrides({
      previous: { userPromptAdditions: "x" },
      body: { userPromptAdditions: null },
    });
    expect(out.effectiveUserPromptAdditions).toBe(null);
    expect(out.hasOverride).toBe(false);
    expect(out.persisted).toBe(null);
  });
});

describe("mapRetryModeToRerollReason", () => {
  it("mappe chaque retryMode vers un RerollReason", () => {
    expect(mapRetryModeToRerollReason("character")).toBe("drift_character");
    expect(mapRetryModeToRerollReason("environment")).toBe("drift_environment");
    expect(mapRetryModeToRerollReason("style")).toBe("drift_style");
    expect(mapRetryModeToRerollReason("composition")).toBe("wrong_framing");
    expect(mapRetryModeToRerollReason("interaction")).toBe("wrong_dominant_subject");
    expect(mapRetryModeToRerollReason("policy")).toBe("policy_violation");
    expect(mapRetryModeToRerollReason(null)).toBe("user_request");
    expect(mapRetryModeToRerollReason(undefined)).toBe("user_request");
  });
});

describe("retryBodySchema", () => {
  it("accepte un body vide", () => {
    const r = retryBodySchema.safeParse({});
    expect(r.success).toBe(true);
  });
  it("accepte les trois états sur userPromptAdditions", () => {
    expect(retryBodySchema.safeParse({ userPromptAdditions: "x" }).success).toBe(true);
    expect(retryBodySchema.safeParse({ userPromptAdditions: null }).success).toBe(true);
    expect(retryBodySchema.safeParse({}).success).toBe(true);
  });
  it("refuse un additions trop long", () => {
    const r = retryBodySchema.safeParse({ userPromptAdditions: "x".repeat(500) });
    expect(r.success).toBe(false);
  });
  it("refuse un mode inconnu", () => {
    const r = retryBodySchema.safeParse({ mode: "unknown_mode" });
    expect(r.success).toBe(false);
  });
});

describe("buildPacketAwareRetryPrompt", () => {
  it("construit un prompt qui part du canonique + ajoute hints + user additions", () => {
    const packet = makePacket();
    const out = buildPacketAwareRetryPrompt({
      packet,
      retryMode: "character",
      attemptIndex: 0,
      positiveAugment: "",
      negativeAugment: "",
      userPromptAdditions: "extra",
      userPromptExclusions: "no blur",
    });
    expect(out.positivePrompt).toContain("canonical hero focus");
    expect(out.positivePrompt).toContain("extra");
    expect(out.negativePrompt).toContain("photorealistic");
    expect(out.negativePrompt).toContain("no blur");
    expect(out.allowed).toBe(true);
    expect(out.intent).toBe("hero_focus");
  });

  it("bloque la reroll quand MAX_RETRIES atteint", () => {
    const packet = makePacket();
    const out = buildPacketAwareRetryPrompt({
      packet,
      retryMode: "character",
      attemptIndex: 10,
      positiveAugment: "",
      negativeAugment: "",
      userPromptAdditions: null,
      userPromptExclusions: null,
    });
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("MAX_RETRIES");
  });
});
