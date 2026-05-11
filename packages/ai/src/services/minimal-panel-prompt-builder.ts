/**
 * minimal-panel-prompt-builder — façade publique.
 *
 * Le module a été splitté (audit-v9) pour rester sous 500 lignes.
 * Tous les imports historiques restent valides via ce fichier.
 *
 * Couches :
 *   - `minimal-panel-prompt/prompt-text-utils`        : utilitaires lexicaux
 *   - `minimal-panel-prompt/prompt-environment-npc`   : DNA décor + props + entités monde
 *   - `minimal-panel-prompt/prompt-blocks`            : SUBJECT/ENV/SHOT/ACTION/STYLE
 *   - `minimal-panel-prompt/prompt-negative-block`    : bloc négatif + détecteurs
 *   - `minimal-panel-prompt/prompt-builder-core`      : assemblage final
 *   - `minimal-panel-prompt/prompt-strict`            : variante stricte premium
 *
 * Règles fortes :
 *   - le prompt final tient entre 700 et 1200 chars max
 *   - il est construit directement en anglais (pas de traduction FR->EN)
 *   - un `establishing_environment` ne contient PAS "tight face / hero closeup"
 *   - un `insert_object` ne contient PAS "full character portrait"
 *   - un `reaction_closeup` ne contient PAS "wide establishing"
 *   - pas de texte dans l'image si styleBible.noTextInsideImage
 *
 * Remplace le chemin critique de composeMangaPanelPrompt (manga-prompt-composer.ts).
 */

import type { PanelRenderSpec, PanelRenderCharacterVisualDna } from "../contracts/panel-render-spec";
import {
  formatEnvironmentDnaForPrompt,
  formatNpcVisualDnaForPrompt,
  formatWorldPropsVisualDnaForPrompt,
} from "./minimal-panel-prompt/prompt-environment-npc";
import {
  CHARACTER_CONFIGURATOR_PROMPT_MAX,
  compactConfiguratorTraitsForPrompt,
} from "./minimal-panel-prompt/prompt-blocks";

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports : API stable
// ─────────────────────────────────────────────────────────────────────────────

export type { BuiltPromptResult } from "./minimal-panel-prompt/prompt-builder-core";
export { buildMinimalPanelPrompt } from "./minimal-panel-prompt/prompt-builder-core";

export {
  buildPromptActionBlock,
  buildPromptEnvironmentBlock,
  buildPromptShotBlock,
  buildPromptStyleBlock,
  buildPromptSubjectBlock,
  CHARACTER_CONFIGURATOR_PROMPT_MAX,
  compactConfiguratorTraitsForPrompt,
  describeCharacterWithCanon,
  formatLoraBindingsForPrompt,
} from "./minimal-panel-prompt/prompt-blocks";

export {
  formatEnvironmentDnaForPrompt,
  formatNpcVisualDnaForPrompt,
  formatWorldPropsVisualDnaForPrompt,
} from "./minimal-panel-prompt/prompt-environment-npc";

export {
  ContradictoryPanelPromptError,
  FORBIDDEN_BY_RENDER_MODE,
  HardLockWithoutReferencesError,
  NegationInPositivePromptError,
  buildPromptNegativeBlock,
  detectContradictoryTokens,
  detectHardLockInvocationWithoutRefs,
  detectNegationsInPositive,
} from "./minimal-panel-prompt/prompt-negative-block";

export { buildMinimalPanelPromptStrict } from "./minimal-panel-prompt/prompt-strict";

// ─────────────────────────────────────────────────────────────────────────────
// Alias CTO (PR4) — préservés pour compat
// ─────────────────────────────────────────────────────────────────────────────

/** PR4 — alias CTO : props visibles plafonnées (voir `WORLD_PROP_PROMPT_MAX`). */
export function compactPropDnaForPrompt(spec: PanelRenderSpec): string {
  return formatWorldPropsVisualDnaForPrompt(spec);
}

/** PR4 — alias CTO : blocs CREATURES / VEHICLES / FACTIONS / NPCS (P0.12, `NPC_PROMPT_MAX`). */
export function compactNpcDnaForPrompt(spec: PanelRenderSpec): string {
  return formatNpcVisualDnaForPrompt(spec);
}

/** PR4 — alias CTO : décor compact (`ENV_DNA_CAPS`). */
export function compactEnvironmentDnaForPrompt(
  dna: Record<string, unknown> | null | undefined,
): string {
  return formatEnvironmentDnaForPrompt(dna);
}

/** PR4 — alias CTO : traits configurateur dans le budget `CHARACTER_CONFIGURATOR_PROMPT_MAX`. */
export function compactCharacterVisualDnaForPrompt(
  dna: PanelRenderCharacterVisualDna | null | undefined,
  maxChars?: number,
): string {
  return compactConfiguratorTraitsForPrompt(dna, maxChars);
}
