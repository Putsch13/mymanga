/**
 * Storyboard déterministe à partir du plan canonique — les blueprints sont
 * une projection (`canonicalPlanToPanelBlueprints`), pas la source de vérité.
 */

import type { CanonicalChapterProductionPlan } from "@manga-ai-studio/core";
import { canonicalPlanToPanelBlueprints } from "@manga-ai-studio/core";
import {
  buildStoryboardPlanFromApprovedProductionPlan,
  type BuildStoryboardPlanFromApprovedProductionPlanInput,
} from "./build-storyboard-plan-from-approved-production-plan";

export interface BuildStoryboardPlanFromCanonicalPlanInput
  extends Omit<BuildStoryboardPlanFromApprovedProductionPlanInput, "productionPlan"> {
  canonicalPlan: CanonicalChapterProductionPlan;
  /** Métadonnées persistées (hors `panelBlueprints`, écrasés par le canonique). */
  productionPlanShell?: Record<string, unknown> | null;
}

export function buildStoryboardPlanFromCanonicalPlan(
  input: BuildStoryboardPlanFromCanonicalPlanInput,
): ReturnType<typeof buildStoryboardPlanFromApprovedProductionPlan> {
  const blueprints = canonicalPlanToPanelBlueprints(input.canonicalPlan);
  const shell = input.productionPlanShell && typeof input.productionPlanShell === "object"
    ? { ...input.productionPlanShell }
    : {};
  delete (shell as { panelBlueprints?: unknown }).panelBlueprints;

  const productionPlan: Record<string, unknown> = {
    ...shell,
    panelBlueprints: blueprints,
    pageCount: input.canonicalPlan.pageCount,
    estimatedImages: blueprints.length,
    targetImages: input.canonicalPlan.idealPanelCount,
    minimumImages: input.canonicalPlan.minimumPanelCount,
    maximumImages: input.canonicalPlan.maximumPanelCount,
  };

  return buildStoryboardPlanFromApprovedProductionPlan({
    chapterId: input.chapterId,
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
    projectFormat: input.projectFormat,
    productionPlan,
    chapterLocationName: input.chapterLocationName,
    productionPlanPages: input.productionPlanPages,
  });
}
