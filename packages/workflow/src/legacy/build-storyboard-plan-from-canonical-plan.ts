/**
 * Storyboard déterministe : les blueprints narratifs viennent du plan de production
 * enrichi (`productionPlanShell.panelBlueprints`) quand présents ; le plan canonique
 * ne sert qu'à aligner rythme, IDs et pagination via `mergeRawBlueprintsWithCanonicalRhythm`.
 */

import type { CanonicalChapterProductionPlan, PanelBlueprintPremium } from "@manga-ai-studio/core";
import { mergeRawBlueprintsWithCanonicalRhythm } from "@manga-ai-studio/core";
import {
  buildStoryboardPlanFromApprovedProductionPlan,
  type BuildStoryboardPlanFromApprovedProductionPlanInput,
} from "../build-storyboard-plan-from-approved-production-plan";

export interface BuildStoryboardPlanFromCanonicalPlanInput
  extends Omit<BuildStoryboardPlanFromApprovedProductionPlanInput, "productionPlan"> {
  canonicalPlan: CanonicalChapterProductionPlan;
  /** Métadonnées persistées ; `panelBlueprints` enrichis sont fusionnés avec le canonique. */
  productionPlanShell?: Record<string, unknown> | null;
}

export function buildStoryboardPlanFromCanonicalPlan(
  input: BuildStoryboardPlanFromCanonicalPlanInput,
): ReturnType<typeof buildStoryboardPlanFromApprovedProductionPlan> {
  const shellBps = input.productionPlanShell?.panelBlueprints;
  const rawShell = Array.isArray(shellBps) ? (shellBps as PanelBlueprintPremium[]) : [];
  const blueprints = mergeRawBlueprintsWithCanonicalRhythm(rawShell, input.canonicalPlan);

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
