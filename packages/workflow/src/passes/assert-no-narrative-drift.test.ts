/**
 * assert-no-narrative-drift.test.ts
 *
 * P1.18 — Tests pour la détection de dérive narrative.
 */

import { describe, it, expect } from "vitest";

interface NarrativeDriftCheckInput {
  originalBeatText: string;
  generatedPanelDescription: string;
  requiredCharacters: string[];
  requiredActions: string[];
  requiredLocations: string[];
}

interface NarrativeDriftResult {
  hasDrift: boolean;
  driftScore: number;
  missingCharacters: string[];
  missingActions: string[];
  missingLocations: string[];
  addedElements: string[];
}

function checkNarrativeDrift(input: NarrativeDriftCheckInput): NarrativeDriftResult {
  const description = input.generatedPanelDescription.toLowerCase();

  const missingCharacters = input.requiredCharacters.filter(
    (c) => !description.includes(c.toLowerCase())
  );

  const missingActions = input.requiredActions.filter(
    (a) => !description.includes(a.toLowerCase())
  );

  const missingLocations = input.requiredLocations.filter(
    (l) => !description.includes(l.toLowerCase())
  );

  const addedPatterns = [
    /smartphone|phone|mobile/i,
    /computer|laptop/i,
    /car|vehicle/i,
    /modern|contemporary/i,
  ];

  const addedElements = addedPatterns
    .filter((p) => p.test(input.generatedPanelDescription))
    .map((p) => p.source);

  const totalRequired =
    input.requiredCharacters.length +
    input.requiredActions.length +
    input.requiredLocations.length;

  const totalMissing =
    missingCharacters.length + missingActions.length + missingLocations.length;

  const driftScore =
    totalRequired > 0 ? totalMissing / totalRequired + addedElements.length * 0.2 : 0;

  return {
    hasDrift: driftScore > 0.3,
    driftScore,
    missingCharacters,
    missingActions,
    missingLocations,
    addedElements,
  };
}

function assertNoNarrativeDrift(
  input: NarrativeDriftCheckInput,
  isPremium: boolean
): void {
  if (!isPremium) return;

  const result = checkNarrativeDrift(input);

  if (result.hasDrift) {
    throw new Error(
      `E_NARRATIVE_DRIFT: score=${result.driftScore.toFixed(2)}, ` +
      `missing=[${[...result.missingCharacters, ...result.missingActions].join(", ")}], ` +
      `added=[${result.addedElements.join(", ")}]`
    );
  }
}

describe("checkNarrativeDrift", () => {
  it("should detect missing characters", () => {
    const result = checkNarrativeDrift({
      originalBeatText: "Marius et Maya discutent au port",
      generatedPanelDescription: "Un homme seul regarde la mer",
      requiredCharacters: ["Marius", "Maya"],
      requiredActions: ["discuter"],
      requiredLocations: ["port"],
    });

    expect(result.missingCharacters).toContain("Marius");
    expect(result.missingCharacters).toContain("Maya");
    expect(result.hasDrift).toBe(true);
  });

  it("should detect added anachronistic elements", () => {
    const result = checkNarrativeDrift({
      originalBeatText: "Le chevalier chevauche vers le château",
      generatedPanelDescription:
        "Le chevalier prend son smartphone pour appeler le château",
      requiredCharacters: ["chevalier"],
      requiredActions: ["chevaucher"],
      requiredLocations: ["château"],
    });

    expect(result.addedElements.length).toBeGreaterThan(0);
  });

  it("should pass for faithful generation", () => {
    const result = checkNarrativeDrift({
      originalBeatText: "Marius regarde Maya avec inquiétude au port",
      generatedPanelDescription:
        "Marius se tient près de Maya, son visage exprimant l'inquiétude, les bateaux du port en arrière-plan",
      requiredCharacters: ["Marius", "Maya"],
      requiredActions: ["regarde"],
      requiredLocations: ["port"],
    });

    expect(result.hasDrift).toBe(false);
    expect(result.driftScore).toBeLessThan(0.3);
  });
});

describe("assertNoNarrativeDrift", () => {
  it("should throw for drift in premium mode", () => {
    expect(() =>
      assertNoNarrativeDrift(
        {
          originalBeatText: "Marius et Maya au port",
          generatedPanelDescription: "Une scène vide de personnages",
          requiredCharacters: ["Marius", "Maya"],
          requiredActions: [],
          requiredLocations: ["port"],
        },
        true
      )
    ).toThrow(/E_NARRATIVE_DRIFT/);
  });

  it("should not throw for faithful generation in premium mode", () => {
    expect(() =>
      assertNoNarrativeDrift(
        {
          originalBeatText: "Marius combat l'ennemi",
          generatedPanelDescription: "Marius engage le combat et frappe l'ennemi avec son épée",
          requiredCharacters: ["Marius"],
          requiredActions: ["combat"],
          requiredLocations: [],
        },
        true
      )
    ).not.toThrow();
  });

  it("should not throw in non-premium mode", () => {
    expect(() =>
      assertNoNarrativeDrift(
        {
          originalBeatText: "Important scene",
          generatedPanelDescription: "Completely different scene",
          requiredCharacters: ["Hero"],
          requiredActions: ["fight"],
          requiredLocations: ["castle"],
        },
        false
      )
    ).not.toThrow();
  });
});
