import {
  buildConstraintGraph,
  evaluateOntologyCandidate,
  mergeConstraintDecisions,
} from "../../constraint-graph";
import { hashSeed } from "../../seeded-rng";
import type { SceneBlueprint, SceneBlueprintInput } from "../../types";
import { CREATURE_ONTOLOGY, generateCreatureSelection } from "../creature-ontology";
import { LOCATION_ONTOLOGY, generateLocationSelection } from "../location-ontology";
import { NPC_ONTOLOGY, generateNpcSelection } from "../npc-ontology";
import { assembleSceneBlueprint } from "./assemble";
import { filterSelection, toSelection } from "./utils";

/**
 * Blueprint dérivé des ontologies legacy (NPC / lieux / créatures).
 *
 * Note : conservé pour les chemins legacy uniquement. Le premium utilise les
 * contrats `VisualWorldContract` et `PanelTextContract`.
 */
export function buildSceneBlueprintFromOntologies(input: SceneBlueprintInput): SceneBlueprint {
  const normalizedSeed =
    input.seed
    ?? hashSeed(
      `${input.panelId}:${input.narrative.sceneSummary}:${input.scene.location}:${input.style.universe}`,
    );

  const selectedNpcs = toSelection(generateNpcSelection(input, normalizedSeed + 11));
  const selectedLocations = toSelection(generateLocationSelection(input, normalizedSeed + 17));
  const selectedCreatures = toSelection(generateCreatureSelection(input, normalizedSeed + 23));

  const ontologyCandidates = [
    ...NPC_ONTOLOGY.filter((entry) =>
      selectedNpcs.primary.some((selected) => selected.sourceOntologyId === entry.id),
    ),
    ...LOCATION_ONTOLOGY.filter((entry) =>
      selectedLocations.primary.some((selected) => selected.sourceOntologyId === entry.id),
    ),
    ...CREATURE_ONTOLOGY.filter((entry) =>
      selectedCreatures.primary.some((selected) => selected.sourceOntologyId === entry.id),
    ),
  ];
  const candidatePairs = ontologyCandidates.map((entry) => ({
    entry,
    decision: evaluateOntologyCandidate(input, entry),
  }));
  const acceptedIds = new Set(
    candidatePairs.filter((pair) => pair.decision.accepted).map((pair) => pair.entry.id),
  );
  const filteredNpcs = filterSelection(selectedNpcs, acceptedIds);
  const filteredLocations = filterSelection(selectedLocations, acceptedIds);
  const filteredCreatures = filterSelection(selectedCreatures, acceptedIds);

  const acceptedDecisions = candidatePairs
    .filter((pair) => pair.decision.accepted)
    .map((pair) => pair.decision);
  const decision = mergeConstraintDecisions(
    acceptedDecisions.length > 0
      ? acceptedDecisions
      : candidatePairs.map((pair) => pair.decision),
  );
  const graph = buildConstraintGraph(input, ontologyCandidates);

  return assembleSceneBlueprint({
    input,
    normalizedSeed,
    filteredNpcs,
    filteredLocations,
    filteredCreatures,
    decision,
    graph,
  });
}
