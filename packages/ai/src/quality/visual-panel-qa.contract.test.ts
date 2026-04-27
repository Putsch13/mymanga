/**
 * visual-panel-qa.contract.test.ts
 *
 * P1.18 — Tests pour la QA visuelle contractuelle.
 */

import { describe, it, expect } from "vitest";

interface VisualQaContract {
  panelId: string;
  requiredCharacters: Array<{
    name: string;
    visualFingerprint: {
      hairColor?: string;
      clothingStyle?: string;
      distinctiveFeatures?: string[];
    };
  }>;
  requiredLocation?: {
    name: string;
    visualMarkers?: string[];
  };
  forbiddenElements?: string[];
}

interface VisualQaResult {
  panelId: string;
  passed: boolean;
  score: number;
  characterMatches: Array<{
    name: string;
    found: boolean;
    matchScore: number;
    issues: string[];
  }>;
  locationMatch?: {
    found: boolean;
    matchScore: number;
  };
  forbiddenFound: string[];
  overallIssues: string[];
}

function runVisualQaContract(
  contract: VisualQaContract,
  imageAnalysis: {
    detectedPeople: Array<{ description: string }>;
    detectedLocation: string;
    detectedObjects: string[];
  }
): VisualQaResult {
  const characterMatches = contract.requiredCharacters.map((reqChar) => {
    const found = imageAnalysis.detectedPeople.some((p) =>
      p.description.toLowerCase().includes(reqChar.name.toLowerCase())
    );

    const issues: string[] = [];
    if (!found) {
      issues.push(`character_not_detected:${reqChar.name}`);
    }

    const hairMatch =
      !reqChar.visualFingerprint.hairColor ||
      imageAnalysis.detectedPeople.some((p) =>
        p.description.toLowerCase().includes(reqChar.visualFingerprint.hairColor!.toLowerCase())
      );

    if (!hairMatch) {
      issues.push(`hair_color_mismatch:${reqChar.name}`);
    }

    const matchScore = found ? (hairMatch ? 1.0 : 0.7) : 0;

    return {
      name: reqChar.name,
      found,
      matchScore,
      issues,
    };
  });

  let locationMatch: VisualQaResult["locationMatch"];
  if (contract.requiredLocation) {
    const found = imageAnalysis.detectedLocation
      .toLowerCase()
      .includes(contract.requiredLocation.name.toLowerCase());

    locationMatch = {
      found,
      matchScore: found ? 1.0 : 0,
    };
  }

  const forbiddenFound = (contract.forbiddenElements ?? []).filter((elem) =>
    imageAnalysis.detectedObjects.some((obj) =>
      obj.toLowerCase().includes(elem.toLowerCase())
    )
  );

  const overallIssues: string[] = [];
  if (characterMatches.some((c) => !c.found)) {
    overallIssues.push("missing_required_characters");
  }
  if (locationMatch && !locationMatch.found) {
    overallIssues.push("location_mismatch");
  }
  if (forbiddenFound.length > 0) {
    overallIssues.push("forbidden_elements_present");
  }

  const avgCharScore =
    characterMatches.length > 0
      ? characterMatches.reduce((sum, c) => sum + c.matchScore, 0) / characterMatches.length
      : 1;

  const locationScore = locationMatch ? locationMatch.matchScore : 1;
  const forbiddenPenalty = forbiddenFound.length * 0.2;

  const score = Math.max(0, (avgCharScore + locationScore) / 2 - forbiddenPenalty);

  return {
    panelId: contract.panelId,
    passed: score >= 0.7 && overallIssues.length === 0,
    score,
    characterMatches,
    locationMatch,
    forbiddenFound,
    overallIssues,
  };
}

describe("runVisualQaContract", () => {
  it("should pass for matching image", () => {
    const result = runVisualQaContract(
      {
        panelId: "panel-1",
        requiredCharacters: [
          {
            name: "Marius",
            visualFingerprint: { hairColor: "black" },
          },
        ],
        requiredLocation: { name: "port" },
      },
      {
        detectedPeople: [{ description: "Marius, a man with black hair" }],
        detectedLocation: "A busy port with ships",
        detectedObjects: ["boat", "rope", "water"],
      }
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.characterMatches[0].found).toBe(true);
  });

  it("should fail for missing character", () => {
    const result = runVisualQaContract(
      {
        panelId: "panel-2",
        requiredCharacters: [
          {
            name: "Maya",
            visualFingerprint: { hairColor: "blonde" },
          },
        ],
      },
      {
        detectedPeople: [{ description: "A man standing alone" }],
        detectedLocation: "Unknown",
        detectedObjects: [],
      }
    );

    expect(result.passed).toBe(false);
    expect(result.characterMatches[0].found).toBe(false);
    expect(result.overallIssues).toContain("missing_required_characters");
  });

  it("should detect forbidden elements", () => {
    const result = runVisualQaContract(
      {
        panelId: "panel-3",
        requiredCharacters: [],
        forbiddenElements: ["smartphone", "car"],
      },
      {
        detectedPeople: [],
        detectedLocation: "Medieval castle",
        detectedObjects: ["smartphone", "sword", "armor"],
      }
    );

    expect(result.forbiddenFound).toContain("smartphone");
    expect(result.overallIssues).toContain("forbidden_elements_present");
  });

  it("should detect hair color mismatch", () => {
    const result = runVisualQaContract(
      {
        panelId: "panel-4",
        requiredCharacters: [
          {
            name: "Hero",
            visualFingerprint: { hairColor: "red" },
          },
        ],
      },
      {
        detectedPeople: [{ description: "Hero with blonde hair" }],
        detectedLocation: "Forest",
        detectedObjects: [],
      }
    );

    expect(result.characterMatches[0].issues).toContain("hair_color_mismatch:Hero");
    expect(result.characterMatches[0].matchScore).toBeLessThan(1);
  });

  it("should fail for location mismatch", () => {
    const result = runVisualQaContract(
      {
        panelId: "panel-5",
        requiredCharacters: [],
        requiredLocation: { name: "beach" },
      },
      {
        detectedPeople: [],
        detectedLocation: "A dark forest",
        detectedObjects: ["tree", "mushroom"],
      }
    );

    expect(result.locationMatch?.found).toBe(false);
    expect(result.overallIssues).toContain("location_mismatch");
  });
});

describe("Visual QA scoring", () => {
  it("should give perfect score for perfect match", () => {
    const result = runVisualQaContract(
      {
        panelId: "perfect",
        requiredCharacters: [
          { name: "A", visualFingerprint: { hairColor: "black" } },
          { name: "B", visualFingerprint: { hairColor: "blonde" } },
        ],
        requiredLocation: { name: "castle" },
      },
      {
        detectedPeople: [
          { description: "A with black hair" },
          { description: "B with blonde hair" },
        ],
        detectedLocation: "A medieval castle",
        detectedObjects: [],
      }
    );

    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("should penalize for forbidden elements", () => {
    const result = runVisualQaContract(
      {
        panelId: "forbidden",
        requiredCharacters: [],
        forbiddenElements: ["phone", "car", "laptop"],
      },
      {
        detectedPeople: [],
        detectedLocation: "Scene",
        detectedObjects: ["phone", "car"],
      }
    );

    expect(result.score).toBeLessThan(1);
    expect(result.forbiddenFound).toHaveLength(2);
  });
});
