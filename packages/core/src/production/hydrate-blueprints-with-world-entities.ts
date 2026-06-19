/**
 * P0.12 — Hydratation des entités monde sur les blueprints premium (canon CTO).
 *
 * Remplit `npcVisualDna` (groupes PNJ) et les tableaux dédiés
 * `creatureVisualDna` / `vehicleVisualDna` / `factionVisualDna` depuis un
 * {@link VisualWorldContract}.
 *
 * L’implémentation vit dans `hydrate-blueprints-with-npc-dna.ts` (nom historique) ;
 * ce module est l’API préférée pour les nouveaux appels.
 */

export {
  hydrateBlueprintsWithNpcDna as hydrateBlueprintsWithWorldEntities,
  type HydrateBlueprintsWithNpcDnaInput as HydrateBlueprintsWithWorldEntitiesInput,
} from "./hydrate-blueprints-with-npc-dna";
