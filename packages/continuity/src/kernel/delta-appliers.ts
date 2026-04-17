/**
 * Continuity — appliers de deltas structurés (scène → kernel).
 *
 * Extrait de continuity-persistence-kernel.ts. Chaque fonction prend un état
 * de base et un `SceneContinuityPayload` (optionnel) et retourne l'état mis à
 * jour. Elles sont pures : ne mutent pas l'entrée.
 *
 * - `applyStructuredCharacterDeltas` : position, émotion, tenue, possessions,
 *   blessures, savoirs, obligations pour chaque personnage impacté par la scène.
 * - `applyStructuredLocationDelta` : état/ancrages/occupants/props du lieu.
 * - `applyStructuredRelationshipChanges` : graphe de relations (nouvelle arête
 *   ou delta d'intensité).
 * - `applyStructuredArcDeltas` : progression d'arcs, tension, promesses.
 */

import type { SceneContinuityPayload } from "@manga-ai-studio/core";
import type {
  ArcRegistryEntry,
  CharacterState,
  LocationState,
  RelationshipGraphEdge,
} from "../types";
import { normalizeCharacterName, uniq } from "./utils";

export function findCharacterStateByName(
  states: CharacterState[],
  name: string,
): CharacterState | undefined {
  const normalized = normalizeCharacterName(name);
  return states.find(
    (state) => normalizeCharacterName(state.identity.stableName ?? state.characterId) === normalized,
  );
}

export function resolveCharacterIdByName(
  states: CharacterState[],
  name: string,
): string | null {
  return findCharacterStateByName(states, name)?.characterId ?? null;
}

export function applyStructuredCharacterDeltas(
  baseStates: CharacterState[],
  continuityPayload: SceneContinuityPayload | null | undefined,
  fallbackLocation: string,
): CharacterState[] {
  if (!continuityPayload) return baseStates;
  return baseStates.map((state) => {
    const delta = continuityPayload.characterDeltas.find(
      (item) =>
        normalizeCharacterName(item.characterName) ===
        normalizeCharacterName(state.identity.stableName ?? state.characterId),
    );
    if (!delta) return state;
    return {
      ...state,
      currentState: {
        ...state.currentState,
        location: delta.location ?? fallbackLocation,
        emotion: delta.emotionalState ?? state.currentState.emotion ?? null,
        objective: delta.objective ?? state.currentState.objective ?? null,
        outfit: delta.outfit ?? state.currentState.outfit ?? null,
        possessions: uniq([
          ...state.currentState.possessions,
          ...(delta.gainedItems ?? []),
        ]).filter((item) => !(delta.lostItems ?? []).includes(item)),
        injuries: uniq([
          ...state.currentState.injuries,
          ...(delta.injuriesAdded ?? []),
        ]).filter((item) => !(delta.injuriesHealed ?? []).includes(item)),
        knowledge: uniq([
          ...(state.currentState.knowledge ?? []),
          ...(delta.knowledgeGained ?? []),
        ]),
        obligations: uniq([
          ...(state.currentState.obligations ?? []),
          ...(delta.obligationsAdded ?? []),
        ]),
        fatigue: state.currentState.fatigue ?? null,
      },
    };
  });
}

export function applyStructuredLocationDelta(
  baseLocation: LocationState,
  continuityPayload: SceneContinuityPayload | null | undefined,
  participantNames: string[],
): LocationState {
  const delta = continuityPayload?.locationDeltas.find(
    (item) => normalizeCharacterName(item.locationName) === normalizeCharacterName(baseLocation.name),
  ) ?? continuityPayload?.locationDeltas[0];
  if (!delta) {
    return {
      ...baseLocation,
      occupants: uniq([...baseLocation.occupants, ...participantNames]),
    };
  }
  return {
    ...baseLocation,
    state: delta.state ?? baseLocation.state ?? null,
    visualAnchors: uniq([...baseLocation.visualAnchors, ...(delta.visualAnchorsAdded ?? [])]),
    occupants: uniq([
      ...baseLocation.occupants,
      ...participantNames,
      ...(delta.occupantsAdded ?? []),
    ]).filter((item) => !(delta.occupantsRemoved ?? []).includes(item)),
    importantProps: uniq([
      ...baseLocation.importantProps,
      ...(delta.propsAdded ?? []),
    ]).filter((item) => !(delta.propsRemoved ?? []).includes(item)),
    eventTraces: uniq([...baseLocation.eventTraces, ...(delta.tracesAdded ?? [])]),
    damageMarkers: uniq([...baseLocation.damageMarkers, ...(delta.damageAdded ?? [])]),
    surveillanceMarkers: uniq([...baseLocation.surveillanceMarkers, ...(delta.surveillanceAdded ?? [])]),
    vegetationMarkers: uniq([...baseLocation.vegetationMarkers, ...(delta.vegetationAdded ?? [])]),
    narrativeFunction: delta.narrativeFunction ?? baseLocation.narrativeFunction ?? null,
  };
}

