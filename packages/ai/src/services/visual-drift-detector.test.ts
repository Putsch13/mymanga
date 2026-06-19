import { describe, expect, it } from "vitest";
import { detectVisualDrift } from "./visual-drift-detector";

describe("detectVisualDrift", () => {
  it("retourne un score propre pour un personnage conforme", () => {
    const result = detectVisualDrift({
      prompt: "male hero with black hair, blue eyes, scar on cheek, dark school uniform, silver pendant",
      characters: [
        {
          name: "Miro",
          gender: "male",
          hairColor: "black",
          eyeColor: "blue",
          appearance: "scar on cheek",
          bodyDetails: null,
          outfitDefault: "dark school uniform",
          wardrobeDetails: "silver pendant",
          canonSignatureText: "black hair, blue eyes, scar on cheek",
          forbiddenVisualDrift: ["pink hair"],
          canonicalReferenceAvailable: true,
          accessorySignature: "silver pendant",
        },
      ],
      usedLoras: true,
      usedRefs: true,
    });

    expect(result.pass).toBe(true);
    expect(result.driftScore).toBeGreaterThanOrEqual(85);
    expect(result.severity).toBe("none");
    expect(result.conflictingTraits).toHaveLength(0);
  });

  it("détecte des traits critiques manquants", () => {
    const result = detectVisualDrift({
      prompt: "male hero in action pose",
      characters: [
        {
          name: "Aki",
          gender: "male",
          hairColor: "silver",
          eyeColor: "green",
          appearance: "long braid",
          bodyDetails: null,
          outfitDefault: "white coat",
          canonicalReferenceAvailable: false,
        },
      ],
      usedLoras: false,
      usedRefs: false,
    });

    expect(result.pass).toBe(false);
    expect(result.missingTraits.some((entry) => entry.trait === "hairColor")).toBe(true);
    expect(result.missingTraits.some((entry) => entry.trait === "eyeColor")).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it("détecte des traits contradictoires", () => {
    const result = detectVisualDrift({
      prompt: "female warrior with red hair and green eyes",
      characters: [
        {
          name: "Ren",
          gender: "male",
          hairColor: "black",
          eyeColor: "blue",
          bodyDetails: null,
          appearance: null,
        },
      ],
      usedLoras: false,
      usedRefs: false,
    });

    expect(result.conflictingTraits.some((entry) => entry.trait === "gender")).toBe(true);
    expect(result.conflictingTraits.some((entry) => entry.trait === "hairColor")).toBe(true);
    expect(result.severity === "high" || result.severity === "critical").toBe(true);
  });

  it("signale une incohérence forte quand le canon existe mais n'est pas verrouillé", () => {
    const result = detectVisualDrift({
      prompt: "female mage with blonde hair, red eyes, casual clothes, pink hair",
      characters: [
        {
          name: "Lune",
          gender: "female",
          hairColor: "blonde",
          eyeColor: "red",
          bodyDetails: null,
          appearance: null,
          canonSignatureText: "gold-trim cloak, moon pendant",
          forbiddenVisualDrift: ["pink hair"],
          canonicalReferenceAvailable: true,
          outfitDefault: "gold-trim cloak",
          accessorySignature: "moon pendant",
        },
      ],
      usedLoras: false,
      usedRefs: false,
    });

    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("référence canonique disponible"))).toBe(true);
    expect(result.conflictingTraits.some((entry) => entry.trait === "forbiddenVisualDrift")).toBe(true);
  });
});
