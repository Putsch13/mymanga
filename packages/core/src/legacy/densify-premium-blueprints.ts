/**
 * @deprecated LEGACY ONLY — ne pas importer depuis le flux premium (estimate,
 * contract-builder, pipeline v3). La densité 70–75 est portée par le plan canonique.
 *
 * Conservé pour tests de non-régression / migration d’anciens snapshots.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";

export type PremiumDensifyVariant = Pick<
  PanelBlueprintPremium,
  "shotType" | "subjectFocus" | "cameraAngle" | "cutawayType" | "purpose"
>;

/**
 * Variantes déterministes, actor-driven (pas de padding décoratif générique).
 */
export const PREMIUM_DENSIFY_VARIANTS: readonly PremiumDensifyVariant[] = [
  {
    shotType: "medium",
    subjectFocus: "duo",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "story action — progression visible du beat",
  },
  {
    shotType: "medium",
    subjectFocus: "reaction",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "reaction_closeup — émotion lisible et contexte narratif",
  },
  {
    shotType: "medium_close",
    subjectFocus: "hero",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "hero_focus — protagoniste visible avec action",
  },
  {
    shotType: "medium",
    subjectFocus: "group",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "group_dynamic — interaction visible entre personnages",
  },
  {
    shotType: "over_shoulder",
    subjectFocus: "speaker",
    cameraAngle: "eye_level",
    cutawayType: "none",
    purpose: "dialogue_anchor — speaker visible pour ancrage texte",
  },
  {
    shotType: "medium",
    subjectFocus: "enemy",
    cameraAngle: "low",
    cutawayType: "none",
    purpose: "opponent_pressure — menace visible et concrète",
  },
] as const;

export function isNonHumanFocusForPremiumDensify(focus: PanelBlueprintPremium["subjectFocus"]): boolean {
  // `SubjectFocus` n’inclut pas "cutaway" (c’est un `cutawayType`), éviter les comparaisons impossibles pour TS.
  return focus === "environment" || focus === "prop" || focus === "aftermath";
}

export function makeDensifiedPremiumBlueprint(input: {
  seed: PanelBlueprintPremium;
  globalIndex: number;
  variant: PremiumDensifyVariant;
}): PanelBlueprintPremium {
  const { seed, globalIndex, variant } = input;
  const nonHuman = isNonHumanFocusForPremiumDensify(variant.subjectFocus);

  return {
    ...seed,
    panelId: `panel_${seed.beatId}_densify_${globalIndex + 1}`,
    panelIndex: globalIndex,
    panelNumber: globalIndex + 1,
    shotType: variant.shotType,
    subjectFocus: variant.subjectFocus,
    cameraAngle: variant.cameraAngle,
    cutawayType: variant.cutawayType,
    purpose: variant.purpose,
    heroCenterAllowed: false,
    mustShowEnemy: false,
    requiredNpcCount: variant.subjectFocus === "npc" ? Math.max(1, seed.requiredNpcCount) : 0,
    dialogueCarrier: "narration",
    dialogueLinesAnchored: 0,
    speakerAnchorCharacterId: null,
    speakerAnchorCharacterName: null,
    mustShowCharacterIds: nonHuman ? [] : (seed.mustShowCharacterIds ?? []).slice(0, 1),
    mayShowCharacterIds: nonHuman ? [] : (seed.mayShowCharacterIds ?? []).slice(0, 2),
    requiredCharacters: nonHuman ? [] : (seed.requiredCharacters ?? []).slice(0, 1),
    requiredCharacterIds: nonHuman ? [] : (seed.requiredCharacterIds ?? []).slice(0, 1),
    notes: [...(seed.notes ?? []), "densified_to_meet_premium_range"],
    contractualCritical: false,
    criticality: "low",
  };
}

export function renumberPremiumBlueprintsGlobally(blueprints: PanelBlueprintPremium[]): PanelBlueprintPremium[] {
  return blueprints.map((bp, idx) => ({
    ...bp,
    panelIndex: idx,
    panelNumber: idx + 1,
    pageNumber: bp.pageNumber ?? 1,
  }));
}

const removableBlueprint = (bp: PanelBlueprintPremium): boolean =>
  bp.contractualCritical !== true && bp.criticality !== "critical" && bp.criticality !== "high";

/**
 * Densification pour la route estimation (`blueprints` par beat, retour plat + compteurs).
 */
