/**
 * Ré-export depuis `@manga-ai-studio/core` — logique canon lieu partagée.
 */

export {
  resolveLocationVisualCanon,
  isLocationCanonical,
  locationRequiresVisualContinuity,
  summarizeLocationCanonForPrompt,
} from "@manga-ai-studio/core";

export type {
  ResolvedLocationVisualRef,
  ResolvedLocationVisualCanon,
  LocationCanonInput,
  CompactLocationCanonSummary,
} from "@manga-ai-studio/core";
