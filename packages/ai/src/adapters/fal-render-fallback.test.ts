import { describe, it, expect } from "vitest";
import { buildFalGenerationRequest } from "./fal-adapter-shared";

describe("buildFalGenerationRequest — Redux fallback", () => {
  const baseInput = {
    positivePrompt: "hero standing in city",
    negativePrompt: "blurry",
    referenceImageUrls: ["https://example.com/sceneKeyframes/city.jpg"],
    providerParams: {
      referencePolicy: "STRONG",
      panelCategory: "CHARACTER_LOCK",
    },
  };

  it("does NOT use Redux when referenceUrl is a sceneKeyframe", () => {
    const result = buildFalGenerationRequest(baseInput as any);
    expect(result.target.model).not.toContain("redux");
    expect(result.mode).toBe("text2img");
  });

  it("does NOT use Redux when referenceUrl is empty", () => {
    const result = buildFalGenerationRequest({
      ...baseInput,
      referenceImageUrls: [],
    } as any);
    expect(result.target.model).not.toContain("redux");
  });

  it("uses Redux when referenceUrl is a valid character reference", () => {
    const result = buildFalGenerationRequest({
      ...baseInput,
      referenceImageUrls: ["https://storage.example.com/characters/hero.jpg"],
    } as any);
    expect(result.target.model).toContain("redux");
    expect(result.mode).toBe("img2img");
  });

  it("does NOT use Redux when referenceUrl is an environment", () => {
    const result = buildFalGenerationRequest({
      ...baseInput,
      referenceImageUrls: ["https://example.com/environments/forest.jpg"],
    } as any);
    expect(result.target.model).not.toContain("redux");
  });

  it("uses metadata assetKind over URL path", () => {
    const result = buildFalGenerationRequest({
      ...baseInput,
      referenceImageUrls: ["https://example.com/characters/hero.jpg"],
      providerParams: {
        ...baseInput.providerParams,
        referenceMetadata: { assetKind: "scene_keyframe" },
      },
    } as any);
    expect(result.target.model).not.toContain("redux");
  });

  it("falls back to text2img mode when Redux is blocked", () => {
    const result = buildFalGenerationRequest({
      ...baseInput,
      referenceImageUrls: ["https://example.com/backgrounds/sunset.jpg"],
      providerParams: {
        referencePolicy: "STRONG",
        panelCategory: "CHARACTER_LOCK",
      },
    } as any);
    expect(result.mode).toBe("text2img");
  });
});
