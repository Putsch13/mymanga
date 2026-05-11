/**
 * Hydrate `characterVisualDna` sur chaque blueprint après merge canonique / provenance.
 * Source : personnages projet + CharacterCanon studio (optionnel).
 *
 * Façade — l'implémentation est découpée dans `_hydrate-blueprints-with-character-dna/*`.
 */

import type { CharacterCanon } from "../types/chapter-studio";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

import {
  buildDnaForCharacterId,
  collectRequiredCharacterIds,
  isSubstantialCharacterVisualDna,
} from "./_hydrate-blueprints-with-character-dna/build-dna";
import { mergeDna } from "./_hydrate-blueprints-with-character-dna/merge-dna";
import type {
  CharacterRowForDnaHydration,
  HydrateBlueprintsWithCharacterDnaInput,
} from "./_hydrate-blueprints-with-character-dna/types";

export {
  excerptFromStableVisualDNA,
  visualDnaTraitFieldsFromStableVisualDNA,
} from "./_hydrate-blueprints-with-character-dna/stable-visual-dna";
export { isSubstantialCharacterVisualDna } from "./_hydrate-blueprints-with-character-dna/build-dna";
export type {
  CharacterRowForDnaHydration,
  HydrateBlueprintsWithCharacterDnaInput,
} from "./_hydrate-blueprints-with-character-dna/types";

function canonMap(
  input: HydrateBlueprintsWithCharacterDnaInput["characterCanonsById"],
): Map<string, CharacterCanon> {
  const m = new Map<string, CharacterCanon>();
  if (!input) return m;
  if (input instanceof Map) {
    for (const [k, v] of input) {
      if (v) m.set(k, v);
    }
    return m;
  }
  for (const [k, v] of Object.entries(input)) {
    if (v) m.set(k, v);
  }
  return m;
}

function mergedCanonMap(
  input: HydrateBlueprintsWithCharacterDnaInput,
): Map<string, CharacterCanon> {
  const fromRecord = canonMap(input.characterCanonsById);
  if (!input.characterCanons?.length) return fromRecord;
  for (const c of input.characterCanons) {
    if (c?.characterId) fromRecord.set(c.characterId, c);
  }
  return fromRecord;
}

/**
 * Pour chaque panel, garantit une entrée `characterVisualDna` par ID présent dans
 * `requiredCharacterIds` ∪ `mustShowCharacterIds` ∪ `requiredCharacters` (même sémantique
 * que `blueprint-to-canonical-plan`) ∪ locuteur `speaker_visible`,
 * plus les `coProtagonistCharacterIds` lorsqu'au moins un slot personnage est actif.
 * Fusionne avec l'existant.
 */
export function hydrateBlueprintsWithCharacterDna(
  input: HydrateBlueprintsWithCharacterDnaInput,
): PanelBlueprintPremium[] {
  const byId = new Map<string, CharacterRowForDnaHydration>(
    input.characters.map((c) => [c.id, c]),
  );
  const canons = mergedCanonMap(input);
  const coIds = (input.coProtagonistCharacterIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  const strict = input.strict === true;

  return input.blueprints.map((bp) => {
    const requiredIds = collectRequiredCharacterIds(bp, coIds);
    if (requiredIds.length === 0) return bp;

    const byChar = new Map((bp.characterVisualDna ?? []).map((d) => [d.characterId, { ...d }]));
    const noteAcc: string[] = [];

    for (const id of requiredIds) {
      const prev = byChar.get(id);
      const db = byId.get(id);
      const canon = canons.get(id);
      const built = buildDnaForCharacterId(id, db, canon);
      const canMerge = Boolean(db || canon);
      const substantialBuilt = isSubstantialCharacterVisualDna(built);
      const substantialPrev = prev ? isSubstantialCharacterVisualDna(prev) : false;

      if (!canMerge && !substantialBuilt && !substantialPrev) {
        if (strict) {
          noteAcc.push(`character_dna_strict_unresolved:${id}`);
        }
        continue;
      }

      byChar.set(id, prev ? mergeDna(prev, built) : built);
    }

    const nextNotes = noteAcc.length > 0 ? [...(bp.notes ?? []), ...noteAcc] : bp.notes;

    return {
      ...bp,
      ...(nextNotes !== bp.notes ? { notes: nextNotes } : {}),
      characterVisualDna: [...byChar.values()],
    };
  });
}
