/**
 * P1.1 — Generation Intent Planner
 *
 * Avant de générer les images d'un chapitre, ce module produit un plan
 * d'intention explicite pour chaque panel. Chaque `PanelGenerationIntent`
 * contient tout ce que le routing et le prompting doivent savoir pour
 * produire une image cohérente avec le type de panel.
 *
 * Implémentation découpée dans `_generation-intent-planner/`.
 */

export type {
  CharacterCastInfo,
  DominantSubjectType,
  FramingCategory,
  GenerationIntentPlannerInput,
  IntentRequiredProp,
  LocationCanonInfo,
  NarrativeFactInput,
  PanelGenerationIntent,
  PanelIntentType,
  PanelPlanInput,
  ReferencePolicyIntent,
  RequiredEntity,
  RequiredReferenceSet,
  SuppressedEntity,
  VisualHierarchyLayer,
} from "./_generation-intent-planner/types";

export { buildPanelGenerationIntent, planChapterGenerationIntents } from "./_generation-intent-planner/build";
