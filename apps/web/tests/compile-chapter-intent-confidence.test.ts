import { describe, expect, it } from "vitest";
import type { ChapterIntentContract } from "@manga-ai-studio/core";
import { recomputeConfidenceFromContract } from "@/lib/chapter-intent/compile-chapter-intent";

function baseContract(overrides: Partial<ChapterIntentContract> = {}): ChapterIntentContract {
  return {
    rawUserIntent: "",
    understoodPitch: "",
    mustInclude: [],
    mustAvoid: [],
    requiredCharacters: [],
    requiredLocations: [],
    requiredNpcs: [],
    requiredCreatures: [],
    requiredProps: [],
    emotionalGoal: "",
    plotGoal: "",
    characterArcGoal: "",
    tone: "",
    pacing: "balanced",
    dialogueDensity: "medium",
    expectedCliffhanger: false,
    ambiguityFlags: [],
    confidenceScore: 0,
    ...overrides,
  };
}

describe("recomputeConfidenceFromContract", () => {
  it("retourne ~0 sur un contrat vide", () => {
    const score = recomputeConfidenceFromContract(baseContract());
    expect(score).toBeLessThanOrEqual(0.2);
  });

  it("dépasse le seuil de 0.5 dès qu'un pitch + plot goal + 1 perso sont définis", () => {
    const score = recomputeConfidenceFromContract(
      baseContract({
        understoodPitch: "Marius part en mer chercher la créature qui a tué son père et affronte sa peur.",
        plotGoal: "Marius confronte la créature",
        requiredCharacters: ["Marius"],
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it("monte au-dessus de 0.7 sur un pitch riche (perso + lieu + arc + cliffhanger)", () => {
    const score = recomputeConfidenceFromContract(
      baseContract({
        understoodPitch:
          "Marius retrouve Maya sur le port abandonné. Confrontation avec les pêcheurs corrompus, révélation de la trahison.",
        mustInclude: ["confrontation pêcheurs", "révélation trahison Maya"],
        requiredCharacters: ["Marius", "Maya"],
        requiredLocations: ["Port abandonné"],
        emotionalGoal: "tension morale, doute",
        characterArcGoal: "Marius accepte sa propre culpabilité",
        tone: "sombre, tragique",
        pacing: "fast",
        expectedCliffhanger: true,
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("garantit minimum 0.55 si pitch ≥ 100 chars + 2 entités précises (plancher anti-blocage)", () => {
    const longPitch = "A".repeat(120);
    const score = recomputeConfidenceFromContract(
      baseContract({
        understoodPitch: longPitch,
        mustInclude: ["évènement A"],
        requiredCharacters: ["Marius"],
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.55);
  });

  it("ne dépasse jamais 1", () => {
    const score = recomputeConfidenceFromContract(
      baseContract({
        understoodPitch: "B".repeat(500),
        mustInclude: Array.from({ length: 10 }, (_, i) => `event_${i}`),
        requiredCharacters: Array.from({ length: 5 }, (_, i) => `char_${i}`),
        requiredLocations: ["L1", "L2"],
        requiredNpcs: ["N1", "N2"],
        emotionalGoal: "x",
        characterArcGoal: "y",
        plotGoal: "z",
        tone: "dramatique",
        pacing: "fast",
        dialogueDensity: "high",
        expectedCliffhanger: true,
      }),
    );
    expect(score).toBeLessThanOrEqual(1);
  });

  it("donne un score moyen (~0.3-0.5) sur un pitch minimaliste sans entités", () => {
    const score = recomputeConfidenceFromContract(
      baseContract({
        understoodPitch: "Marius part à l'aventure.",
        plotGoal: "trouver le trésor",
      }),
    );
    expect(score).toBeGreaterThanOrEqual(0.2);
    expect(score).toBeLessThan(0.6);
  });
});
