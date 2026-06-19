import { describe, it, expect } from "vitest";
import { resolveCharacterIdentity } from "./resolve-character-identity";
import { buildCharacterImagePrompt } from "./build-character-image-prompt";

describe("buildCharacterImagePrompt", () => {
  it("produces a positive prompt with all resolved identity fields", () => {
    const identity = resolveCharacterIdentity({
      name: "Yuki",
      gender: "female",
      hairColor: "black",
      eyeColor: "green",
      appearance: "tall and slender",
      outfitDefault: "red kimono",
      roleType: "protagonist",
      emotionalState: "determined",
      traits: ["brave", "stubborn"],
      visualProfile: {
        faceShape: "oval",
        skinTone: "fair",
      },
    });

    const result = buildCharacterImagePrompt(identity, {
      projectVisualStyle: "shonen manga",
      contentIntensityLayer: "TEEN",
    });

    expect(result.positive).toContain("Yuki");
    expect(result.positive).toContain("black hair");
    expect(result.positive).toContain("green eyes");
    expect(result.positive).toContain("oval face");
    expect(result.positive).toContain("fair skin");
    expect(result.positive).toContain("red kimono");
    expect(result.positive).toContain("heroic stance");
    expect(result.positive).toContain("determined expression");
    expect(result.negative).toContain("nudity");
  });

  it("uses creature composer for non-human entityKind", () => {
    const identity = resolveCharacterIdentity({
      name: "Drakon",
      entityKind: "dragon",
      speciesLabel: "fire dragon",
    });

    const result = buildCharacterImagePrompt(identity);

    expect(result.positive).toContain("fire dragon");
    expect(result.positive).toContain("dragon");
    expect(result.negative).toContain("human face");
  });

  it("throws on RESTRICTED_BLOCKED_VISUAL", () => {
    const identity = resolveCharacterIdentity({ name: "Blocked" });

    expect(() =>
      buildCharacterImagePrompt(identity, {
        contentIntensityLayer: "RESTRICTED_BLOCKED_VISUAL",
      }),
    ).toThrow("Content blocked");
  });

  it("does not forbid beard in negative when female has beardPresent", () => {
    const identity = resolveCharacterIdentity({
      name: "Elena",
      gender: "female",
      visualProfile: {
        beardPresent: true,
        beardStyle: "full beard",
        beardDensity: "dense",
      },
    });

    const result = buildCharacterImagePrompt(identity);
    expect(result.positive).toContain("facial hair:");
    expect(result.positive).toContain("full beard");
    expect(result.negative).not.toMatch(/beard, facial hair/);
  });

  it("serializes beard parts without empty commas", () => {
    const identity = resolveCharacterIdentity({
      name: "Marc",
      gender: "male",
      visualProfile: {
        beardPresent: true,
        beardStyle: "goatee",
        beardDensity: "dense",
        beardColor: "black",
      },
    });

    const result = buildCharacterImagePrompt(identity);
    expect(result.positive).toContain("facial hair: goatee, dense density, black colored");
    expect(result.positive).not.toContain("facial hair: goatee,,");
  });

  it("includes forbidden visual drift in negative prompt", () => {
    const identity = resolveCharacterIdentity({
      name: "Scar",
      stableVisualDNA: {
        forbiddenVisualDrift: ["never remove scar"],
      },
    });

    const result = buildCharacterImagePrompt(identity);
    expect(result.negative).toContain("never remove scar");
  });
});
