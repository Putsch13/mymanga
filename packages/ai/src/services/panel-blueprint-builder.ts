/**
 * Facade Panel Blueprints Premium.
 *
 * Ce fichier etait un monolithe de ~1200 lignes mixant data (templates),
 * construction (blueprints depuis beats), enrichissement (expansion jusqu'a
 * 70-75 panels), budgets (focus, shot variety, cutaway, contractual) et un
 * helper gore. Sprint C l'a decoupe en sous-modules dans `./blueprints/*`
 * pour gagner en lisibilite et testabilite.
 *
 * On garde ici un point d'entree unique qui re-exporte tout pour ne pas
 * casser les imports existants (`@manga-ai-studio/ai` re-exporte en `*`).
 */

export type {
  BeatType,
  PanelTemplate,
} from "./blueprints/panel-templates";
export {
  detectBeatType,
  getTemplatesForBeatType,
  COMBAT_TEMPLATES,
  TENSE_DIALOGUE_TEMPLATES,
  INFILTRATION_TEMPLATES,
  REVEAL_TEMPLATES,
  PUBLIC_SCENE_TEMPLATES,
  GENERIC_TEMPLATES,
} from "./blueprints/panel-templates";

export type { PanelBlueprintContext } from "./blueprints/base-builder";
export { buildPanelBlueprintsFromBeat } from "./blueprints/base-builder";

export { expandBlueprintsToMinimum } from "./blueprints/blueprint-enrichment";

export type {
  ShotVarietyReport,
  CutawayBudgetReport,
  ContractualFocusAdequacyReport,
} from "./blueprints/blueprint-budgets";
export {
  computeChapterFocusBudget,
  computeShotVarietyBudget,
  computeCutawayBudget,
  computeContractualFocusAdequacy,
  computePremiumReadinessScore,
} from "./blueprints/blueprint-budgets";

export { buildGoreDirectives } from "./blueprints/gore-directives";
