import { describe, expect, it } from "vitest";
import { computeCanonPackScore } from "@/lib/characters/compute-canon-pack-score";

describe("computeCanonPackScore", () => {
  it("returns 0 for an empty character", () => {
    const r = computeCanonPackScore({
      name: null,
      roleType: null,
      gender: null,
      biography: null,
      objective: null,
      appearance: null,
      hairColor: null,
      eyeColor: null,
      outfitDefault: null,
      voiceRegister: null,
      voiceVocabularyStyle: null,
      stableVisualDNA: {},
      stableSpeechDNA: {},
      stablePsycheDNA: {},
      activeVisualRefCount: 0,
    });
    expect(r.score).toBe(0);
    expect(r.complete).toBe(false);
    expect(r.missing.length).toBeGreaterThan(10);
  });

  it("returns 1 when every axis is filled", () => {
    const r = computeCanonPackScore({
      name: "Marius",
      roleType: "MAIN_HERO",
      gender: "homme",
      biography: "Pêcheur devenu héros.",
      objective: "Sauver son village.",
      appearance: "Cicatrice sur la joue, regard ferme.",
      hairColor: "noir",
      eyeColor: "ambre",
      outfitDefault: "manteau de pêcheur usé",
      voiceRegister: "casual",
      voiceVocabularyStyle: "argot maritime",
      stableVisualDNA: { faceShape: "anguleux", silhouette: "athlétique" },
      stableSpeechDNA: { register: "casual", favoriteExpressions: ["par les vagues"] },
      stablePsycheDNA: { coreDesire: "protéger", coreFear: "perdre les siens" },
      activeVisualRefCount: 2,
    });
    expect(r.score).toBe(1);
    expect(r.complete).toBe(true);
    expect(r.missing).toHaveLength(0);
  });

  it("partial fill (only identity + appearance, no DNA, no refs) stays under 0.7", () => {
    const r = computeCanonPackScore({
      name: "Marius",
      roleType: "MAIN_HERO",
      gender: "homme",
      biography: "Pêcheur.",
      objective: "Sauver le village.",
      appearance: "Athlétique.",
      hairColor: "noir",
      eyeColor: "ambre",
      outfitDefault: "manteau",
      voiceRegister: null,
      voiceVocabularyStyle: null,
      stableVisualDNA: {},
      stableSpeechDNA: {},
      stablePsycheDNA: {},
      activeVisualRefCount: 0,
    });
    expect(r.score).toBeGreaterThanOrEqual(0.5);
    expect(r.complete).toBe(false);
    // Should pass the 0.5 threshold so the readiness "incomplete" warning
    // disappears even without DNA/refs (avoiding the previous 0% bug).
    expect(r.score).toBeGreaterThan(0.45);
  });

  it("ignores empty objects in DNA fields", () => {
    const r = computeCanonPackScore({
      name: "X",
      roleType: "MAIN_HERO",
      gender: "neutre",
      biography: "x",
      objective: "x",
      appearance: "x",
      hairColor: "x",
      eyeColor: "x",
      outfitDefault: "x",
      voiceRegister: "x",
      voiceVocabularyStyle: "x",
      // Empty objects must NOT count as DNA filled.
      stableVisualDNA: {},
      stableSpeechDNA: { register: "" }, // empty string also ignored
      stablePsycheDNA: { coreDesire: "x" }, // this one counts
      activeVisualRefCount: 1,
    });
    // Identity (1.0)*0.2 + appearance (1.0)*0.3 + voice (1.0)*0.1
    //   + dna (1/3)*0.2 + refs (0.2) = 0.2 + 0.3 + 0.1 + 0.067 + 0.2 = 0.867
    expect(r.score).toBeCloseTo(0.87, 1);
    expect(r.breakdown.stableDna).toBeCloseTo(0.07, 1);
  });
});
