import { buildConstraintGraph, evaluateOntologyCandidate, mergeConstraintDecisions } from "./constraint-graph";
import { generateCreatureSelection, CREATURE_ONTOLOGY } from "./creature-ontology";
import { generateLocationSelection, LOCATION_ONTOLOGY } from "./location-ontology";
import { generateNpcSelection, NPC_ONTOLOGY } from "./npc-ontology";
import { createSeededRng, hashSeed } from "./seeded-rng";
import type {
  ProceduralEntity,
  ProceduralSelection,
  SceneBlueprint,
  SceneBlueprintInput,
} from "./types";

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function deriveLocationSignals(input: SceneBlueprintInput) {
  const tokens = input.scene.location
    .split(/[\s,/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 3);
  const genreSignals =
    input.style.universe.toLowerCase().includes("post")
      ? ["ruines lisibles", "horizon fracturé"]
      : input.style.universe.toLowerCase().includes("romance")
        ? ["profondeur décorative douce", "lumière enveloppante"]
        : input.style.universe.toLowerCase().includes("cyber")
          ? ["perspective néon", "couches urbaines lisibles"]
          : ["profondeur spatiale", "signaux de lieu lisibles"];
  return uniq([input.scene.location, ...tokens, ...genreSignals]);
}

function toSelection(primary: ProceduralEntity[]): ProceduralSelection {
  return {
    primary,
    secondary: primary.slice(1),
    traces: primary
      .flatMap((item) =>
        item.interactionHooks.slice(0, 1).map((hook, index) => ({
          id: `${item.id}-trace-${index}`,
          label: hook,
          kind: "trace" as const,
          visualCues: item.visualCues.slice(0, 2),
          interactionHooks: [hook],
          sourceOntologyId: item.sourceOntologyId,
        })),
      ),
  };
}

function filterSelection(selection: ProceduralSelection, acceptedIds: Set<string>): ProceduralSelection {
  return {
    primary: selection.primary.filter((item) => acceptedIds.has(item.sourceOntologyId)),
    secondary: selection.secondary.filter((item) => acceptedIds.has(item.sourceOntologyId)),
    traces: selection.traces.filter((item) => acceptedIds.has(item.sourceOntologyId)),
  };
}

function chooseWeather(input: SceneBlueprintInput, seed: number) {
  if (input.scene.weather) return input.scene.weather;
  const rng = createSeededRng(seed + 14);
  const options =
    input.style.universe.toLowerCase().includes("romance")
      ? ["clear", "golden breeze", "light petals"]
      : input.style.universe.toLowerCase().includes("cyber")
        ? ["rain", "mist", "acid drizzle"]
        : input.style.universe.toLowerCase().includes("post")
          ? ["dust storm", "dry wind", "toxic haze"]
          : ["clear", "cloudy", "wind"];
  return rng.pickOne(options);
}

function chooseTimeOfDay(input: SceneBlueprintInput, seed: number) {
  if (input.scene.timeOfDay) return input.scene.timeOfDay;
  const rng = createSeededRng(seed + 7);
  return rng.pickOne(["dawn", "day", "sunset", "night"]);
}

export function buildSceneBlueprint(input: SceneBlueprintInput): SceneBlueprint {
  const normalizedSeed =
    input.seed
    ?? hashSeed(
      `${input.panelId}:${input.narrative.sceneSummary}:${input.scene.location}:${input.style.universe}`,
    );
  const rng = createSeededRng(normalizedSeed);
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
  const acceptedDecisions = candidatePairs.filter((pair) => pair.decision.accepted).map((pair) => pair.decision);
  const decision = mergeConstraintDecisions(
    acceptedDecisions.length > 0 ? acceptedDecisions : candidatePairs.map((pair) => pair.decision),
  );
  const graph = buildConstraintGraph(input, ontologyCandidates);

  const locationSignals = uniq([
    ...deriveLocationSignals(input),
    ...filteredLocations.primary.flatMap((item) => item.visualCues),
  ]);
  const atmosphereSignals = uniq([
    chooseWeather(input, normalizedSeed),
    chooseTimeOfDay(input, normalizedSeed),
    ...filteredLocations.primary.flatMap((item) => item.interactionHooks.slice(0, 2)),
    ...filteredCreatures.primary.flatMap((item) => item.visualCues.slice(0, 1)),
  ]);
  const foregroundElements = uniq([
    ...input.composition.focusCharacters,
    ...filteredCreatures.primary.map((item) => item.label).slice(0, 1),
    ...filteredLocations.primary.flatMap((item) => item.visualCues.slice(0, 1)),
  ]);
  const midgroundElements = uniq([
    ...input.composition.backgroundExtras,
    ...filteredNpcs.primary.map((item) => item.label),
    ...filteredLocations.primary.flatMap((item) => item.visualCues.slice(1, 3)),
  ]);
  const backgroundElements = uniq([
    ...filteredLocations.primary.flatMap((item) => item.visualCues.slice(2)),
    ...filteredNpcs.secondary.map((item) => item.label),
    ...filteredCreatures.secondary.map((item) => item.label),
  ]);
  const props = uniq([
    ...filteredLocations.traces.map((item) => item.label),
    ...filteredNpcs.primary.flatMap((item) => item.visualCues.slice(0, 1)),
  ]);
  const traces = uniq([
    ...filteredLocations.traces.map((item) => item.label),
    ...filteredCreatures.traces.map((item) => item.label),
  ]);

  const shotType = input.composition.shotType;
  const normalizedBackgroundElements =
    backgroundElements.length === 0 && shotType === "wide"
      ? locationSignals.slice(0, 3)
      : backgroundElements;
  const framingRules = uniq([
    shotType === "wide" ? "full environment visible" : "",
    shotType === "medium" ? "character and environment both readable" : "",
    shotType.includes("close") ? "keep environmental cues in background" : "",
    shotType === "over_shoulder" ? "preserve spatial relation between foreground and target" : "",
  ]);
  const hard = uniq([
    `Respect universe: ${input.style.universe}`,
    `Respect tone: ${input.style.tone}`,
    ...input.continuity.anchors.map((anchor) => `Continuity anchor: ${anchor}`),
    ...input.continuity.worldRules.map((rule) => `World rule: ${rule}`),
    ...decision.hardFailures.map((failure) => `Avoid: ${failure}`),
  ]);
  const soft = uniq([
    `Novelty bounded at ${input.controls.noveltyLevel}/100`,
    `Environment richness bounded at ${input.controls.environmentRichness}/100`,
    ...input.continuity.styleRules.map((rule) => `Style rule: ${rule}`),
    ...input.continuity.loreConstraints.map((rule) => `Lore: ${rule}`),
    ...decision.softWarnings,
  ]);

  const progressionBeat = uniq([
    input.narrative.scenePurpose,
    input.narrative.panelIntent,
    input.narrative.pageRole,
  ]).join(" -> ");
  const interactionBeat = uniq([
    filteredNpcs.primary[0]?.interactionHooks[0],
    filteredCreatures.primary[0]?.interactionHooks[0],
    input.narrative.panelIntent,
  ]).join(" / ");
  const spatialRelations = uniq([
    foregroundElements[0] ? `foreground: ${foregroundElements[0]}` : "",
    midgroundElements[0] ? `midground: ${midgroundElements[0]}` : "",
    normalizedBackgroundElements[0] ? `background: ${normalizedBackgroundElements[0]}` : "",
  ]);

  return {
    id: input.panelId,
    seed: normalizedSeed,
    narrativeContext: {
      chapterGoal: input.narrative.chapterGoal ?? null,
      sceneSummary: input.narrative.sceneSummary,
      scenePurpose: input.narrative.scenePurpose,
      panelIntent: input.narrative.panelIntent,
      panelNarration: input.narrative.panelNarration ?? null,
      pageRole: input.narrative.pageRole ?? null,
      progressionBeat,
    },
    styleContext: {
      universe: input.style.universe,
      tone: input.style.tone,
      visualStyle: input.style.visualStyle,
      renderFamily: input.style.renderFamily ?? null,
      cameraLanguage: input.style.cameraLanguage ?? null,
      backgroundDensity: input.style.backgroundDensity ?? null,
      noveltyLevel: input.controls.noveltyLevel,
      worldStrictness: input.controls.worldStrictness,
      visualExoticism: input.controls.visualExoticism,
      npcVariety: input.controls.npcVariety,
      environmentRichness: input.controls.environmentRichness,
    },
    environment: {
      primaryLocation: input.scene.location,
      secondaryLocationSignals: locationSignals.slice(1, 5),
      weather: chooseWeather(input, normalizedSeed),
      timeOfDay: chooseTimeOfDay(input, normalizedSeed),
      atmosphereSignals,
      foregroundElements,
      midgroundElements,
      backgroundElements: normalizedBackgroundElements,
      mustShowLocationSignals: locationSignals.slice(0, 5),
      persistentSceneAnchors: uniq([
        input.scene.location,
        ...input.continuity.anchors,
        ...filteredLocations.primary.map((item) => item.label),
      ]),
      props,
      traces,
    },
    cast: {
      foregroundSubjects: uniq([...input.composition.focusCharacters, ...input.cast.namedCharacters.slice(0, 1)]),
      midgroundSubjects: uniq([...input.composition.requiredCharacters.filter((name) => !input.composition.focusCharacters.includes(name)), ...filteredNpcs.primary.map((item) => item.label)]),
      backgroundSubjects: uniq([...input.composition.backgroundExtras, ...filteredCreatures.secondary.map((item) => item.label)]),
      npcPresence: filteredNpcs.primary.map((item) => item.label),
      creaturePresence: uniq([
        ...input.cast.creatureNames,
        ...filteredCreatures.primary.map((item) => item.label),
      ]),
    },
    composition: {
      shotType,
      cameraAngle: input.composition.cameraAngle,
      framingRules,
      interactionBeat,
      spatialRelations,
    },
    constraints: {
      hard,
      soft,
      graph,
      decision,
    },
    procedural: {
      selectedNpcs: filteredNpcs,
      selectedLocations: filteredLocations,
      selectedCreatures: filteredCreatures,
    },
    promptBridge: {
      actionLine: uniq([
        input.narrative.panelIntent,
        filteredNpcs.primary[0]?.interactionHooks[0],
        filteredCreatures.primary[0]?.interactionHooks[0],
      ]).join(". "),
      sceneContextLine: uniq([
        input.narrative.sceneSummary,
        `progression: ${progressionBeat}`,
        `interaction: ${interactionBeat}`,
      ]).join(" · "),
      environmentLine: uniq([
        `location signals: ${locationSignals.slice(0, 4).join(", ")}`,
        `weather: ${chooseWeather(input, normalizedSeed)}`,
        `time: ${chooseTimeOfDay(input, normalizedSeed)}`,
        `foreground/mid/background: ${spatialRelations.join(" | ")}`,
      ]).join(" · "),
      hardConstraintLine: hard.join(" | "),
      softConstraintLine: soft.slice(0, 5).join(" | "),
    },
  };
}
