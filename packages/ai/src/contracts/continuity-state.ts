/**
 * ContinuityState — snapshot de continuité narrative/physique à un instant
 * donné (début ou fin d'un chapitre / beat).
 *
 * Source de vérité minimale commune entre :
 *   - StoryArc (continuityBefore / continuityAfter)
 *   - StoryBeat (continuityEffects)
 *   - runStoryPass, runStoryboardPass, runRenderPass
 *
 * Volontairement minimal : on évite de reproduire ici la totalité du
 * ContinuityKernel legacy. Ce contrat est la couche "narrative essentielle"
 * qui doit survivre entre chapitres et beats. Les détails physiques fins
 * restent dans le ContinuityKernel / canon existants.
 */

export interface ContinuityCharacterState {
  characterId: string;
  name: string;
  bodyState: string | null;
  outfitState: string | null;
  emotionalState: string | null;
  knownFacts: string[];
  carriedItems: string[];
  location: string | null;
}

export interface ContinuityLocationState {
  locationId: string | null;
  name: string;
  state: string | null;
  visibleProps: string[];
}

export interface ContinuityState {
  worldTime: string | null;
  activeCharacters: ContinuityCharacterState[];
  knownLocations: ContinuityLocationState[];
  unresolvedThreads: string[];
  activeItems: string[];
  lastKnownEvents: string[];
}

export function createEmptyContinuityState(): ContinuityState {
  return {
    worldTime: null,
    activeCharacters: [],
    knownLocations: [],
    unresolvedThreads: [],
    activeItems: [],
    lastKnownEvents: [],
  };
}
