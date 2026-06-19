import {
  PREMIUM_PANEL_RANGE,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  type PanelBlueprintPremium,
  type ProductionPlan,
} from "@manga-ai-studio/core";

import { asRecord } from "./utils";

interface LaunchBlockedInput {
  resolvedProductionPlan: ProductionPlan;
  premiumOnly: boolean;
  premiumMeta: Record<string, unknown>;
  chapterId: string;
  projectId: string;
}

export function annotatePremiumMetaWithLaunchStatus(
  input: LaunchBlockedInput,
): void {
  const {
    resolvedProductionPlan,
    premiumOnly,
    premiumMeta,
    chapterId,
    projectId,
  } = input;

  const resolvedPlanRecord = asRecord(resolvedProductionPlan);
  const resolvedPanelBlueprints = Array.isArray(resolvedPlanRecord.panelBlueprints)
    ? (resolvedPlanRecord.panelBlueprints as PanelBlueprintPremium[])
    : [];
  const resolvedBlueprintCount = resolvedPanelBlueprints.length;
  const resolvedMinimumImages =
    typeof resolvedPlanRecord.minimumImages === "number"
    && resolvedPlanRecord.minimumImages > 0
      ? (resolvedPlanRecord.minimumImages as number)
      : PREMIUM_PANEL_RANGE.min;

  const continuityPreflights = premiumOnly
    ? computePanelContinuityPreflights(resolvedPanelBlueprints, {
        strictEnvironmentLocationBinding: true,
        strictCharacterDnaBinding: true,
        strictPropVisualBinding: true,
      })
    : [];
  const continuityBlockers = premiumOnly
    ? continuityPreflightBlockingReasons(continuityPreflights)
    : [];

  premiumMeta.continuityPreflight = {
    ok: continuityBlockers.length === 0,
    blockers: continuityBlockers,
    panelCount: continuityPreflights.length,
  };

  const launchBlockedIncomplete = resolvedBlueprintCount < resolvedMinimumImages;
  const launchBlockedContinuity = premiumOnly && continuityBlockers.length > 0;
  const launchBlocked = launchBlockedIncomplete || launchBlockedContinuity;

  // P0.5 — Option B : marquer explicitement le snapshot comme `launchBlocked`
  // quand le contrat reconstruit côté serveur reste incomplet (panelBlueprints
  // < minimumImages). On ne refuse pas 422 pour éviter de casser les flux
  // existants, mais on remonte un warning fort dans `premiumMeta`.
  const launchBlockedReason = !launchBlocked
    ? null
    : launchBlockedIncomplete && launchBlockedContinuity
      ? "incomplete_plan_and_continuity_preflight"
      : launchBlockedContinuity
        ? "continuity_preflight"
        : resolvedBlueprintCount === 0
          ? "missing_blueprints"
          : "incomplete_plan";

  if (launchBlocked) {
    premiumMeta.launchBlocked = true;
    premiumMeta.launchBlockedReason = launchBlockedReason;
    premiumMeta.minimumImages = resolvedMinimumImages;
    console.warn(
      `[approved-outline] launch_blocked chapterId=${chapterId} projectId=${projectId} `
      + `reason=${launchBlockedReason} `
      + `panelBlueprintsCount=${resolvedBlueprintCount} minimumImages=${resolvedMinimumImages} `
      + `continuityBlockers=${continuityBlockers.length} `
      + `— le snapshot est persisté mais le studio doit bloquer le launch.`,
    );
  }
}