export function densifyBlueprintsToPremiumRangeEstimate(input: {
  beats: Array<{ beatId: string; blueprints: PanelBlueprintPremium[] }>;
  minPanels: number;
  maxPanels: number;
}): { blueprints: PanelBlueprintPremium[]; added: number; removed: number } {
  const beats = input.beats.map((b) => ({ ...b, blueprints: [...b.blueprints] }));
  let all = beats.flatMap((b) => b.blueprints);
  if (all.length === 0) return { blueprints: [], added: 0, removed: 0 };

  let added = 0;
  let removed = 0;
  const variants = PREMIUM_DENSIFY_VARIANTS;

  if (all.length < input.minPanels) {
    const missing = input.minPanels - all.length;
    for (let i = 0; i < missing; i += 1) {
      const beat = beats[i % beats.length]!;
      const seed =
        (beat.blueprints[beat.blueprints.length - 1] ?? all[all.length - 1]) as PanelBlueprintPremium;
      const variant = variants[i % variants.length]!;
      const densified = makeDensifiedPremiumBlueprint({
        seed,
        globalIndex: all.length,
        variant,
      });
      beat.blueprints.push(densified);
      all.push(densified);
      added += 1;
    }
  } else if (all.length > input.maxPanels) {
    while (all.length > input.maxPanels) {
      let didRemove = false;
      for (let i = beats.length - 1; i >= 0; i -= 1) {
        const beat = beats[i]!;
        const reverseIdx = [...beat.blueprints].reverse().findIndex(removableBlueprint);
        if (reverseIdx === -1) continue;
        const removeAt = beat.blueprints.length - 1 - reverseIdx;
        beat.blueprints.splice(removeAt, 1);
        all = beats.flatMap((b) => b.blueprints);
        removed += 1;
        didRemove = true;
        break;
      }
      if (!didRemove) break;
    }
  }

  return {
    blueprints: renumberPremiumBlueprintsGlobally(all),
    added,
    removed,
  };
}

/**
 * Densification pour le contract-builder premium (`_blueprints` par beat).
 * Comportement identique à l’historique : erreur si impossible de repasser sous max.
 */
export function densifyBlueprintsToPremiumRangeContract(input: {
  beats: Array<{ beatId: string; _blueprints: PanelBlueprintPremium[] }>;
  minPanels: number;
  maxPanels: number;
}): { beats: typeof input.beats; allBlueprints: PanelBlueprintPremium[] } {
  const beats = input.beats.map((b) => ({ ...b, _blueprints: [...b._blueprints] }));
  let all = beats.flatMap((b) => b._blueprints);

  if (all.length === 0) return { beats, allBlueprints: [] };

  const variants = PREMIUM_DENSIFY_VARIANTS;

  if (all.length < input.minPanels) {
    const missing = input.minPanels - all.length;
    for (let i = 0; i < missing; i += 1) {
      const beat = beats[i % beats.length];
      const seed = (beat?._blueprints[beat._blueprints.length - 1] ?? all[all.length - 1]) as PanelBlueprintPremium;
      const variant = variants[i % variants.length]!;
      const densified = makeDensifiedPremiumBlueprint({
        seed,
        globalIndex: all.length,
        variant,
      });
      beat!._blueprints.push(densified);
      all.push(densified);
    }
  } else if (all.length > input.maxPanels) {
    while (all.length > input.maxPanels) {
      let removed = false;
      for (let i = beats.length - 1; i >= 0; i -= 1) {
        const beat = beats[i]!;
        const idx = [...beat._blueprints].reverse().findIndex(removableBlueprint);
        if (idx === -1) continue;
        const removeAt = beat._blueprints.length - 1 - idx;
        beat._blueprints.splice(removeAt, 1);
        all = beats.flatMap((b) => b._blueprints);
        removed = true;
        break;
      }
      if (!removed) {
        throw new Error(
          `premium_panel_count_over_max_non_removable raw=${all.length} max=${input.maxPanels} — regen outline required`,
        );
      }
    }
  }

  const renumbered = renumberPremiumBlueprintsGlobally(beats.flatMap((b) => b._blueprints));
  const byBeat = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of renumbered) {
    const list = byBeat.get(bp.beatId) ?? [];
    list.push(bp);
    byBeat.set(bp.beatId, list);
  }

  const beatsRenumbered = beats.map((b) => ({
    ...b,
    _blueprints: byBeat.get(b.beatId) ?? [],
  }));

  return { beats: beatsRenumbered, allBlueprints: renumbered };
}
