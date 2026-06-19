/**
 * `computeContractualFocusAdequacy` (P3.1) — variété des SUJETS, pas des
 * cadrages. `computeShotVarietyBudget` peut être satisfait avec 100% héros ;
 * cette fonction vérifie qu'un chapitre dispose bien d'inserts contractuels
 * (arme, décor, PNJ, ennemi, aftermath, réaction).
 *
 * Score = nombre de contrats respectés / total des contrats actifs.
 * `blocking = true` si un contrat dur (enemy, props, env) est cassé.
 */
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { MANGA_SHOT_BUDGET } from "@manga-ai-studio/core";

export interface ContractualFocusAdequacyReport {
  score: number;
  environmentPanels: number;
  propInsertPanels: number;
  enemyFocusPanels: number;
  npcPanels: number;
  reactionPanels: number;
  aftermathPanels: number;
  heroCenterRatio: number;
  violations: Array<{
    type:
      | "missing_environment"
      | "missing_enemy_focus"
      | "missing_prop_insert"
      | "missing_npc_population"
      | "hero_overload_vs_contract";
    message: string;
    severity: "warning" | "blocking";
  }>;
  blocking: boolean;
}

export function computeContractualFocusAdequacy(
  blueprints: PanelBlueprintPremium[],
): ContractualFocusAdequacyReport {
  const total = blueprints.length;
  if (total === 0) {
    return {
      score: 0,
      environmentPanels: 0,
      propInsertPanels: 0,
      enemyFocusPanels: 0,
      npcPanels: 0,
      reactionPanels: 0,
      aftermathPanels: 0,
      heroCenterRatio: 0,
      violations: [],
      blocking: false,
    };
  }

  let environmentPanels = 0;
  let propInsertPanels = 0;
  let enemyFocusPanels = 0;
  let npcPanels = 0;
  let reactionPanels = 0;
  let aftermathPanels = 0;
  let heroCenterCount = 0;

  let hasEnemyObligation = false;
  let hasMandatoryProp = false;
  let hasNpcObligation = false;

  for (const bp of blueprints) {
    if (bp.subjectFocus === "environment") environmentPanels++;
    if (bp.subjectFocus === "prop" || bp.cutawayType === "prop_insert") {
      propInsertPanels++;
    }
    if (
      bp.subjectFocus === "enemy" ||
      (bp.subjectFocus === "visual_entity" && bp.mustShowEnemy)
    ) {
      enemyFocusPanels++;
    }
    if (
      bp.subjectFocus === "npc" ||
      bp.subjectFocus === "group" ||
      (bp.subjectFocus === "visual_entity" && !bp.mustShowEnemy) ||
      bp.requiredNpcCount > 0
    ) {
      npcPanels++;
    }
    if (bp.subjectFocus === "reaction") reactionPanels++;
    if (bp.subjectFocus === "aftermath") aftermathPanels++;
    if (bp.heroCenterAllowed && bp.subjectFocus === "hero") heroCenterCount++;

    if (bp.mustShowEnemy) hasEnemyObligation = true;
    if (
      bp.requiredProps &&
      bp.requiredProps.some((p) => p.mustBeVisible === true)
    ) {
      hasMandatoryProp = true;
    }
    if (bp.requiredNpcCount > 0) hasNpcObligation = true;
  }

  const heroCenterRatio = heroCenterCount / total;
  const violations: ContractualFocusAdequacyReport["violations"] = [];

  if (environmentPanels === 0 && total > 3) {
    violations.push({
      type: "missing_environment",
      message: "Aucun panel environnement/décor n'est prévu pour ce chapitre.",
      severity: "blocking",
    });
  }
  if (hasEnemyObligation && enemyFocusPanels === 0) {
    violations.push({
      type: "missing_enemy_focus",
      message: "Un ennemi est obligatoire mais aucun panel ne le met au focus.",
      severity: "blocking",
    });
  }
  if (hasMandatoryProp && propInsertPanels === 0) {
    violations.push({
      type: "missing_prop_insert",
      message: "Un prop/arme obligatoire est présent mais jamais dédié à un insert.",
      severity: "blocking",
    });
  }
  if (hasNpcObligation && npcPanels === 0) {
    violations.push({
      type: "missing_npc_population",
      message: "Une scène de foule/PNJ est attendue mais aucun panel ne la couvre.",
      severity: "blocking",
    });
  }
  if (heroCenterRatio > MANGA_SHOT_BUDGET.HERO_CENTER_FAIL_RATIO) {
    violations.push({
      type: "hero_overload_vs_contract",
      message:
        `${Math.round(heroCenterRatio * 100)}% des panels sont centrés héros — ` +
        `le plan est trop égocentré pour laisser vivre le décor / PNJ / inserts.`,
      severity: "blocking",
    });
  }

  const totalContracts = [
    hasEnemyObligation,
    hasMandatoryProp,
    hasNpcObligation,
    true, // environment target — toujours attendu
    true, // hero-ratio — toujours attendu
  ].filter(Boolean).length;
  const respectedContracts =
    totalContracts - violations.filter((v) => v.severity === "blocking").length;
  const score =
    totalContracts > 0
      ? Math.max(0, Math.min(1, respectedContracts / totalContracts))
      : 1;

  return {
    score,
    environmentPanels,
    propInsertPanels,
    enemyFocusPanels,
    npcPanels,
    reactionPanels,
    aftermathPanels,
    heroCenterRatio,
    violations,
    blocking: violations.some((v) => v.severity === "blocking"),
  };
}
