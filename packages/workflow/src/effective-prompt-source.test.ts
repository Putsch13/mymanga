import { describe, it, expect } from "vitest";
import {
  resolveEffectivePanelPromptSource,
  buildPromptDebugSnapshot,
} from "./effective-prompt-source";
import type { CanonicalImagePromptPacket } from "@manga-ai-studio/core";

function makePacket(overrides: Partial<CanonicalImagePromptPacket> = {}): CanonicalImagePromptPacket {
  return {
    packetVersion: "1.0.0",
    projectId: "p1",
    chapterId: "c1",
    imageId: "img_1",
    sceneImageId: "scene_img_1",
    panelBlueprintId: "bp_1",
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
    finalFrenchStructuredPrompt: "[MANGA_MEDIUM] manga, ...",
    finalEnglishStructuredPrompt: "[MANGA_MEDIUM] manga panel, hero focus in manga style",
    negativePromptEnglish: "photorealistic, 3d render",
    provider: "fal",
    modelRoutingDecision: {
      modelId: "flux",
      referencePolicy: "LIGHT",
      usedRefAssetIds: [],
      usedIpAdapterRefAssetIds: [],
      reason: "ok",
    },
    providerPayload: {
      prompt: "[MANGA_MEDIUM] manga panel, hero focus in manga style",
      negativePrompt: "photorealistic, 3d render",
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

describe("resolveEffectivePanelPromptSource", () => {
  it("utilise le prompt canonique quand packet present ET preflight valide", () => {
    const packet = makePacket();
    const out = resolveEffectivePanelPromptSource({
      canonicalPacket: packet,
      canonicalPacketValidation: { valid: true, errors: [], warnings: [] },
      legacyPrompt: "legacy prompt",
      legacyNegativePrompt: "legacy negative",
    });
    expect(out.source).toBe("canonical");
    expect(out.usedPacket).toBe(true);
    expect(out.prompt).toContain("manga");
    expect(out.negativePrompt).toContain("photorealistic");
    expect(out.packetVersion).toBe("1.0.0");
  });

  it("fallback legacy quand preflight invalide", () => {
    const packet = makePacket();
    const out = resolveEffectivePanelPromptSource({
      canonicalPacket: packet,
      canonicalPacketValidation: { valid: false, errors: ["PORTRAIT_FRAMING_ON_ENVIRONMENT"], warnings: [] },
      legacyPrompt: "legacy prompt",
      legacyNegativePrompt: "legacy negative",
    });
    expect(out.source).toBe("legacy");
    expect(out.usedPacket).toBe(false);
    expect(out.prompt).toBe("legacy prompt");
    expect(out.warnings.some((w) => w.startsWith("canonical_packet_preflight_invalid"))).toBe(true);
  });

  it("fallback legacy quand packet absent", () => {
    const out = resolveEffectivePanelPromptSource({
      canonicalPacket: null,
      canonicalPacketValidation: null,
      legacyPrompt: "legacy prompt",
      legacyNegativePrompt: "legacy negative",
    });
    expect(out.source).toBe("legacy");
    expect(out.usedPacket).toBe(false);
    expect(out.warnings).toEqual([]);
  });

  it("fallback sur le negatif legacy si le packet n'a pas de negatif", () => {
    const packet = makePacket({ negativePromptEnglish: "" });
    const out = resolveEffectivePanelPromptSource({
      canonicalPacket: packet,
      canonicalPacketValidation: { valid: true, errors: [], warnings: [] },
      legacyPrompt: "legacy prompt",
      legacyNegativePrompt: "legacy negative",
    });
    expect(out.source).toBe("canonical");
    expect(out.negativePrompt).toBe("legacy negative");
    expect(out.warnings).toContain("canonical_negative_prompt_missing_fell_back_to_legacy");
  });

  it("fallback si le prompt canonique final est vide", () => {
    const packet = makePacket({ finalEnglishStructuredPrompt: "   " });
    const out = resolveEffectivePanelPromptSource({
      canonicalPacket: packet,
      canonicalPacketValidation: { valid: true, errors: [], warnings: [] },
      legacyPrompt: "legacy prompt",
      legacyNegativePrompt: "legacy negative",
    });
    expect(out.source).toBe("legacy");
    expect(out.warnings).toContain("canonical_packet_missing_final_english_prompt");
  });
});

describe("buildPromptDebugSnapshot", () => {
  it("capture l'information runtime + warnings effective", () => {
    const effective = {
      prompt: "X",
      negativePrompt: "Y",
      source: "canonical" as const,
      usedPacket: true,
      packetVersion: "1.0.0",
      warnings: ["w1"],
    };
    const snap = buildPromptDebugSnapshot({
      effective,
      provider: "fal",
      model: "flux-dev",
      referencePolicy: "LIGHT",
      width: 1024,
      height: 1024,
      refsCount: 2,
      lorasCount: 1,
      seed: 42,
      extraWarnings: ["w2"],
    });
    expect(snap.finalPrompt).toBe("X");
    expect(snap.promptSource).toBe("canonical");
    expect(snap.usedPacket).toBe(true);
    expect(snap.warnings).toEqual(["w1", "w2"]);
    expect(snap.provider).toBe("fal");
    expect(typeof snap.requestedAt).toBe("string");
  });
});
