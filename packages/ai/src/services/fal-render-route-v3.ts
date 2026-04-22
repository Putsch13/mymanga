/**
 * fal-render-route-v3 — routeur FAL strictement basé sur `renderMode`.
 *
 * Remplace les heuristiques legacy de `fal-scene-strategy.ts` (regex sur
 * `scenePurpose`, promotion implicite du héros, `subjectFocus` ambigü) par
 * un mapping explicite renderMode → `FalRenderRoute`.
 *
 * Règles strictes :
 *   - aucune inférence du "sens" de la case : le storyboard a déjà décidé
 *     via `renderMode`
 *   - `referencePolicy` n'est jamais `NONE` quand un héros/support est
 *     présent (validé en amont par `validateRenderSpec`)
 *   - `retryPolicy` choisit strict_character pour closeups perso, strict_environment pour décors, standard sinon
 *   - `sizePreset` adapté au type de plan (portrait pour closeups, paysage
 *     pour establishing, etc.)
 */

import type {
  FalRenderRoute,
  PanelRenderSpec,
} from "../contracts/panel-render-spec";
import type { StoryboardRenderMode } from "../contracts/storyboard-plan";

/**
 * Politique modelId : on garde volontairement des identifiants symboliques
 * qui mappent vers les modèles FAL réels dans l'orchestrateur d'adapters.
 * Ça évite de coupler la table de routing à un modèle FAL précis.
 */
export const FAL_RENDER_ROUTE_MODEL_IDS = {
  characterFocused: "fal-panel-character-v3",
  environmentFocused: "fal-panel-environment-v3",
  insertFocused: "fal-panel-insert-v3",
  groupFocused: "fal-panel-group-v3",
  combatFocused: "fal-panel-combat-v3",
  dialogueFocused: "fal-panel-dialogue-v3",
} as const;

interface RouteBase {
  modelId: string;
  panelCategory: string;
  referencePolicy: FalRenderRoute["referencePolicy"];
  sizePreset: FalRenderRoute["sizePreset"];
  retryPolicy: FalRenderRoute["retryPolicy"];
}

const RENDER_MODE_ROUTE_TABLE: Record<StoryboardRenderMode, RouteBase> = {
  establishing_environment: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.environmentFocused,
    panelCategory: "ESTABLISHING_ENVIRONMENT",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "strict_environment",
  },
  silent_transition: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.environmentFocused,
    panelCategory: "SILENT_TRANSITION",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "strict_environment",
  },
  dialogue_two_shot: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.dialogueFocused,
    panelCategory: "DIALOGUE_TWO_SHOT",
    referencePolicy: "STRONG",
    sizePreset: "square",
    retryPolicy: "strict_character",
  },
  dialogue_over_shoulder: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.dialogueFocused,
    panelCategory: "DIALOGUE_OVER_SHOULDER",
    referencePolicy: "STRONG",
    sizePreset: "square",
    retryPolicy: "strict_character",
  },
  reaction_closeup: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.characterFocused,
    panelCategory: "REACTION_CLOSEUP",
    referencePolicy: "STRONG",
    sizePreset: "portrait",
    retryPolicy: "strict_character",
  },
  hero_closeup: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.characterFocused,
    panelCategory: "HERO_CLOSEUP",
    referencePolicy: "STRONG",
    sizePreset: "portrait",
    retryPolicy: "strict_character",
  },
  npc_closeup: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.characterFocused,
    panelCategory: "NPC_CLOSEUP",
    referencePolicy: "STRONG",
    sizePreset: "portrait",
    retryPolicy: "strict_character",
  },
  enemy_closeup: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.characterFocused,
    panelCategory: "ENEMY_CLOSEUP",
    referencePolicy: "STRONG",
    sizePreset: "portrait",
    retryPolicy: "strict_character",
  },
  insert_object: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.insertFocused,
    panelCategory: "INSERT_OBJECT",
    referencePolicy: "LIGHT",
    sizePreset: "square",
    retryPolicy: "standard",
  },
  surveillance_reveal: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.environmentFocused,
    panelCategory: "SURVEILLANCE_REVEAL",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "strict_environment",
  },
  group_tension: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.groupFocused,
    panelCategory: "GROUP_TENSION",
    referencePolicy: "STRONG",
    sizePreset: "landscape",
    retryPolicy: "strict_character",
  },
  combat_exchange: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.combatFocused,
    panelCategory: "COMBAT_EXCHANGE",
    referencePolicy: "STRONG",
    sizePreset: "landscape",
    retryPolicy: "strict_character",
  },
  combat_aftermath: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.combatFocused,
    panelCategory: "COMBAT_AFTERMATH",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "standard",
  },
};

/**
 * Résout la route FAL d'un panel à partir de son PanelRenderSpec.
 *
 * Garanties :
 *   - aucun regex, aucune heuristique basée sur le texte
 *   - si un héros/support est présent, `referencePolicy` est toujours au
 *     moins LIGHT (jamais NONE)
 *   - la route est déterministe : même spec → même route
 */
export function resolveFalRenderRoute(spec: PanelRenderSpec): FalRenderRoute {
  const base = RENDER_MODE_ROUTE_TABLE[spec.renderMode];
  const hasHeroOrSupport = spec.visibleCharacters.some(
    (c) => c.role === "hero" || c.role === "support",
  );
  const policy: FalRenderRoute["referencePolicy"] = hasHeroOrSupport
    ? base.referencePolicy === "NONE"
      ? "LIGHT"
      : base.referencePolicy
    : base.referencePolicy;
  return {
    modelId: base.modelId,
    panelCategory: base.panelCategory,
    referencePolicy: policy,
    sizePreset: base.sizePreset,
    retryPolicy: base.retryPolicy,
  };
}

/**
 * Expose la table de routage pour les tests / audits / documentation.
 */
export function getFalRenderRouteTable(): Readonly<
  Record<StoryboardRenderMode, Readonly<RouteBase>>
> {
  return RENDER_MODE_ROUTE_TABLE;
}
