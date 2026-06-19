/**
 * Quality gate au niveau scène — look consistency inter-panels, cast
 * consistency, continuité spatiale.
 */
import type { PanelQualityIssue, SceneQualityReport } from "./types";

export interface RunSceneQualityGateInput {
  sceneId: string;
  panelPrompts: string[];
  castLineup: string[];
  chapterLookProfileMode?: string | null;
  anchorLocation?: string | null;
}

const LOOK_INCOMPATIBILITIES_SCENE: Record<string, string[]> = {
  premium_manga_bw: ["photorealistic", "semi-realistic", "color"],
  premium_manga_color: ["photorealistic", "semi-realistic", "black and white only"],
  anime_cel_shaded_consistent: ["photorealistic", "semi-realistic"],
};

export function runSceneQualityGate(input: RunSceneQualityGateInput): SceneQualityReport {
  const issues: PanelQualityIssue[] = [];
  const reviewFlags: string[] = [];

  let lookConsistencyScore = 100;
  let castConsistencyScore = 100;
  let sceneContinuityScore = 100;

  if (input.chapterLookProfileMode && input.panelPrompts.length > 1) {
    const forbidden = LOOK_INCOMPATIBILITIES_SCENE[input.chapterLookProfileMode] ?? [];

    let mismatchCount = 0;
    for (const prompt of input.panelPrompts) {
      const lower = prompt.toLowerCase();
      if (forbidden.some((f) => lower.includes(f.toLowerCase()))) {
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      lookConsistencyScore = Math.max(0, 100 - mismatchCount * 25);
      issues.push({
        code: "scene_look_inconsistency",
        severity: "warning",
        message: `${mismatchCount} panel(s) avec un style incompatible dans la scène`,
        autoFixable: false,
      });
      reviewFlags.push("scene_look_inconsistency");
    }
  }

  for (const character of input.castLineup.slice(0, 3)) {
    const charLower = character.toLowerCase();
    const presentInPanels = input.panelPrompts.filter((p) =>
      p.toLowerCase().includes(charLower),
    ).length;
    const presenceRatio =
      input.panelPrompts.length > 0 ? presentInPanels / input.panelPrompts.length : 1;

    if (presenceRatio < 0.5) {
      castConsistencyScore -= 20;
      issues.push({
        code: "character_missing_from_scene",
        severity: "info",
        message: `${character} absent de ${Math.round((1 - presenceRatio) * 100)}% des panels de la scène`,
        autoFixable: false,
      });
    }
  }

  castConsistencyScore = Math.max(0, castConsistencyScore);

  if (input.anchorLocation && input.panelPrompts.length > 1) {
    const locationLower = input.anchorLocation.toLowerCase();
    const presentInPanels = input.panelPrompts.filter((p) =>
      p.toLowerCase().includes(locationLower),
    ).length;
    const presenceRatio = presentInPanels / input.panelPrompts.length;

    if (presenceRatio < 0.6) {
      sceneContinuityScore = Math.max(0, Math.round(presenceRatio * 100));
      issues.push({
        code: "location_continuity_weak",
        severity: "info",
        message: `Lieu "${input.anchorLocation}" absent de certains panels`,
        autoFixable: false,
      });
      reviewFlags.push("location_continuity_weak");
    }
  }

  const overallScore = Math.round(
    (lookConsistencyScore + castConsistencyScore + sceneContinuityScore) / 3,
  );
  const passed = overallScore >= 60;

  return {
    passed,
    score: overallScore,
    issues,
    reviewFlags,
    lookConsistencyScore,
    castConsistencyScore,
    sceneContinuityScore,
  };
}
