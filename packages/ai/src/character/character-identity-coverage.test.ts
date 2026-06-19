import { describe, it, expect } from "vitest";
import { resolveCharacterIdentity } from "./resolve-character-identity";
import { buildCharacterImagePrompt } from "./build-character-image-prompt";

describe("Character identity coverage", () => {
  it("round-trip: configurateur (visualProfile) → prompt contains all fields", () => {
    const identity = resolveCharacterIdentity({
      name: "Miya",
      visualProfile: {
        hairColor: "platinum blonde",
        hairStyle: "twin tails",
        eyeColor: "violet",
        eyeShape: "almond",
        faceShape: "heart-shaped",
        skinTone: "porcelain",
        silhouetteType: "petite",
        beardPresent: false,
        mustachePresent: false,
        scars: "faint scar on left temple",
        tattoos: "rose tattoo on shoulder",
        accessories: "silver choker",
        restingFace: "soft smile",
        typicalGaze: "curious",
        habitualPosture: "slightly tilted head",
        signatureGesture: "plays with hair",
      },
      wardrobeProfile: {
        defaultOutfit: "sailor fuku",
        colorPalette: "pastel blues",
      },
      roleType: "protagonist",
      emotionalState: "happy",
      traits: ["kind", "impulsive"],
    });

    const prompt = buildCharacterImagePrompt(identity, {
      projectVisualStyle: "shojo manga",
    });

    expect(prompt.positive).toContain("platinum blonde hair");
    expect(prompt.positive).toContain("twin tails hairstyle");
    expect(prompt.positive).toContain("violet eyes");
    expect(prompt.positive).toContain("heart-shaped face");
    expect(prompt.positive).toContain("porcelain skin");
    expect(prompt.positive).toContain("petite silhouette");
    expect(prompt.positive).toContain("faint scar on left temple");
    expect(prompt.positive).toContain("rose tattoo on shoulder");
    expect(prompt.positive).toContain("silver choker");
    expect(prompt.positive).toContain("sailor fuku");
    expect(prompt.positive).toContain("pastel blues");
    expect(prompt.positive).toContain("resting face: soft smile");
  });

  it("stableVisualDNA wins over visualProfile and flat columns", () => {
    const identity = resolveCharacterIdentity({
      name: "Kael",
      hairColor: "brown",
      eyeColor: "blue",
      visualProfile: {
        hairColor: "dark brown",
        eyeColor: "light blue",
        faceShape: "round",
      },
      stableVisualDNA: {
        hairColor: "silver white",
        eyeColor: "golden",
        faceShape: "angular",
        silhouette: "tall lean",
        forbiddenVisualDrift: ["never change eye color to blue"],
      },
    });

    expect(identity.hairColor).toBe("silver white");
    expect(identity.eyeColor).toBe("golden");
    expect(identity.faceShape).toBe("angular");
    expect(identity.silhouette).toBe("tall lean");

    const prompt = buildCharacterImagePrompt(identity);
    expect(prompt.positive).toContain("silver white hair");
    expect(prompt.positive).toContain("golden eyes");
    expect(prompt.positive).not.toContain("brown hair");
    expect(prompt.positive).not.toContain("blue eyes");
    expect(prompt.negative).toContain("never change eye color to blue");
  });

  it("graceful degradation: empty character → valid prompt, no exception", () => {
    const identity = resolveCharacterIdentity({ name: "Ghost" });
    const prompt = buildCharacterImagePrompt(identity);

    expect(prompt.positive).toContain("Ghost");
    expect(prompt.positive).toContain("manga character portrait");
    expect(prompt.positive.length).toBeGreaterThan(50);
    expect(prompt.negative.length).toBeGreaterThan(20);
    expect(prompt.imageSize).toBe("portrait_3_4");
  });

  it("no duplicate info in positive prompt", () => {
    const identity = resolveCharacterIdentity({
      name: "Duplicator",
      hairColor: "red",
      eyeColor: "green",
      visualProfile: {
        hairColor: "red",
        eyeColor: "green",
      },
      stableVisualDNA: {
        hairColor: "red",
        eyeColor: "green",
      },
    });

    const prompt = buildCharacterImagePrompt(identity);
    const redHairMatches = prompt.positive.match(/red hair/gi) ?? [];
    const greenEyeMatches = prompt.positive.match(/green eyes/gi) ?? [];

    expect(redHairMatches.length).toBe(1);
    expect(greenEyeMatches.length).toBe(1);
  });
});
