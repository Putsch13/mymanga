/**
 * Budgets et adéquations contractuelles calculées sur une liste de blueprints.
 *
 * Façade qui ré-exporte les analyses "read-only" depuis `_blueprint-budgets/` :
 *   - `computeChapterFocusBudget`       : distribution focus + violations
 *   - `computeShotVarietyBudget`        : variété de CADRAGES
 *   - `computeCutawayBudget`            : qualité des plans de coupe
 *   - `computeContractualFocusAdequacy` : variété de SUJETS (hero vs env/npc/prop)
 *   - `runPremiumPlanContractQa`        : QA unifiée appelée par estimate ET launch
 *   - `computePremiumReadinessScore`    : score synthétique [0..1]
 *
 * Extrait de `panel-blueprint-builder.ts` lors du Sprint C.
 */

export type {
  PremiumReadinessCastContext,
} from "./_blueprint-budgets/character-helpers";
export { computeChapterFocusBudget } from "./_blueprint-budgets/focus-budget";
export {
  computeShotVarietyBudget,
  type ShotVarietyReport,
} from "./_blueprint-budgets/shot-variety";
export {
  computeCutawayBudget,
  type CutawayBudgetReport,
} from "./_blueprint-budgets/cutaway-budget";
export {
  computeContractualFocusAdequacy,
  type ContractualFocusAdequacyReport,
} from "./_blueprint-budgets/contractual-adequacy";
export {
  runPremiumPlanContractQa,
  type PremiumPlanContractQaResult,
} from "./_blueprint-budgets/contract-qa";
export { computePremiumReadinessScore } from "./_blueprint-budgets/readiness-score";
