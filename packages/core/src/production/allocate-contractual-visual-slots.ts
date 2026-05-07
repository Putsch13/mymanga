/**
 * P0-2 — Réserve des slots contractuels AVANT le rythme générique.
 *
 * Le plan canonique appelle cette fonction pour déduire les obligations visuelles
 * depuis le VisualWorldContract, puis les injecter comme slots réservés que le
 * planner consomme en priorité lors de l'attribution des rôles panel.
 */

import type { NormalizedBeat } from "./normalize-outline";

export interface ContractualSlot {
  beatId: string;
  requiredRole: "prop" | "npc" | "environment" | "enemy";
  subjectFocus: "prop" | "group" | "environment" | "enemy";
  cutawayType: "prop_insert" | "environment" | "npc_panel" | "none";
  heroCenterAllowed: false;
  sourceObligationId: string;
}

type VisualWorldLike = {
  props?: ReadonlyArray<{
    id: string;
    visibilityPolicy?: string | null;
    continuityPolicy?: string;
    requiredBeatIds?: string[];
  }>;
  npcGroups?: ReadonlyArray<{
    id: string;
    requiredBeatIds?: string[];
  }>;
  beatBindings?: ReadonlyArray<{
    beatId: string;
    primaryPropIds?: string[];
    npcGroupIds?: string[];
    locationId?: string | null;
  }>;
  locations?: ReadonlyArray<{ id: string }>;
};

const BLOCKING_VISIBILITY_POLICIES = new Set(["visible", "symbolic"]);
const BLOCKING_CONTINUITY_POLICIES = new Set(["symbolic", "recurring"]);

export function allocateContractualVisualSlots(
  beats: NormalizedBeat[],
  visualWorld: VisualWorldLike | null | undefined,
): ContractualSlot[] {
  if (!visualWorld) return [];

  const slots: ContractualSlot[] = [];
  const allProps = visualWorld.props ?? [];
  const allNpcGroups = visualWorld.npcGroups ?? [];

  for (const beat of beats) {
    const binding = visualWorld.beatBindings?.find((b) => b.beatId === beat.beatId);

    const propIdsForBeat = new Set<string>();
    if (binding?.primaryPropIds) {
      for (const id of binding.primaryPropIds) propIdsForBeat.add(id);
    }
    for (const prop of allProps) {
      if (prop.requiredBeatIds?.includes(beat.beatId)) {
        propIdsForBeat.add(prop.id);
      }
    }

    for (const propId of propIdsForBeat) {
      const prop = allProps.find((p) => p.id === propId);
      if (!prop) continue;
      const visPolicy = prop.visibilityPolicy ?? "";
      const contPolicy = prop.continuityPolicy ?? "";
      if (
        BLOCKING_VISIBILITY_POLICIES.has(visPolicy) ||
        BLOCKING_CONTINUITY_POLICIES.has(contPolicy)
      ) {
        slots.push({
          beatId: beat.beatId,
          requiredRole: "prop",
          subjectFocus: "prop",
          cutawayType: "prop_insert",
          heroCenterAllowed: false,
          sourceObligationId: propId,
        });
      }
    }

    const npcIdsForBeat = new Set<string>();
    if (binding?.npcGroupIds) {
      for (const id of binding.npcGroupIds) npcIdsForBeat.add(id);
    }
    for (const npc of allNpcGroups) {
      if (npc.requiredBeatIds?.includes(beat.beatId)) {
        npcIdsForBeat.add(npc.id);
      }
    }

    for (const npcId of npcIdsForBeat) {
      slots.push({
        beatId: beat.beatId,
        requiredRole: "npc",
        subjectFocus: "group",
        cutawayType: "npc_panel",
        heroCenterAllowed: false,
        sourceObligationId: npcId,
      });
    }
  }

  if (slots.length > 0) {
    console.info(
      `[contractual-slots] reserved=${slots.length} slots=[${slots.map((s) => `{${s.beatId},${s.requiredRole}}`).join(",")}]`,
    );
  }

  return slots;
}

/**
 * Retourne le slot réservé pour un (beatId, panelIndexInBeat) donné,
 * en consommant les slots de manière FIFO par beat.
 */
export function consumeContractualSlot(
  slots: ContractualSlot[],
  beatId: string,
  consumed: Set<string>,
): ContractualSlot | null {
  for (const slot of slots) {
    if (slot.beatId !== beatId) continue;
    const key = `${slot.beatId}:${slot.sourceObligationId}`;
    if (consumed.has(key)) continue;
    consumed.add(key);
    return slot;
  }
  return null;
}
