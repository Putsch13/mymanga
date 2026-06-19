/**
 * P5.2 — Construction d'un `SceneSnapshot` à partir du kernel + payload.
 *
 * Extrait de `continuity-persistence-kernel.ts` :
 *   - `buildSceneSnapshot` : assemble le snapshot final d'une scène en
 *     fusionnant le `LocationState` du kernel, les overrides de la
 *     `SceneStateData`, le `SceneContinuityPayload` et les `SceneBlueprint`.
 */
import type { SceneContinuityPayload } from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import type {
  ContinuityKernel,
  SceneSnapshot,
  SceneStateData,
} from "../types";
import { textHasAny, uniq } from "./utils";
import {
  applyStructuredArcDeltas,
  applyStructuredCharacterDeltas,
  applyStructuredLocationDelta,
  applyStructuredRelationshipChanges,
} from "./delta-appliers";
import { buildFallbackCharacterState } from "./builders";

export function buildSceneSnapshot(input: {
  kernel: ContinuityKernel;
  chapterId: string;
  chapterNumber: number;
  sceneId: string;
  sceneNumber: number;
  title?: string | null;
  summary: string;
  dramaticGoal?: string | null;
  location: string;
  sceneStateData: SceneStateData;
  sceneBlueprints?: SceneBlueprint[];
  continuityPayload?: SceneContinuityPayload | null;
  participantNames?: string[];
}): SceneSnapshot {
  const baseLocationState =
    input.kernel.locationStates.find(
      (location) => location.name.toLowerCase() === input.location.toLowerCase(),
    )
    ?? {
      locationId: null,
      name: input.location,
      type: null,
      visualAnchors: [],
      state: null,
      occupants: [],
      importantProps: [],
      eventTraces: [],
      damageMarkers: [],
      corruptionMarkers: [],
      surveillanceMarkers: [],
      vegetationMarkers: [],
      narrativeFunction: null,
    };

  const baseCharacterStates = input.sceneStateData.characterOverrides.map((override) => {
    const base =
      input.kernel.characterStates.find((state) => state.characterId === override.characterId)
      ?? {
        ...buildFallbackCharacterState({
          id: override.characterId,
          name: override.characterId,
          roleType: null,
          emotionalState: override.emotionalState ?? null,
          objective: null,
          fear: null,
          outfitDefault: override.outfit ?? null,
          hairColor: null,
          eyeColor: null,
          traits: [],
          biography: null,
        }),
      };
    return {
      ...base,
      currentState: {
        ...base.currentState,
        location: input.location,
        outfit: override.outfit ?? base.currentState.outfit ?? null,
        injuries: override.visibleInjuries,
        emotion: override.emotionalState ?? base.currentState.emotion ?? null,
        possessions: uniq([...(base.currentState.possessions ?? []), ...override.props]),
        obligations: uniq([...(base.currentState.obligations ?? []), ...base.continuityObligations]),
        knowledge: base.currentState.knowledge ?? [],
        objective: base.currentState.objective ?? null,
        fatigue: base.currentState.fatigue ?? null,
      },
    };
  });

  const characterStates = applyStructuredCharacterDeltas(
    baseCharacterStates,
    input.continuityPayload,
    input.location,
  );
  const participantIds = new Set(characterStates.map((state) => state.characterId));
  const baseRelationshipGraph = input.kernel.relationshipGraph.filter(
    (edge) =>
      participantIds.has(edge.sourceCharacterId) || participantIds.has(edge.targetCharacterId),
  );
  const relationshipGraph = applyStructuredRelationshipChanges(
    baseRelationshipGraph,
    input.continuityPayload,
    characterStates,
  );

  const sceneBlueprintHints = {
    visualAnchors: uniq(input.sceneBlueprints?.flatMap((blueprint) => blueprint.environment.persistentSceneAnchors) ?? []),
    worldRules: uniq(input.sceneBlueprints?.flatMap((blueprint) => blueprint.constraints.hard) ?? []),
    narrativeConstraints: uniq(
      input.sceneBlueprints?.flatMap((blueprint) => [
        blueprint.narrativeContext.progressionBeat,
        blueprint.composition.interactionBeat,
      ]) ?? [],
    ),
  };

  const activeArc =
    input.kernel.arcRegistry.find((arc) =>
      textHasAny(`${input.summary} ${input.dramaticGoal ?? ""}`, [arc.name, ...arc.openPromises]),
    )
    ?? input.kernel.arcRegistry.find((arc) => arc.status !== "closed")
    ?? null;
  const arcRegistry = applyStructuredArcDeltas(
    activeArc ? [activeArc] : input.kernel.arcRegistry,
    input.continuityPayload,
  );
  const locationState = applyStructuredLocationDelta(
    baseLocationState,
    input.continuityPayload,
    input.participantNames ?? [],
  );

  return {
    chapterId: input.chapterId,
    sceneId: input.sceneId,
    chapterNumber: input.chapterNumber,
    sceneNumber: input.sceneNumber,
    title: input.title ?? null,
    summary: input.summary,
    dramaticGoal: input.dramaticGoal ?? input.sceneStateData.dramaticGoal ?? null,
    location: {
      ...locationState,
      occupants: uniq([
        ...locationState.occupants,
        ...(input.participantNames ?? []),
      ]),
      visualAnchors: uniq([
        ...locationState.visualAnchors,
        ...sceneBlueprintHints.visualAnchors,
      ]),
      importantProps: uniq([
        ...locationState.importantProps,
        ...characterStates.flatMap((state) => state.currentState.possessions),
      ]),
    },
    characters: characterStates,
    relationshipGraph,
    recentEvents: input.kernel.eventLog.slice(0, 10),
    activeArc: arcRegistry[0] ?? activeArc,
    structuredContinuity: input.continuityPayload ?? null,
    continuityAnchors: input.sceneStateData.continuityAnchors,
    textConstraints: input.sceneStateData.textConstraints,
    sceneBlueprintHints,
  };
}
