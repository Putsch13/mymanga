import type { FalPanelCategory, ReferencePolicy } from "./types";

export type FalBenchmarkSceneId =
  | "school_bullying"
  | "urban_alley_npc"
  | "romantic_garden"
  | "abandoned_lab"
  | "post_apo_establishing"
  | "emotional_duo"
  | "action_group"
  | "faceoff_strong_decor";

export type FalBenchmarkStrategyId =
  | "scene_txt2img"
  | "story_light_ref"
  | "character_strong_ref"
  | "scene_first_two_pass"
  | "redux_legacy";

export type FalBenchmarkResult = {
  sceneId: FalBenchmarkSceneId;
  strategyId: FalBenchmarkStrategyId;
  scores: {
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    characterFidelityScore: number;
    interactionScore: number;
    styleConsistencyScore: number;
    overallReleaseScore: number;
  };
};

export const FAL_BENCHMARK_SCENES: Array<{
  id: FalBenchmarkSceneId;
  label: string;
  category: FalPanelCategory;
}> = [
  { id: "school_bullying", label: "Cour du lycée avec humiliation publique", category: "ESTABLISHING_ENVIRONMENT" },
  { id: "urban_alley_npc", label: "Ruelle urbaine avec PNJ", category: "CHARACTER_IN_SCENE" },
  { id: "romantic_garden", label: "Jardin romantique", category: "CHARACTER_IN_SCENE" },
  { id: "abandoned_lab", label: "Laboratoire abandonné", category: "ESTABLISHING_ENVIRONMENT" },
  { id: "post_apo_establishing", label: "Establishing shot post-apo", category: "ESTABLISHING_ENVIRONMENT" },
  { id: "emotional_duo", label: "Scène duo émotionnel", category: "CHARACTER_IN_SCENE" },
  { id: "action_group", label: "Scène d'action avec groupe", category: "ESTABLISHING_ENVIRONMENT" },
  { id: "faceoff_strong_decor", label: "Confrontation avec décor fort", category: "CHARACTER_IN_SCENE" },
];

export const FAL_STRATEGY_BASELINES: Record<FalBenchmarkSceneId, { preferredStrategy: FalBenchmarkStrategyId; referencePolicy: ReferencePolicy }> = {
  school_bullying: { preferredStrategy: "scene_first_two_pass", referencePolicy: "LIGHT" },
  urban_alley_npc: { preferredStrategy: "story_light_ref", referencePolicy: "LIGHT" },
  romantic_garden: { preferredStrategy: "story_light_ref", referencePolicy: "LIGHT" },
  abandoned_lab: { preferredStrategy: "scene_first_two_pass", referencePolicy: "LIGHT" },
  post_apo_establishing: { preferredStrategy: "scene_txt2img", referencePolicy: "NONE" },
  emotional_duo: { preferredStrategy: "story_light_ref", referencePolicy: "LIGHT" },
  action_group: { preferredStrategy: "scene_first_two_pass", referencePolicy: "LIGHT" },
  faceoff_strong_decor: { preferredStrategy: "scene_first_two_pass", referencePolicy: "LIGHT" },
};

export function rankFalBenchmarkResults(results: FalBenchmarkResult[]) {
  const byScene = new Map<FalBenchmarkSceneId, FalBenchmarkResult[]>();
  for (const result of results) {
    const list = byScene.get(result.sceneId) ?? [];
    list.push(result);
    byScene.set(result.sceneId, list);
  }

  return Array.from(byScene.entries()).map(([sceneId, sceneResults]) => {
    const ranked = [...sceneResults].sort(
      (a, b) =>
        b.scores.overallReleaseScore
        + b.scores.backgroundPresenceScore * 0.2
        + b.scores.interactionScore * 0.1
        - (a.scores.overallReleaseScore + a.scores.backgroundPresenceScore * 0.2 + a.scores.interactionScore * 0.1),
    );
    return {
      sceneId,
      winner: ranked[0],
      candidates: ranked,
    };
  });
}
