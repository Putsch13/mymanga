import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { blueprintPrimaryDialogueLineCount } from "@manga-ai-studio/core";

import {
  blueprintTextBlob,
  containsBannedPlaceholder,
} from "../premium-manga-cutaway";

export function isDialogueHeavyBeat(bp: PanelBlueprintPremium): boolean {
  return (
    blueprintPrimaryDialogueLineCount(bp) > 0
    || bp.dialogueCarrier === "speaker_visible"
  );
}

/** Cutaway « dur » : plafonné sévèrement (ouverture, splash, révélation majeure, etc.). */
export function isHardCriticalCutawayBlueprint(
  bp: PanelBlueprintPremium,
  readingOrderIndex: number,
): boolean {
  if (bp.contractualCritical === true) return true;

  const purpose = bp.purpose.toLowerCase();
  const shotType = bp.shotType.toLowerCase();
  const actionLine = blueprintTextBlob(bp);

  if (
    (purpose.includes("establishing") || purpose.includes("establish"))
    && readingOrderIndex <= 2
  ) {
    return true;
  }
  if (purpose.includes("major_reveal") || purpose.includes("major reveal")) return true;
  if (purpose.includes("cliffhanger") || purpose.includes("cliff-hanger")) return true;
  if (shotType.includes("splash")) return true;

  if (
    purpose.includes("key_object_reveal")
    || purpose.includes("key object reveal")
    || actionLine.includes("reveals the talisman")
    || actionLine.includes("reveals the grimoire")
  ) {
    return true;
  }

  return false;
}

/** Cutaway « soft » : convertible en priorité moindre après les plans normaux. */
export function isSoftCriticalCutawayBlueprint(
  bp: PanelBlueprintPremium,
  readingOrderIndex: number,
): boolean {
  if (isHardCriticalCutawayBlueprint(bp, readingOrderIndex)) return false;

  const purpose = bp.purpose.toLowerCase();
  const actionLine = blueprintTextBlob(bp);
  const requiredProps = Array.isArray(bp.requiredProps) ? bp.requiredProps : [];

  if (requiredProps.length > 0) return true;
  if (purpose.includes("prop")) return true;
  if (purpose.includes("environment")) return true;
  if (purpose.includes("aftermath")) return true;
  if (actionLine.includes("barrière") || actionLine.includes("barrier")) return true;
  if (actionLine.includes("talisman")) return true;
  if (actionLine.includes("grimoire")) return true;
  if (actionLine.includes("magic") || actionLine.includes("magique")) return true;

  return false;
}

export function narrativeValueScore(bp: PanelBlueprintPremium): number {
  let score = 50;
  if (bp.contractualCritical) score += 40;
  if (bp.criticality === "high" || bp.criticality === "critical") score += 25;
  const p = bp.purpose.toLowerCase();
  if (
    p.includes("establish")
    || p.includes("major_reveal")
    || p.includes("major reveal")
  ) {
    score += 15;
  }
  if (p.includes("atmos") || p.includes("densified")) score -= 30;
  if (containsBannedPlaceholder(bp)) score -= 25;
  return score;
}
