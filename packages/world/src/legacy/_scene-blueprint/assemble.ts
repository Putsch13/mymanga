import type {
  ConstraintDecision,
  ConstraintGraph,
  ProceduralSelection,
  SceneBlueprint,
  SceneBlueprintInput,
} from "../../types";
import { buildPremiumPromptBridgeLines } from "./premium-prompt-bridge";
import {
  chooseTimeOfDay,
  chooseWeather,
  deriveLocationSignals,
  uniq,
} from "./utils";

export interface AssembleSceneBlueprintArgs {
  input: SceneBlueprintInput;
  normalizedSeed: number;
  filteredNpcs: ProceduralSelection;
  filteredLocations: ProceduralSelection;
  filteredCreatures: ProceduralSelection;
  decision: ConstraintDecision;
  graph: ConstraintGraph;
}

/**
 * Assemble final SceneBlueprint object from filtered selections.
 *
 * Used by both narrative-first (no ontology) and ontology-based variants.
 */
export function assembleSceneBlueprint(args: AssembleSceneBlueprintArgs): SceneBlueprint {
  const { input, normalizedSeed, filteredNpcs, filteredLocations, filteredCreatures, decision, graph } = args;

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
      foregroundSubjects: uniq([
        ...input.composition.focusCharacters,
        ...input.cast.namedCharacters.slice(0, 1),
      ]),
      midgroundSubjects: uniq([
        ...input.composition.requiredCharacters.filter(
          (name) => !input.composition.focusCharacters.includes(name),
        ),
        ...filteredNpcs.primary.map((item) => item.label),
      ]),
      backgroundSubjects: uniq([
        ...input.composition.backgroundExtras,
        ...filteredCreatures.secondary.map((item) => item.label),
      ]),
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
      ...buildPremiumPromptBridgeLines(input),
    },
  };
}
