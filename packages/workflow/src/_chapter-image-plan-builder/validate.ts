import type {
  ChapterImagePlanItem,
  ChapterImagePlanValidationResult,
} from "./types";

export function validateChapterImagePlan(
  plan: ChapterImagePlanItem[],
  expectedMin = 60,
  expectedMax = 80,
): ChapterImagePlanValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (plan.length < expectedMin) {
    issues.push(`PLAN_TOO_SHORT: ${plan.length} images < ${expectedMin}`);
  }
  if (plan.length > expectedMax) {
    warnings.push(`PLAN_TOO_LONG: ${plan.length} images > ${expectedMax}`);
  }

  const intentDistribution: Record<string, number> = {};
  for (const item of plan) {
    intentDistribution[item.imageIntentType] =
      (intentDistribution[item.imageIntentType] ?? 0) + 1;

    if (!item.imageIntentType) {
      issues.push(`MISSING_INTENT: ${item.imageIntentType}`);
    }
    if (!item.dominantSubject) {
      issues.push(`MISSING_DOMINANT: ${item.imageId}`);
    }
    if (item.promptLanguage !== "en") {
      issues.push(
        `WRONG_LANGUAGE: ${item.imageId} promptLanguage=${item.promptLanguage}`,
      );
    }
  }

  const heroDominantCount = plan.filter(
    (p) => p.dominantSubject === "hero",
  ).length;
  const heroRatio = plan.length > 0 ? heroDominantCount / plan.length : 0;
  if (heroRatio > 0.55) {
    warnings.push(
      `HERO_BIAS_SUSPICIOUS: ${(heroRatio * 100).toFixed(1)}% of panels are hero-dominant`,
    );
  }

  return {
    valid: issues.length === 0,
    totalImages: plan.length,
    intentDistribution,
    issues,
    warnings,
  };
}
