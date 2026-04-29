import { buildConstraintGraph, evaluateOntologyCandidate, mergeConstraintDecisions } from "./constraint-graph";
import { generateCreatureSelection, CREATURE_ONTOLOGY } from "./legacy/creature-ontology";
import { generateLocationSelection, LOCATION_ONTOLOGY } from "./legacy/location-ontology";
import { generateNpcSelection, NPC_ONTOLOGY } from "./legacy/npc-ontology";
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
      // Premium hard constraints derived from panel blueprint
      ...buildPremiumPromptBridgeLines(input),
    },
  };
}

function buildPremiumPromptBridgeLines(input: import("./types").SceneBlueprintInput): {
  requiredPropLine?: string;
  requiredEnemyLine?: string;
  speakerAnchorLine?: string;
  focusLine?: string;
  antiCollapseLine?: string;
  cutawayLine?: string;
} {
  const contract = input.premiumContract;
  if (!contract) return {};

  const lines: {
    requiredPropLine?: string;
    requiredEnemyLine?: string;
    speakerAnchorLine?: string;
    focusLine?: string;
    antiCollapseLine?: string;
    cutawayLine?: string;
  } = {};

  // Required props hard constraint
  if (contract.requiredPropNames && contract.requiredPropNames.length > 0) {
    const propList = contract.requiredPropNames.join(", ");
    lines.requiredPropLine = `REQUIRED PROPS (must be clearly visible): ${propList}. Do not omit or replace with generic clutter.`;
  }

  // Enemy presence hard constraint — uniquement si le panel cible réellement l'ennemi,
  // un groupe ou le héros. Sinon (cutaway environment/prop/reaction/aftermath, ou focus NPC
  // non-ennemi), cette ligne crée une contradiction dans le prompt (CUTAWAY vs REQUIRED enemy)
  // et force Flux à réinjecter un personnage en foreground au lieu du décor/PNJ.
  if (contract.mustShowEnemy) {
    const focus = contract.subjectFocus;
    const enemyRelevant =
      !focus
      || focus === "hero"
      || focus === "enemy"
      || focus === "antagonist"
      || focus === "group";
    if (enemyRelevant) {
      lines.requiredEnemyLine = "REQUIRED: enemy/adversary must be clearly present and readable in this panel. Do not replace with hero portrait.";
    }
  }

  // Speaker anchor hard constraint
  if (contract.speakerAnchorCharacterId && contract.dialogueCarrier === "speaker_visible") {
    lines.speakerAnchorLine = `REQUIRED: dialogue speaker must be visibly framed and face readable. Speaker ID: ${contract.speakerAnchorCharacterId}.`;
  } else if (contract.dialogueCarrier === "offscreen_allowed") {
    lines.speakerAnchorLine = "Speaker may be offscreen; dialogue bubble placement must be coherent.";
  }

  // Subject focus hard constraint
  if (contract.subjectFocus) {
    const focusMap: Record<string, string> = {
      hero: "primary subject: hero character",
      enemy: "primary subject: enemy/adversary — do not center the hero",
      ally: "primary subject: ally character",
      npc: "primary subject: NPC / crowd presence",
      group: "primary subject: group interaction",
      environment: "primary subject: environment / location — this is an environment cutaway, not a character portrait",
      prop: "primary subject: prop/object insert — object must be legible and foreground",
      reaction: "primary subject: reaction shot — emotional expression is the focus",
      aftermath: "primary subject: aftermath — show consequences, not action",
    };
    lines.focusLine = focusMap[contract.subjectFocus] ?? `primary subject: ${contract.subjectFocus}`;
  }

  // Anti-collapse constraint
  if (contract.cutawayType && contract.cutawayType !== "none") {
    const antiMap: Record<string, string> = {
      environment: "do not collapse this into a hero portrait; this panel must show the environment",
      enemy: "do not center the hero; enemy must be the dominant subject",
      prop_insert: "do not replace the prop with generic background; object must be foreground and readable",
      reaction: "do not omit the emotional expression; reaction must be the panel's core",
      movement_trace: "do not freeze the action; movement and trajectory must be readable",
      crowd: "do not empty the background; crowd presence is mandatory",
      aftermath: "do not show active combat; show aftermath/consequences only",
    };
    const antiLine = antiMap[contract.cutawayType];
    if (antiLine) {
      lines.antiCollapseLine = antiLine;
      if (contract.antiCollapseReason) {
        lines.antiCollapseLine += ` (reason: ${contract.antiCollapseReason})`;
      }
    }
  } else if (!contract.heroCenterAllowed) {
    lines.antiCollapseLine = "do not center the hero; this panel has a different primary subject";
  }

  // Cutaway type explicit line
  if (contract.cutawayType && contract.cutawayType !== "none") {
    const cutawayDescriptions: Record<string, string> = {
      environment_establishing: "CUTAWAY: environment establishing shot — show the location, not the characters",
      enemy_reveal: "CUTAWAY: enemy reveal — show the adversary/threat, not the hero",
      object_insert: "CUTAWAY: object insert — show the prop/object in detail, foreground readable",
      reaction_insert: "CUTAWAY: reaction insert — show emotional expression/reaction, face readable",
      location_transition: "CUTAWAY: location transition — show the new location establishing",
      threat_insert: "CUTAWAY: threat insert — show the weapon/danger, not the character holding it",
      environment: "CUTAWAY: environment — show the environment, not a character portrait",
      enemy: "CUTAWAY: enemy — show the enemy/adversary as primary subject",
      prop_insert: "CUTAWAY: prop insert — show the object/prop as primary subject",
      reaction: "CUTAWAY: reaction — show the emotional reaction as primary subject",
      npc_group: "CUTAWAY: NPC group — show the crowd/group, not the protagonist",
      surveillance: "CUTAWAY: surveillance — show the watching/observing element",
      aftermath: "CUTAWAY: aftermath — show the consequences/damage, not the action",
    };
    lines.cutawayLine = cutawayDescriptions[contract.cutawayType]
      ?? `CUTAWAY: ${contract.cutawayType} — this is a cutaway panel, not a hero portrait`;
  }

  return lines;
}
