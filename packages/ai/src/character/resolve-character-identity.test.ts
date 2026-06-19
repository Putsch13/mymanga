import { describe, it, expect } from "vitest";
import {
  resolveCharacterIdentity,
  type CharacterIdentitySource,
} from "./resolve-character-identity";

describe("resolveCharacterIdentity", () => {
  it("resolves a character populated only via visualProfile", () => {
    const source: CharacterIdentitySource = {
      name: "Kira",
      visualProfile: {
        hairColor: "silver",
        eyeColor: "amber",
        faceShape: "angular",
        skinTone: "olive",
        silhouetteType: "athletic",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "stern",
        typicalGaze: "piercing",
        habitualPosture: "upright",
        signatureGesture: "arms crossed",
        scars: "x-shaped scar on left cheek",
        tattoos: "tribal tattoo on right arm",
        accessories: "silver earring",
      },
      wardrobeProfile: {
        defaultOutfit: "dark trench coat",
        colorPalette: "dark tones",
      },
      roleType: "protagonist",
      traits: ["determined", "loyal"],
    };

    const identity = resolveCharacterIdentity(source);

    expect(identity.name).toBe("Kira");
    expect(identity.hairColor).toBe("silver");
    expect(identity.eyeColor).toBe("amber");
    expect(identity.faceShape).toBe("angular");
    expect(identity.skinTone).toBe("olive");
    expect(identity.silhouette).toBe("athletic");
    expect(identity.beard.present).toBe(false);
    expect(identity.mustache.present).toBe(false);
    expect(identity.restingFace).toBe("stern");
    expect(identity.typicalGaze).toBe("piercing");
    expect(identity.scars).toBe("x-shaped scar on left cheek");
    expect(identity.outfit).toBe("dark trench coat");
    expect(identity.colorPalette).toBe("dark tones");
    expect(identity.roleType).toBe("protagonist");
    expect(identity.traits).toEqual(["determined", "loyal"]);
  });

  it("stableVisualDNA takes precedence over visualProfile and flat columns", () => {
    const source: CharacterIdentitySource = {
      name: "Ren",
      gender: "male",
      hairColor: "brown",
      eyeColor: "blue",
      outfitDefault: "school uniform",
      visualProfile: {
        hairColor: "dark brown",
        eyeColor: "light blue",
        faceShape: "round",
      },
      stableVisualDNA: {
        hairColor: "jet black",
        eyeColor: "crimson",
        faceShape: "sharp",
        silhouette: "lean muscular",
        forbiddenVisualDrift: ["never change eye color"],
      },
    };

    const identity = resolveCharacterIdentity(source);

    expect(identity.hairColor).toBe("jet black");
    expect(identity.eyeColor).toBe("crimson");
    expect(identity.faceShape).toBe("sharp");
    expect(identity.silhouette).toBe("lean muscular");
    expect(identity.forbiddenVisualDrift).toContain("never change eye color");
  });

  it("empty character returns null/[]/false fields, never throws", () => {
    const source: CharacterIdentitySource = { name: "Empty" };

    const identity = resolveCharacterIdentity(source);

    expect(identity.name).toBe("Empty");
    expect(identity.gender).toBeNull();
    expect(identity.hairColor).toBeNull();
    expect(identity.eyeColor).toBeNull();
    expect(identity.hairStyle).toBeNull();
    expect(identity.eyeShape).toBeNull();
    expect(identity.faceShape).toBeNull();
    expect(identity.skinTone).toBeNull();
    expect(identity.silhouette).toBeNull();
    expect(identity.appearanceText).toBeNull();
    expect(identity.scars).toBeNull();
    expect(identity.tattoos).toBeNull();
    expect(identity.accessories).toBeNull();
    expect(identity.outfit).toBeNull();
    expect(identity.colorPalette).toBeNull();
    expect(identity.restingFace).toBeNull();
    expect(identity.typicalGaze).toBeNull();
    expect(identity.beard.present).toBe(false);
    expect(identity.mustache.present).toBe(false);
    expect(identity.sideburns).toBeNull();
    expect(identity.bodyMarkers).toEqual({
      leftArm: true,
      rightArm: true,
      leftEye: true,
      rightEye: true,
    });
    expect(identity.lockedVisualTraits).toEqual([]);
    expect(identity.forbiddenVisualDrift).toEqual([]);
    expect(identity.traits).toEqual([]);
    expect(identity.roleType).toBeNull();
    expect(identity.emotionalState).toBeNull();
  });

  it("body markers reflect bodyState correctly", () => {
    const source: CharacterIdentitySource = {
      name: "One-Arm",
      bodyState: {
        leftArmPresent: false,
        rightArmPresent: true,
        leftEyePresent: true,
        rightEyePresent: false,
      },
    };

    const identity = resolveCharacterIdentity(source);

    expect(identity.bodyMarkers.leftArm).toBe(false);
    expect(identity.bodyMarkers.rightArm).toBe(true);
    expect(identity.bodyMarkers.leftEye).toBe(true);
    expect(identity.bodyMarkers.rightEye).toBe(false);
  });

  it("merges locked traits from continuityProfile and forbidden drift from both DNA and continuity", () => {
    const source: CharacterIdentitySource = {
      name: "Locked",
      continuityProfile: {
        lockedVisualTraits: ["scar on face"],
        lockedBodyTraits: ["missing left arm"],
        forbiddenDrift: ["never restore left arm"],
      },
      stableVisualDNA: {
        forbiddenVisualDrift: ["never change hair color"],
      },
    };

    const identity = resolveCharacterIdentity(source);

    expect(identity.lockedVisualTraits).toEqual(["scar on face", "missing left arm"]);
    expect(identity.forbiddenVisualDrift).toEqual([
      "never change hair color",
      "never restore left arm",
    ]);
  });
});
