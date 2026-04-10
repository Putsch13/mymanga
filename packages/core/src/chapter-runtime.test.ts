import { describe, expect, it } from "vitest";
import {
  aggregateChapterImageCounts,
  buildStructuredChapterRuntimeFields,
  classifyPanelCriticality,
  getCharacterTierPolicy,
  resolveEffectiveCharacterCanon,
} from "./chapter-runtime";

describe("chapter-runtime helpers", () => {
  it("classifie un panel héros close-up comme critique", () => {
    const result = classifyPanelCriticality({
      shotType: "closeup",
      characterTiers: ["MAIN_HERO"],
      pagePanelCount: 4,
      panelNumber: 2,
    });

    expect(result.level).toBe("CRITICAL");
    expect(result.qaWasRequired).toBe(true);
    expect(result.reasons).toContain("hero_closeup");
  });

  it("centralise correctement les compteurs d'images", () => {
    const counts = aggregateChapterImageCounts({
      estimatedImages: 60,
      targetImages: 58,
      minimumImages: 55,
      generatedImages: 57,
      acceptedImages: 49,
      rejectedImages: 8,
    });

    expect(counts.missingImages).toBe(6);
    expect(counts.acceptedImages).toBe(49);
    expect(counts.minimumImages).toBe(55);
  });

  it("normalise les champs runtime structurés persistables", () => {
    const fields = buildStructuredChapterRuntimeFields({
      snapshot: {
        status: "READY_FOR_GENERATION",
        currentStep: "readiness",
        updatedAt: "2026-04-10T10:00:00.000Z",
        autosaveVersion: 2,
        data: {},
        history: [],
      },
      counts: {
        minimumImages: 55,
        generatedImages: 48,
        acceptedImages: 50,
        rejectedImages: 2,
      },
      criticalPanelsCount: 3,
      criticalPanelsBlocked: 1,
      criticalPanelsMissingQa: 1,
    });

    expect(fields.generatedImages).toBe(50);
    expect(fields.acceptedImages).toBe(50);
    expect(fields.missingImages).toBe(5);
    expect(fields.reviewBlockedReason).toBe("missing_images");
    expect(fields.studioStatus).toBe("GENERATION_PARTIAL");
  });

  it("donne une politique stricte aux recurring npc promus", () => {
    const policy = getCharacterTierPolicy("RECURRING_NPC");

    expect(policy.minimumLock).toBe("MEDIUM");
    expect(policy.recurringMemoryUsed).toBe(true);
    expect(policy.qaExpectation).toBe("light");
  });

  it("privilégie le canon studio sur une valeur legacy contradictoire", () => {
    const resolved = resolveEffectiveCharacterCanon({
      studioCharacterCanons: [
        {
          characterId: "hero-1",
          canonicalName: "Aiko",
          role: "hero",
          importanceTier: "MAIN_HERO",
          lockStrength: "HARD_LOCK",
          visualIdentity: ["short silver hair"],
          silhouette: null,
          faceTraits: [],
          eyeTraits: [],
          hairTraits: [],
          skinTone: null,
          bodyType: null,
          apparentAge: null,
          accessories: [],
          signatureMarks: [],
          defaultOutfitId: null,
          defaultOutfitSet: [],
          emotionalRange: [],
          forbiddenDrift: [],
          mustKeep: [],
          optionalVariation: [],
          referenceAssets: [],
          loraBindings: [],
          fingerprint: {},
        },
      ],
      characterId: "hero-1",
      fallbackCharacterCanon: {
        canonicalName: "Legacy Hero",
        importanceTier: "BACKGROUND_EXTRA",
        lockStrength: "NONE",
      },
    });

    expect(resolved.source).toBe("studio");
    expect(resolved.legacyBridgeUsed).toBe(false);
    expect(resolved.canon.canonicalName).toBe("Aiko");
    expect(resolved.canon.lockStrength).toBe("HARD_LOCK");
  });
});

