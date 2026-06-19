import type {
  ShotPlanDistribution,
  ShotPlanEntry,
  ShotPlanReliability,
  ShotPlanWarning,
} from "./types";

/**
 * Seuils du plan chapitre. Ces seuils sont durs : s'ils sont violés, la launch
 * est bloquée. Ils sont calibrés pour un chapitre de 50-75 panels.
 *
 * - heroLeadRatio ≤ 0.55 : au plus 55% des panels sont héros-centré
 * - cutawayRatio  ≥ 0.15 : au moins 15% des panels sont des plans de coupe
 * - environmentPanels ≥ 2 pour chapitres > 10 panels
 * - uniqueShotTypes ≥ 3 : au moins 3 types de cadrage différents
 */
export const SHOT_PLAN_THRESHOLDS = {
  MAX_HERO_LEAD_RATIO: 0.55,
  MIN_CUTAWAY_RATIO: 0.15,
  MIN_ENVIRONMENT_PANELS: 2,
  MIN_UNIQUE_SHOT_TYPES: 3,
  MIN_PANELS_FOR_FULL_CHECK: 10,
} as const;

function computeMaxHeroStreak(entries: ShotPlanEntry[]): number {
  let max = 0;
  let current = 0;
  for (const e of entries) {
    if (e.category === "hero_lead") {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

export function evaluateReliability(
  distribution: ShotPlanDistribution,
  entries: ShotPlanEntry[],
): ShotPlanReliability {
  const warnings: ShotPlanWarning[] = [];
  const blockers: ShotPlanWarning[] = [];
  const { totalPanels, heroLeadRatio, cutawayRatio, environmentPanels, uniqueShotTypes } =
    distribution;

  const smallPlan = totalPanels < SHOT_PLAN_THRESHOLDS.MIN_PANELS_FOR_FULL_CHECK;

  if (totalPanels === 0) {
    blockers.push({
      code: "EMPTY_PLAN",
      message: "Le plan chapitre est vide, aucun panel à générer.",
      severity: "blocking",
    });
  }

  if (heroLeadRatio > SHOT_PLAN_THRESHOLDS.MAX_HERO_LEAD_RATIO) {
    blockers.push({
      code: "HERO_OVERLOAD",
      message:
        `${Math.round(heroLeadRatio * 100)}% des panels sont centrés sur le héros (max ${Math.round(SHOT_PLAN_THRESHOLDS.MAX_HERO_LEAD_RATIO * 100)}%). ` +
        `Le chapitre ne laissera pas respirer le décor, les PNJ et les plans de coupe.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && cutawayRatio < SHOT_PLAN_THRESHOLDS.MIN_CUTAWAY_RATIO) {
    blockers.push({
      code: "MISSING_CUTAWAYS",
      message:
        `Seulement ${Math.round(cutawayRatio * 100)}% de plans de coupe (min ${Math.round(SHOT_PLAN_THRESHOLDS.MIN_CUTAWAY_RATIO * 100)}%). ` +
        `Un chapitre sans plans de coupe se lit platement.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && environmentPanels < SHOT_PLAN_THRESHOLDS.MIN_ENVIRONMENT_PANELS) {
    blockers.push({
      code: "MISSING_ENVIRONMENT",
      message:
        `Seulement ${environmentPanels} panel(s) décor (min ${SHOT_PLAN_THRESHOLDS.MIN_ENVIRONMENT_PANELS}). ` +
        `Le lecteur doit pouvoir se situer visuellement.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && uniqueShotTypes < SHOT_PLAN_THRESHOLDS.MIN_UNIQUE_SHOT_TYPES) {
    blockers.push({
      code: "SHOT_MONOTONY",
      message:
        `Seulement ${uniqueShotTypes} type(s) de cadrage (min ${SHOT_PLAN_THRESHOLDS.MIN_UNIQUE_SHOT_TYPES}). ` +
        `Alterner wide, medium, closeup, insert pour casser la monotonie.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && distribution.reactionPanels === 0) {
    warnings.push({
      code: "NO_REACTION_PANELS",
      message:
        "Aucun plan de réaction — sans ça, on ne voit jamais l'effet des événements sur les personnages.",
      severity: "warning",
    });
  }
  if (!smallPlan && distribution.propInsertPanels === 0) {
    const hasMandatoryProps = entries.some(
      (e) => e.category === "prop_insert" || e.contractualCritical,
    );
    if (!hasMandatoryProps) {
      warnings.push({
        code: "NO_PROP_INSERTS",
        message: "Aucun insert d'objet — les armes / artefacts clefs ne sont jamais mis en avant.",
        severity: "warning",
      });
    }
  }
  if (!smallPlan && distribution.npcPanels === 0) {
    warnings.push({
      code: "NO_NPC_PANELS",
      message: "Aucun panel dédié aux PNJ / foule — le monde semble vide autour du héros.",
      severity: "warning",
    });
  }

  const maxHeroStreak = computeMaxHeroStreak(entries);
  if (maxHeroStreak >= 6) {
    warnings.push({
      code: "HERO_STREAK",
      message: `${maxHeroStreak} panels héros consécutifs détectés — risque de monotonie visuelle.`,
      severity: "warning",
    });
  }

  // Score : 1 - 0.2 par blocker - 0.05 par warning, borné [0,1]
  const score = Math.max(0, Math.min(1, 1 - 0.2 * blockers.length - 0.05 * warnings.length));

  return {
    score,
    launchAllowed: blockers.length === 0,
    warnings,
    blockers,
  };
}
