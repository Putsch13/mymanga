/**
 * SceneExtrasRegistry: gestion des PNJ persistants par scène/location.
 * Garantit que les mêmes extras réapparaissent dans la même scène.
 *
 * Façade fine — l'implémentation vit dans `_scene-extras-registry/*`.
 */

export { detectNpcVisualDrift } from "./_scene-extras-registry/drift";
export { resolveLocationByName } from "./_scene-extras-registry/locations";
export {
  buildSceneExtraVisualSignature,
  normalizeSceneExtra,
} from "./_scene-extras-registry/normalize-extras";
export {
  buildPromotedNpcDisplayName,
  classifyNpcType,
  promoteExtraToNarrativeNpc,
} from "./_scene-extras-registry/promote";
export {
  loadProjectRecurringNpcs,
  type RecurringNpcSummary,
} from "./_scene-extras-registry/recurring";
export {
  ensureSceneExtras,
  loadSceneExtras,
  persistSceneExtra,
} from "./_scene-extras-registry/scene-extras";
export { normalizeLocationKey } from "./_scene-extras-registry/utils";
