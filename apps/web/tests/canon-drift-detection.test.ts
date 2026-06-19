import { describe, it, expect } from "vitest";
import { detectCanonVisualDrift } from "@/lib/characters/detect-canon-visual-drift";

describe("detectCanonVisualDrift (P1.6)", () => {
  const base = {
    appearance: "cheveux noirs, 18 ans",
    hairColor: "noir",
    eyeColor: "rouge",
    outfitDefault: "uniforme blanc",
    visualProfile: { heightCm: 170 },
    bodyState: { scars: ["joue"] },
    wardrobeProfile: { default: "uniforme" },
    stableVisualDNA: { eyeColor: "rouge" },
  };

  it("aucun delta → hasDrift=false", () => {
    const r = detectCanonVisualDrift(base, base);
    expect(r.hasDrift).toBe(false);
    expect(r.changedAxes).toEqual([]);
    expect(r.critical).toEqual([]);
  });

  it("changement hairColor → critique", () => {
    const r = detectCanonVisualDrift(base, { ...base, hairColor: "blanc" });
    expect(r.hasDrift).toBe(true);
    expect(r.changedAxes).toContain("hairColor");
    expect(r.critical).toContain("hairColor");
  });

  it("changement outfitDefault → non critique", () => {
    const r = detectCanonVisualDrift(base, { ...base, outfitDefault: "uniforme noir" });
    expect(r.hasDrift).toBe(true);
    expect(r.changedAxes).toContain("outfitDefault");
    expect(r.critical).not.toContain("outfitDefault");
  });

  it("bodyState modifié → critique", () => {
    const r = detectCanonVisualDrift(base, {
      ...base,
      bodyState: { scars: ["joue", "poignet"] },
    });
    expect(r.critical).toContain("bodyState");
  });

  it("multiple changes accumulés", () => {
    const r = detectCanonVisualDrift(base, {
      ...base,
      hairColor: "gris",
      eyeColor: "bleu",
      outfitDefault: "civil",
    });
    expect(r.changedAxes.sort()).toEqual(["eyeColor", "hairColor", "outfitDefault"]);
    expect(r.critical.sort()).toEqual(["eyeColor", "hairColor"]);
  });

  it("null/undefined sur initial traité comme absence (équivalent)", () => {
    const r = detectCanonVisualDrift(
      { appearance: null, hairColor: undefined },
      { appearance: null, hairColor: undefined },
    );
    expect(r.hasDrift).toBe(false);
  });
});
