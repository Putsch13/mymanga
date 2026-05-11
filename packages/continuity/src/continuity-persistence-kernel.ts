/**
 * P5.2 — Façade publique du `continuity-persistence-kernel`.
 *
 * Réexporte uniquement les helpers et fonctions extraits dans
 * `./kernel/*` pour préserver l'API consommée par
 * `@manga-ai-studio/continuity` :
 *
 *   - utils         : `prohibitionIsViolated` (réexport pré-existant)
 *   - load          : `loadContinuityKernel`
 *   - scene snapshot: `buildSceneSnapshot`
 *   - validation    : `validateSceneSnapshotAgainstKernel`
 *   - events        : `deriveSceneEvents`, `applySceneEventsToKernel`
 *   - persistance   : `persistValidatedSceneContinuity`
 *   - chapter       : `buildChapterSnapshot`,
 *                     `materializeCanonStateFromChapterSnapshot`
 *
 * Toute la logique vit désormais dans `./kernel/`.
 */

export { prohibitionIsViolated } from "./kernel/utils";
export { loadContinuityKernel } from "./kernel/load-kernel";
export { buildSceneSnapshot } from "./kernel/build-scene-snapshot";
export { validateSceneSnapshotAgainstKernel } from "./kernel/validate-scene-snapshot";
export {
  deriveSceneEvents,
  applySceneEventsToKernel,
} from "./kernel/derive-scene-events";
export { persistValidatedSceneContinuity } from "./kernel/persist-scene-continuity";
export {
  buildChapterSnapshot,
  materializeCanonStateFromChapterSnapshot,
} from "./kernel/chapter-snapshot";