export function applyStructuredRelationshipChanges(
  baseEdges: RelationshipGraphEdge[],
  continuityPayload: SceneContinuityPayload | null | undefined,
  states: CharacterState[],
): RelationshipGraphEdge[] {
  if (!continuityPayload) return baseEdges;
  const nextEdges = [...baseEdges];
  for (const delta of continuityPayload.characterDeltas) {
    const sourceId = resolveCharacterIdByName(states, delta.characterName);
    if (!sourceId) continue;
    for (const change of delta.relationshipChanges ?? []) {
      const targetId = resolveCharacterIdByName(states, change.targetCharacterName);
      if (!targetId) continue;
      const existingIndex = nextEdges.findIndex(
        (edge) => edge.sourceCharacterId === sourceId && edge.targetCharacterId === targetId,
      );
      if (existingIndex >= 0) {
        const edge = nextEdges[existingIndex]!;
        nextEdges[existingIndex] = {
          ...edge,
          intensity: Math.max(0, Math.min(100, edge.intensity + (change.intensityDelta ?? 0))),
          note: change.note ?? edge.note ?? change.shift,
          currentDynamic: change.shift,
        };
      } else {
        nextEdges.push({
          sourceCharacterId: sourceId,
          targetCharacterId: targetId,
          relationType: change.shift,
          intensity: Math.max(0, Math.min(100, 50 + (change.intensityDelta ?? 0))),
          note: change.note ?? change.shift,
          currentDynamic: change.shift,
        });
      }
    }
  }
  return nextEdges;
}

export function applyStructuredArcDeltas(
  baseArcs: ArcRegistryEntry[],
  continuityPayload: SceneContinuityPayload | null | undefined,
): ArcRegistryEntry[] {
  if (!continuityPayload) return baseArcs;
  const nextArcs = [...baseArcs];
  for (const delta of continuityPayload.arcDeltas) {
    const index = nextArcs.findIndex(
      (arc) => normalizeCharacterName(arc.name) === normalizeCharacterName(delta.arcName),
    );
    if (index >= 0) {
      const arc = nextArcs[index]!;
      nextArcs[index] = {
        ...arc,
        status: delta.status ?? arc.status,
        progression: uniq([...arc.progression, ...(delta.progression ?? [])]),
        tension: Math.max(0, arc.tension + (delta.tensionDelta ?? 0)),
        openPromises: uniq([...arc.openPromises, ...(delta.openPromisesAdded ?? [])]),
        paidPromises: uniq([...arc.paidPromises, ...(delta.paidPromisesAdded ?? [])]),
        blockers: uniq([...arc.blockers, ...(delta.blockersAdded ?? [])]).filter(
          (item) => !(delta.blockersResolved ?? []).includes(item),
        ),
        currentState: delta.currentState ?? arc.currentState ?? null,
      };
      continue;
    }
    nextArcs.push({
      arcId: `structured:${delta.arcName}`,
      name: delta.arcName,
      status: delta.status ?? "open",
      setup: [],
      progression: delta.progression ?? [],
      tension: Math.max(0, delta.tensionDelta ?? 0),
      openPromises: delta.openPromisesAdded ?? [],
      paidPromises: delta.paidPromisesAdded ?? [],
      blockers: (delta.blockersAdded ?? []).filter(
        (item) => !(delta.blockersResolved ?? []).includes(item),
      ),
      currentState: delta.currentState ?? null,
    });
  }
  return nextArcs;
}
