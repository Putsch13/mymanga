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
 * Données et logique de sélection découpées dans `_npc-ontology/`.
 */

export { NPC_ONTOLOGY } from "./_npc-ontology/data";
export { generateNpcSelection } from "./_npc-ontology/selection";
