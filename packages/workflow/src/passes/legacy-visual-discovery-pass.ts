/**
 * LEGACY FALLBACK ONLY.
 *
 * This file must not be used by premium generation.
 * Premium generation must use:
 * - VisualWorldContract for world entities
 * - PanelTextContract for dialogue
 * - CharacterCanon / characterVisualDna for characters
 *
 * If imported in premium path, this is a bug.
 *
 * P1.4 — VisualDiscoveryPass : détection automatique des entités visuelles
 * (texte / regex). Réservé aux pipelines non premium.
 *
 * Implémentation découpée dans `_legacy-visual-discovery-pass/`.
 *
 * @module legacy-visual-discovery-pass
 */

export type {
  BeatVisualBinding,
  CanonLevel,
  ChapterVisualDiscoveryContract,
  DiscoveredEntityKind,
  DiscoveredVisualEntity,
  DiscoverySource,
  VisualDiscoveryPassInput,
  VisualDiscoveryPassResult,
} from "./_legacy-visual-discovery-pass/types";

export {
  DEFAULT_FORBIDDEN_VISUAL_PROPS,
  DEFAULT_SUSPICIOUS_VISUAL_PROPS,
} from "./_legacy-visual-discovery-pass/patterns";

export {
  formatVisualDiscoveryLog,
  runVisualDiscoveryPass,
} from "./_legacy-visual-discovery-pass/run";
