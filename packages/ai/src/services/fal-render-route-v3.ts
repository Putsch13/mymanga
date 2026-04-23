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
  creatureFocused: "fal-panel-creature-v3",
  threatFocused: "fal-panel-threat-v3",
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
  enemy_reveal: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.characterFocused,
    panelCategory: "ENEMY_REVEAL",
    referencePolicy: "STRONG",
    sizePreset: "portrait",
    retryPolicy: "strict_character",
  },
  creature_reveal: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.creatureFocused,
    panelCategory: "CREATURE_REVEAL",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "strict_environment",
  },
  threat_silhouette: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.threatFocused,
    panelCategory: "THREAT_SILHOUETTE",
    referencePolicy: "LIGHT",
    sizePreset: "landscape",
    retryPolicy: "strict_environment",
  },
  aftermath_dialogue: {
    modelId: FAL_RENDER_ROUTE_MODEL_IDS.dialogueFocused,
    panelCategory: "AFTERMATH_DIALOGUE",
    referencePolicy: "STRONG",
    sizePreset: "square",
    retryPolicy: "strict_character",
  },
};

/**
 * COMMIT C — erreur dédiée pour un renderMode inconnu.
 * Évite un crash implicite `cannot read property .modelId of undefined`
 * et remplace par un log premium explicite.
 */
export class UnknownRenderModeError extends Error {
  renderMode: string;
  constructor(renderMode: string) {
    super(
      `fal_render_route.unknown_render_mode=${renderMode} (premium v3 refuse un storyboard dont le panel n'est pas typé)`,
    );
    this.name = "UnknownRenderModeError";
    this.renderMode = renderMode;
  }
}

/**
 * COMMIT C — erreur dédiée pour un héros visible sans refs.
 * Aujourd'hui la route pouvait encore passer en `NONE` si le spec oubliait
 * de marquer `hasHeroOrSupport`. On refuse explicitement : un panel avec
 * un hero/support visible DOIT router avec `referencePolicy !== "NONE"`.
 */
export class HeroWithoutReferencesError extends Error {
  constructor(public readonly panelId: string, public readonly renderMode: string) {
    super(
      `fal_render_route.hero_without_references panelId=${panelId} renderMode=${renderMode} — le héros doit toujours avoir au moins LIGHT, jamais NONE`,
    );
    this.name = "HeroWithoutReferencesError";
  }
}

/**
 * Résout la route FAL d'un panel à partir de son PanelRenderSpec.
 *
 * Garanties (COMMIT C — durci) :
 *   - aucun regex, aucune heuristique basée sur le texte
 *   - throw `UnknownRenderModeError` si `renderMode` est inconnu / hors table
 *     (plus de fallback `CHARACTER_IN_SCENE` silencieux)
 *   - throw `HeroWithoutReferencesError` si hero/support visible et que la
 *     politique finale resterait `NONE`
 *   - si un héros/support est présent, `referencePolicy` est toujours au
 *     moins LIGHT (jamais NONE)
 *   - la route est déterministe : même spec → même route
 */
export function resolveFalRenderRoute(spec: PanelRenderSpec): FalRenderRoute {
  const base = RENDER_MODE_ROUTE_TABLE[spec.renderMode];
  if (!base) {
    throw new UnknownRenderModeError(String(spec.renderMode ?? "null"));
  }
  const hasHeroOrSupport = spec.visibleCharacters.some(
    (c) => c.role === "hero" || c.role === "support",
  );
  const policy: FalRenderRoute["referencePolicy"] = hasHeroOrSupport
    ? base.referencePolicy === "NONE"
      ? "LIGHT"
      : base.referencePolicy
    : base.referencePolicy;
  if (hasHeroOrSupport && policy === "NONE") {
    throw new HeroWithoutReferencesError(spec.panelId, spec.renderMode);
  }
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
