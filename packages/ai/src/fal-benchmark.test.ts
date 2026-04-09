import { describe, expect, it } from "vitest";
import { rankFalBenchmarkResults } from "./fal-benchmark";

describe("fal benchmark ranking", () => {
  it("sélectionne la meilleure stratégie par scène", () => {
    const ranked = rankFalBenchmarkResults([
      {
        sceneId: "school_bullying",
        strategyId: "redux_legacy",
        scores: {
          backgroundPresenceScore: 0.3,
          environmentReadabilityScore: 0.25,
          characterFidelityScore: 0.8,
          interactionScore: 0.4,
          styleConsistencyScore: 0.7,
          overallReleaseScore: 0.45,
        },
      },
      {
        sceneId: "school_bullying",
        strategyId: "scene_first_two_pass",
        scores: {
          backgroundPresenceScore: 0.88,
          environmentReadabilityScore: 0.9,
          characterFidelityScore: 0.78,
          interactionScore: 0.82,
          styleConsistencyScore: 0.8,
          overallReleaseScore: 0.84,
        },
      },
    ]);

    expect(ranked[0]?.winner.strategyId).toBe("scene_first_two_pass");
  });
});
