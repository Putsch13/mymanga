import { describe, it, expect } from "vitest";
import {
  computeCanonStabilityScore,
  extractStabilitySignals,
} from "@/lib/canon/compute-canon-stability-score";

describe("computeCanonStabilityScore (P7.1)", () => {
  it("tous signaux ok, pas de drift → HARD_LOCK", () => {
    const r = computeCanonStabilityScore({
      hasStableCanonicalRef: true,
      hasActiveVisualLock: true,
      hasFingerprint: true,
      hasHardTraits: true,
      hasDefaultOutfit: true,
      idFirstResolution: true,
      recentDriftHardViolations: 0,
    });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe("HARD_LOCK");
    expect(r.missing).toEqual([]);
  });

  it("aucun signal → UNKNOWN", () => {
    const r = computeCanonStabilityScore({
      hasStableCanonicalRef: false,
      hasActiveVisualLock: false,
      hasFingerprint: false,
      hasHardTraits: false,
      hasDefaultOutfit: false,
      idFirstResolution: false,
      recentDriftHardViolations: 0,
    });
    expect(r.score).toBeLessThan(20);
    expect(r.level).toBe("UNKNOWN");
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("pénalité drift hard récents abaisse le niveau", () => {
    const withoutDrift = computeCanonStabilityScore({
      hasStableCanonicalRef: true,
      hasActiveVisualLock: true,
      hasFingerprint: true,
      hasHardTraits: true,
      hasDefaultOutfit: true,
      idFirstResolution: true,
      recentDriftHardViolations: 0,
    });
    const withDrift = computeCanonStabilityScore({
      hasStableCanonicalRef: true,
      hasActiveVisualLock: true,
      hasFingerprint: true,
      hasHardTraits: true,
      hasDefaultOutfit: true,
      idFirstResolution: true,
      recentDriftHardViolations: 3,
    });
    expect(withDrift.score).toBeLessThan(withoutDrift.score);
  });

  it("missing liste précisément les signaux manquants", () => {
    const r = computeCanonStabilityScore({
      hasStableCanonicalRef: false,
      hasActiveVisualLock: true,
      hasFingerprint: true,
      hasHardTraits: false,
      hasDefaultOutfit: true,
      idFirstResolution: true,
      recentDriftHardViolations: 0,
    });
    expect(r.missing).toContain("hasStableCanonicalRef");
    expect(r.missing).toContain("hasHardTraits");
    expect(r.missing).not.toContain("hasActiveVisualLock");
  });
});

describe("extractStabilitySignals (P7.1)", () => {
  it("personnage complet → tous signaux true", () => {
    const s = extractStabilitySignals({
      characterFingerprint: { hardTraits: ["red left eye"] },
      stableVisualDNA: {},
      outfitDefault: "uniforme bleu",
      visualLocks: [{ isActive: true }],
      visualRefs: [{ imageUrl: "https://xxx.supabase.co/x.png" }],
      idFirstResolution: true,
      recentDriftHardViolations: 0,
    });
    expect(s.hasStableCanonicalRef).toBe(true);
    expect(s.hasActiveVisualLock).toBe(true);
    expect(s.hasFingerprint).toBe(true);
    expect(s.hasHardTraits).toBe(true);
    expect(s.hasDefaultOutfit).toBe(true);
    expect(s.idFirstResolution).toBe(true);
  });

  it("personnage vide → tous signaux false", () => {
    const s = extractStabilitySignals({});
    expect(s.hasStableCanonicalRef).toBe(false);
    expect(s.hasActiveVisualLock).toBe(false);
    expect(s.hasFingerprint).toBe(false);
    expect(s.hasHardTraits).toBe(false);
    expect(s.hasDefaultOutfit).toBe(false);
    expect(s.idFirstResolution).toBe(false);
  });

  it("hardTraits détectés depuis fingerprint.hardTraits OU dna.scars/tattoos", () => {
    expect(
      extractStabilitySignals({ stableVisualDNA: { scars: ["joue gauche"] } }).hasHardTraits,
    ).toBe(true);
    expect(
      extractStabilitySignals({ stableVisualDNA: { tattoos: ["dragon"] } }).hasHardTraits,
    ).toBe(true);
  });

  it("refs archivées ne comptent pas comme stable", () => {
    const s = extractStabilitySignals({
      visualRefs: [{ imageUrl: "https://xxx.supabase.co/x.png", archivedAt: new Date() }],
    });
    expect(s.hasStableCanonicalRef).toBe(false);
  });
});
