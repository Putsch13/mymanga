import { describe, expect, it } from "vitest";
import {
  buildCharacterRetryHints,
  serializeBodyStateForPrompt,
  serializeWardrobeProfileForPrompt,
} from "@/lib/retry/build-character-retry-hints";

describe("serializeBodyStateForPrompt (P1.4)", () => {
  it("retourne null pour null/undefined/vide", () => {
    expect(serializeBodyStateForPrompt(null)).toBeNull();
    expect(serializeBodyStateForPrompt(undefined)).toBeNull();
    expect(serializeBodyStateForPrompt("")).toBeNull();
    expect(serializeBodyStateForPrompt("   ")).toBeNull();
  });

  it("retourne une string trim pour une string non vide", () => {
    expect(serializeBodyStateForPrompt("  lean muscular  ")).toBe("lean muscular");
  });

  it("concatène un array de strings par virgules", () => {
    expect(serializeBodyStateForPrompt(["tall build", "scar right eye", "prosthetic left arm"]))
      .toBe("tall build, scar right eye, prosthetic left arm");
  });

  it("sérialise un objet structuré sans [object Object]", () => {
    const out = serializeBodyStateForPrompt({
      build: "athletic",
      height: "180cm",
      scars: ["right eye", "forehead"],
      prosthetics: ["left arm"],
    });
    expect(out).toContain("build: athletic");
    expect(out).toContain("height: 180cm");
    expect(out).toContain("scars (right eye, forehead)");
    expect(out).toContain("prosthetics (left arm)");
    expect(out).not.toContain("[object Object]");
  });
});

describe("serializeWardrobeProfileForPrompt (P1.4)", () => {
  it("structure default + alt outfits", () => {
    const out = serializeWardrobeProfileForPrompt({
      default: "leather jacket, jeans",
      altOutfits: ["school uniform", "tuxedo"],
      outfitLock: true,
    });
    expect(out).toContain("default outfit: leather jacket, jeans");
    expect(out).toContain("alt outfits (school uniform, tuxedo)");
    expect(out).toContain("outfit lock: strict");
  });

  it("gère un array brut", () => {
    expect(serializeWardrobeProfileForPrompt(["jacket", "jeans"])).toBe("jacket, jeans");
  });
});

describe("buildCharacterRetryHints (P1.3)", () => {
  it("fournit un fallback générique si target null", () => {
    const hints = buildCharacterRetryHints(null);
    expect(hints.positive).toContain("preserve character identity");
    expect(hints.negative).toContain("identity drift");
  });

  it("protège le physique dur depuis bodyState + stableVisualDNA", () => {
    const hints = buildCharacterRetryHints({
      name: "Kaori",
      characterFingerprint: { hairColor: "black", eyeColor: "grey", gender: "female" },
      bodyState: { build: "athletic", scars: ["right eye"], prosthetics: ["left hand"] },
      wardrobeProfile: { default: "school uniform", outfitLock: true },
      outfitDefault: "school uniform",
      stableVisualDNA: { forbiddenVisualDrift: ["blonde hair", "blue eyes"] },
    });
    expect(hints.positive).toContain("Kaori");
    expect(hints.positive).toContain("hair (black)");
    expect(hints.positive).toContain("eyes (grey)");
    expect(hints.positive).toContain("body state");
    expect(hints.positive).toContain("scars (right eye)");
    expect(hints.positive).toContain("prosthetics (left hand)");
    expect(hints.positive).toContain("wardrobe profile");
    expect(hints.positive).toContain("default outfit: school uniform");
    expect(hints.negative).toContain("wrong face for Kaori");
    expect(hints.negative).toContain("wrong outfit for Kaori");
    expect(hints.negative).toContain("blonde hair");
    expect(hints.negative).toContain("blue eyes");
  });

  it("n'imprime aucun [object Object] même avec un bodyState complexe imbriqué", () => {
    const hints = buildCharacterRetryHints({
      name: "Ren",
      bodyState: { build: "lean", customField: { nested: { deep: "value" } } },
      wardrobeProfile: { nonStandardField: { a: 1 } },
    });
    expect(hints.positive).not.toContain("[object Object]");
    expect(hints.negative).not.toContain("[object Object]");
  });

  it("fusionne forbiddenVisualDrift direct + DNA", () => {
    const hints = buildCharacterRetryHints({
      name: "Asuka",
      forbiddenVisualDrift: ["modern clothing"],
      stableVisualDNA: { forbiddenVisualDrift: ["human face"] },
    });
    expect(hints.negative).toContain("modern clothing");
    expect(hints.negative).toContain("human face");
  });
});
