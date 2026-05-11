/**
 * `computePremiumReadinessScore` (P2.15) — score honnête de préparation
 * premium d'un plan, utilisé par le studio et les logs.
 *
 * La route `POST .../launch` ne bloque plus uniquement sur ce score lorsque
 * la QA structurelle canonique sur les mêmes blueprints est valide — éviter
 * la contradiction avec `canonical_qa_valid`.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { PRODUCTION_RULES } from "@manga-ai-studio/core";
import {
  countPanelsReferencingCharacter,
  type PremiumReadinessCastContext,
} from "./character-helpers";
import { computeChapterFocusBudget } from "./focus-budget";
import { computeShotVarietyBudget } from "./shot-variety";
import { computeCutawayBudget } from "./cutaway-budget";

export function computePremiumReadinessScore(
  blueprints: PanelBlueprintPremium[],
  castContext?: PremiumReadinessCastContext | null,
): number {
  if (blueprints.length === 0) return 0;

  const budget = computeChapterFocusBudget(blueprints);
  const shotVariety = computeShotVarietyBudget(blueprints);
  const cutaway = computeCutawayBudget(blueprints);

  let score = 1.0;

  const blockingViolations = budget.violations.filter(
    (v) => v.severity === "blocking",
  ).length;
  score -= blockingViolations * 0.15;

  const warningViolations = budget.violations.filter(
    (v) => v.severity === "warning",
  ).length;
  score -= warningViolations * 0.05;

  const MAX_CUTAWAY_RATIO = PRODUCTION_RULES.cutaway.maxRatio;
  if (budget.cutawayRatio > MAX_CUTAWAY_RATIO) {
    score -= 0.1;
    const excessRatio = budget.cutawayRatio - MAX_CUTAWAY_RATIO;
    score -= Math.floor(excessRatio * 10) * 0.05;
  }

  const unknownLocationPanels = blueprints.filter((bp) => {
    const envDna = bp.environmentVisualDna as { locationName?: string } | null | undefined;
    const locName = envDna?.locationName ?? "unknown";
    return (
      locName.toLowerCase() === "unknown" ||
      locName.toLowerCase() === "story-consistent setting"
    );
  });
  const unknownLocationRatio = unknownLocationPanels.length / blueprints.length;
  if (unknownLocationRatio > 0.2) {
    score -= 0.1;
  }

  // offscreen_allowed = locuteur hors champ ; narration = pas de dialogue visible.
  const floatingDialoguePanels = blueprints.filter(
    (bp) =>
      bp.dialogueCarrier === "offscreen_allowed" ||
      bp.dialogueCarrier === "narration" ||
      !bp.dialogueCarrier,
  );
  const floatingDialogueRatio = floatingDialoguePanels.length / blueprints.length;
  if (floatingDialogueRatio > 0.5) {
    score -= 0.05;
  }

  const heroFocusPanels = blueprints.filter(
    (bp) => bp.subjectFocus === "hero" || bp.subjectFocus === "speaker",
  );
  const heroWithCharacterRef = heroFocusPanels.filter(
    (bp) =>
      (bp.mustShowCharacterIds && bp.mustShowCharacterIds.length > 0) ||
      (bp.requiredCharacterIds && bp.requiredCharacterIds.length > 0) ||
      (bp.characterVisualDna &&
        Array.isArray(bp.characterVisualDna) &&
        bp.characterVisualDna.length > 0),
  );
  if (heroFocusPanels.length > 0 && heroWithCharacterRef.length === 0) {
    score -= 0.15;
  }

  // Bonus variété de plans + cutaways.
  score += shotVariety.varietyScore * 0.1;
  if (cutaway.meetsMinimum) score += 0.05;

  // PR10 — héros 2 / déuteragoniste configurés mais quasi absents des blueprints.
  if (castContext) {
    const secondaryLead =
      castContext.secondaryHeroCharacterId?.trim() ||
      castContext.deuteragonistCharacterId?.trim() ||
      null;
    if (secondaryLead) {
      const n = countPanelsReferencingCharacter(blueprints, secondaryLead);
      if (n === 0) score -= 0.08;
      else if (blueprints.length >= 14 && n < 2) score -= 0.04;
    }
  }

  return Math.max(0, Math.min(1, score));
}
