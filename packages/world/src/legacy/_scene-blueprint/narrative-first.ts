import { buildConstraintGraph, mergeConstraintDecisions } from "../../constraint-graph";
import { hashSeed } from "../../seeded-rng";
import type { SceneBlueprint, SceneBlueprintInput } from "../../types";
import { assembleSceneBlueprint } from "./assemble";
import { deriveLocationSignals, syntheticProceduralEntity, toSelection } from "./utils";

/**
 * Blueprint décor / cast dérivé uniquement du texte de scène, du cast et des extras —
 * sans `NPC_ONTOLOGY` / `LOCATION_ONTOLOGY` / `CREATURE_ONTOLOGY`.
 */
export function buildSceneBlueprintNarrativeFirst(input: SceneBlueprintInput): SceneBlueprint {
  const normalizedSeed =
    input.seed
    ?? hashSeed(
      `${input.panelId}:${input.narrative.sceneSummary}:${input.scene.location}:${input.style.universe}`,
    );

  const locEntity = syntheticProceduralEntity(
    "location",
    input.scene.location,
    "narrative-location-primary",
    deriveLocationSignals(input),
    [],
  );
  const filteredLocations = toSelection([locEntity]);

  const npcEntities = (input.cast.npcNames ?? []).slice(0, 8).map((name, i) =>
    syntheticProceduralEntity(
      "npc",
      name,
      `narrative-npc-${i}`,
      [name],
      [`${name} présent dans la scène`],
    ),
  );
  const filteredNpcs = toSelection(
    npcEntities.length > 0
      ? npcEntities
      : [
          syntheticProceduralEntity(
            "npc",
            "figurants",
            "narrative-npc-crowd",
            ["foule"],
            ["présence de foule"],
          ),
        ],
  );

  const creatureEntities = (input.cast.creatureNames ?? []).slice(0, 6).map((name, i) =>
    syntheticProceduralEntity("creature", name, `narrative-creature-${i}`, [name], []),
  );
  const filteredCreatures = toSelection(creatureEntities);

  const decision = mergeConstraintDecisions([]);
  const graph = buildConstraintGraph(input, []);

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
