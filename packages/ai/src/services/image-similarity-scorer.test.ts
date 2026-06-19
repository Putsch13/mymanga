import { describe, it, expect } from "vitest";
import { aggregateSimilarityScores } from "./image-similarity-scorer";

describe("aggregateSimilarityScores", () => {
  it("renvoie null si tous les scores sont skipped", () => {
    const result = aggregateSimilarityScores([
      {
        characterName: "Hero",
        score: {
          overallScore: 0,
          faceScore: 0,
          hairScore: 0,
          outfitScore: 0,
          confidence: 0,
          findings: [],
          model: "gpt-4o-mini",
          skipped: "no_openai_api_key",
        },
      },
    ]);
    expect(result).toBeNull();
  });

  it("calcule la moyenne et le min sur les scores utilisables", () => {
    const result = aggregateSimilarityScores([
      {
        characterName: "Hero",
        score: {
          overallScore: 0.8,
          faceScore: 0.85,
          hairScore: 0.9,
          outfitScore: 0.7,
          confidence: 0.9,
          findings: [],
          model: "gpt-4o-mini",
        },
      },
      {
        characterName: "Sidekick",
        score: {
          overallScore: 0.5,
          faceScore: 0.6,
          hairScore: 0.4,
          outfitScore: 0.5,
          confidence: 0.85,
          findings: ["hair color drift"],
          model: "gpt-4o-mini",
        },
      },
    ]);
    expect(result).not.toBeNull();
    expect(result!.averageScore).toBeCloseTo(0.65, 2);
    expect(result!.minScore).toBeCloseTo(0.5, 2);
    expect(result!.hasStrongDrift).toBe(true);
    expect(result!.hasModerateDrift).toBe(true);
  });

  it("hasStrongDrift=false et hasModerateDrift=false si tous les scores >= 0.7", () => {
    const result = aggregateSimilarityScores([
      {
        characterName: "Hero",
        score: {
          overallScore: 0.85,
          faceScore: 0.9,
          hairScore: 0.95,
          outfitScore: 0.8,
          confidence: 0.9,
          findings: [],
          model: "gpt-4o-mini",
        },
      },
      {
        characterName: "Sidekick",
        score: {
          overallScore: 0.75,
          faceScore: 0.8,
          hairScore: 0.7,
          outfitScore: 0.78,
          confidence: 0.85,
          findings: [],
          model: "gpt-4o-mini",
        },
      },
    ]);
    expect(result).not.toBeNull();
    expect(result!.hasStrongDrift).toBe(false);
    expect(result!.hasModerateDrift).toBe(false);
  });
});
