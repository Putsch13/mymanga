/**
 * Quality gate au niveau panel — look consistency, beat-image alignment,
 * SFX coherence.
 */
import type { PanelQualityIssue, PanelQualityReport } from "./types";

export interface RunPanelQualityGateInput {
  panelPrompt: string;
  beatEventType?: string | null;
  motionLevel?: number;
  sfx?: string[] | null;
  chapterLookProfileMode?: string | null;
  sfxForbiddenTypes?: string[] | null;
  mustShow?: string[] | null;
}

const LOOK_INCOMPATIBILITIES: Record<string, string[]> = {
  premium_manga_bw: ["photorealistic", "semi-realistic", "cyberpunk neon", "anime tv"],
  premium_manga_color: ["photorealistic", "semi-realistic", "manga bw"],
  anime_cel_shaded_consistent: ["photorealistic", "semi-realistic", "manga bw"],
};

export function runPanelQualityGate(input: RunPanelQualityGateInput): PanelQualityReport {
  const issues: PanelQualityIssue[] = [];
  const reviewFlags: string[] = [];
  const blockReasons: string[] = [];
  const promptLower = input.panelPrompt.toLowerCase();

  let score = 100;

  let sfxCoherenceOk = true;
  const sfxList = input.sfx ?? [];
  const forbiddenSfxTypes = input.sfxForbiddenTypes ?? [];

  for (const sfx of sfxList) {
    const sfxLower = sfx.toLowerCase();
    for (const forbidden of forbiddenSfxTypes) {
      if (
        sfxLower.includes(forbidden.toLowerCase()) ||
        forbidden.toLowerCase().includes(sfxLower)
      ) {
        issues.push({
          code: "sfx_beat_mismatch",
          severity: "warning",
          message: `SFX "${sfx}" incohérent avec le beat "${input.beatEventType}" (type interdit: ${forbidden})`,
          autoFixable: true,
        });
        reviewFlags.push(`sfx_mismatch:${sfx}`);
        sfxCoherenceOk = false;
        score -= 15;
      }
    }
  }

  const isRomanceBeat =
    input.beatEventType === "romance_tension" || input.beatEventType === "silent_beat";
  if (
    isRomanceBeat &&
    sfxList.some((s) => /(smash|boom|crash|impact|bang)/i.test(s))
  ) {
    issues.push({
      code: "impact_sfx_on_romance_beat",
      severity: "error",
      message: `SFX d'impact sur un beat romance/silence — incohérence majeure`,
      autoFixable: true,
    });
    reviewFlags.push("impact_sfx_on_romance");
    sfxCoherenceOk = false;
    score -= 25;
  }

  let beatAlignmentOk = true;
  const motionLevel = input.motionLevel ?? 5;

  if (input.beatEventType === "combat_turning_point" && motionLevel < 7) {
    const hasMotion = /(speed lines|motion blur|dynamic|explosive|burst|impact)/.test(
      promptLower,
    );
    if (!hasMotion) {
      issues.push({
        code: "combat_turning_point_no_motion",
        severity: "warning",
        message: "Panel combat_turning_point sans mouvement lisible dans le prompt",
        autoFixable: false,
      });
      reviewFlags.push("combat_no_motion");
      beatAlignmentOk = false;
      score -= 20;
    }
  }

  if (input.beatEventType === "silent_beat" && sfxList.length > 0) {
    issues.push({
      code: "sfx_on_silent_beat",
      severity: "warning",
      message: "SFX présents sur un beat silencieux",
      autoFixable: true,
    });
    reviewFlags.push("sfx_on_silence");
    score -= 10;
  }

  let lookConsistencyOk = true;
  if (input.chapterLookProfileMode) {
    const forbidden = LOOK_INCOMPATIBILITIES[input.chapterLookProfileMode] ?? [];
    for (const pattern of forbidden) {
      if (promptLower.includes(pattern.toLowerCase())) {
        issues.push({
          code: "look_profile_mismatch",
          severity: "warning",
          message: `Style "${pattern}" incompatible avec le look profile "${input.chapterLookProfileMode}"`,
          autoFixable: false,
        });
        reviewFlags.push(`look_mismatch:${pattern}`);
        lookConsistencyOk = false;
        score -= 20;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const passed = score >= 60 && blockReasons.length === 0;

  return {
    passed,
    score,
    issues,
    reviewFlags,
    blockReasons,
    sfxCoherenceOk,
    beatAlignmentOk,
    lookConsistencyOk,
  };
}
