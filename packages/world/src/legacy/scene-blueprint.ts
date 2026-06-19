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
 * Implémentation découpée dans `_scene-blueprint/`.
 */

import type { SceneBlueprint, SceneBlueprintInput } from "../types";
import { buildSceneBlueprintNarrativeFirst } from "./_scene-blueprint/narrative-first";
import { buildSceneBlueprintFromOntologies } from "./_scene-blueprint/ontology-based";

/** Premium IA-first : pas de tirage depuis les petites ontologies NPC/lieu/créature. */
export type BuildSceneBlueprintOptions = {
  disableOntologySelections?: boolean;
};

/**
 * Construit un scene blueprint legacy.
 *
 * - `disableOntologySelections=true` → narrative-first (sans NPC/LOCATION/CREATURE legacy).
 * - sinon → variante basée sur les ontologies legacy.
 */
export function buildSceneBlueprint(
  input: SceneBlueprintInput,
  options?: BuildSceneBlueprintOptions,
): SceneBlueprint {
  if (options?.disableOntologySelections) {
    return buildSceneBlueprintNarrativeFirst(input);
  }
  return buildSceneBlueprintFromOntologies(input);
}
