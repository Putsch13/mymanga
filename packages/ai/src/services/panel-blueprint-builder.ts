/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ LEGACY — PREMIUM-FORBIDDEN (P0.B quarantine)                       ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ Le chemin premium v3 délègue le découpage panel à l'IA2 (Manga     ║
 * ║ Editor LLM), cf. `storyboard-pass.ts` + `manga-editor-agent-llm`.  ║
 * ║ Plus de "blueprint builder" heuristique : le storyboard décide.    ║
 * ║                                                                    ║
 * ║ `premium-path-legacy-isolation.test.ts` bloque tout import.        ║
 * ╚════════════════════════════════════════════════════════════════════╝
 *
 * @deprecated Facade Panel Blueprints Premium — legacy.
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

export { expandBlueprintsToMinimum } from "./blueprints/minimum-blueprint-expansion";

export type {
  ShotVarietyReport,
  CutawayBudgetReport,
  ContractualFocusAdequacyReport,
  PremiumReadinessCastContext,
  PremiumPlanContractQaResult,
} from "./blueprints/blueprint-budgets";
export {
  computeChapterFocusBudget,
  computeShotVarietyBudget,
  computeCutawayBudget,
  computeContractualFocusAdequacy,
  computePremiumReadinessScore,
  runPremiumPlanContractQa,
} from "./blueprints/blueprint-budgets";

export { buildGoreDirectives } from "./blueprints/gore-directives";
