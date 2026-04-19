import { describe, it, expect } from "vitest";
import {
  planRerollForPacket,
  applyRerollPlanToPayload,
} from "./packet-aware-reroll-advisor";
import type { CanonicalImagePromptPacket, ProviderPayload } from "@manga-ai-studio/core";

function makePacket(intent: CanonicalImagePromptPacket["imageIntentType"] = "hero_focus"): CanonicalImagePromptPacket {
  return {
    packetVersion: "1.0.0",
    projectId: "p",
    chapterId: "c",
    imageId: "i",
    sourceBeatId: "b",
    pageIndex: 0,
    panelIndex: 0,
    beatIndex: 0,
    imageIntentType: intent,
    contentRating: "teen",
    universeProfile: { universeId: "u", universeName: "U", tone: "t", era: null, magicLevel: null },
    mangaStyleProfile: {
      styleId: "s",
      styleName: "shonen",
      medium: "manga",
      inkingStyle: "clean",
      shadingStyle: "tones",
      compositionStyle: "dyn",
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
    sceneContext: {
      sceneId: "",
      sceneFunction: "",
      mood: "",
      tension: "low",
      actionSummary: "",
    },
    dialogueContext: null,
    environmentContext: {
      locationId: "loc1",
      locationName: "Forest",
      locationCanonDescription: "deep canopy",
      timeOfDay: "dawn",
      weather: null,
      mustShowLocationSignals: ["ancient tree", "stone pillars"],
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
    dominantSubjectKind: "environment",
    heroPresenceMode: "absent",
    heroVisualWeight: 0,
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
    finalFrenchStructuredPrompt: "",
    finalEnglishStructuredPrompt: "[MANGA_MEDIUM] manga",
    negativePromptEnglish: "photorealistic",
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
}

function makePayload(): ProviderPayload {
  return {
    prompt: "[MANGA_MEDIUM] manga",
    negativePrompt: "photorealistic, 3d render",
    width: 896,
    height: 1152,
    refs: [{ assetId: "r1", url: "u", kind: "character", weight: 0.9 }],
    ipAdapterRefs: [{ assetId: "ip1", url: "u", kind: "character", weight: 0.9 }],
    guidanceScale: 4.5,
    seed: 42,
    extra: {},
  };
}

describe("planRerollForPacket", () => {
  it("denies reroll after 4 attempts", () => {
    const plan = planRerollForPacket(makePacket(), "low_quality", 4);
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toContain("MAX_RETRIES");
  });

  it("forces STRONG policy on drift_character", () => {
    const plan = planRerollForPacket(makePacket("hero_focus"), "drift_character", 1);
    expect(plan.forcedReferencePolicy).toBe("STRONG");
    expect(plan.extraPromptHints.some((h) => h.toLowerCase().includes("canonical face"))).toBe(true);
  });

  it("preserves environment signals on drift_environment", () => {
    const plan = planRerollForPacket(makePacket("environment_establishing"), "drift_environment", 1);
    expect(plan.extraPromptHints.some((h) => h.includes("Forest"))).toBe(true);
    expect(plan.extraPromptHints.some((h) => h.includes("ancient tree"))).toBe(true);
  });

  it("forces non-hero framing negatives on wrong_dominant_subject for environment", () => {
    const plan = planRerollForPacket(makePacket("environment_establishing"), "wrong_dominant_subject", 1);
    expect(plan.extraNegativeTokens).toContain("hero portrait");
    expect(plan.extraNegativeTokens).toContain("hero centered");
  });

  it("drops ipAdapterRefs on wrong_framing", () => {
    const plan = planRerollForPacket(makePacket("environment_establishing"), "wrong_framing", 1);
    expect(plan.keepIpAdapterRefs).toBe(false);
  });
});

describe("applyRerollPlanToPayload", () => {
  it("appends REROLL_HINTS section to prompt", () => {
    const payload = makePayload();
    const plan = planRerollForPacket(makePacket("environment_establishing"), "drift_environment", 1);
    const newPayload = applyRerollPlanToPayload(payload, plan);
    expect(newPayload.prompt).toContain("[REROLL_HINTS]");
  });

  it("keeps refs on drift_character (STRONG policy)", () => {
    const payload = makePayload();
    const plan = planRerollForPacket(makePacket(), "drift_character", 1);
    const newPayload = applyRerollPlanToPayload(payload, plan);
    expect(newPayload.refs.length).toBe(1);
    expect(newPayload.ipAdapterRefs.length).toBe(1);
  });

  it("drops seed by default on reroll", () => {
    const payload = makePayload();
    const plan = planRerollForPacket(makePacket(), "low_quality", 1);
    const newPayload = applyRerollPlanToPayload(payload, plan);
    expect(newPayload.seed).toBe(null);
  });

  it("bumps guidanceScale on low_quality", () => {
    const payload = makePayload();
    const plan = planRerollForPacket(makePacket(), "low_quality", 1);
    const newPayload = applyRerollPlanToPayload(payload, plan);
    expect((newPayload.guidanceScale ?? 0) > 4.5).toBe(true);
  });
});
