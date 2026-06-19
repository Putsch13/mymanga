/**
 * prompt-strict.ts
 *
 * Variante stricte du builder : refuse les specs qui produiraient un
 * prompt contradictoire / hard_lock sans refs / négations dans positif.
 * Extrait de `minimal-panel-prompt-builder.ts` (audit-v9).
 */

import type { PanelRenderSpec } from "../../contracts/panel-render-spec";
import {
  ContradictoryPanelPromptError,
  HardLockWithoutReferencesError,
  NegationInPositivePromptError,
  detectContradictoryTokens,
  detectHardLockInvocationWithoutRefs,
  detectNegationsInPositive,
} from "./prompt-negative-block";
import { buildMinimalPanelPrompt, type BuiltPromptResult } from "./prompt-builder-core";

/**
 * Build + assertion stricte. Utiliser sur le chemin premium v3 pour
 * refuser les specs qui produisent un prompt contradictoire (ex: un
 * insert_object avec "hero portrait" dans le subject/action blocks).
 */
export function buildMinimalPanelPromptStrict(
  spec: PanelRenderSpec,
): BuiltPromptResult {
  const built = buildMinimalPanelPrompt(spec);
  const violations = detectContradictoryTokens(spec, built.positive);
  if (violations.length > 0) {
    throw new ContradictoryPanelPromptError(spec.renderMode, violations);
  }
  // COMMIT P7.C — plus d'incantation textuelle de hard_lock sans refs.
  if (detectHardLockInvocationWithoutRefs(spec, built.positive)) {
    throw new HardLockWithoutReferencesError(spec.panelId, spec.renderMode);
  }
  // P0.5 — détecter les négations dans le prompt positif
  const negations = detectNegationsInPositive(built.positive);
  if (negations.length > 0) {
    throw new NegationInPositivePromptError(spec.panelId, spec.renderMode, negations);
  }
  return built;
}
