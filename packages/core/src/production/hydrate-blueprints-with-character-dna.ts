/**
 * Hydrate `characterVisualDna` sur chaque blueprint après merge canonique / provenance.
 * Source : personnages projet + CharacterCanon studio (optionnel).
 */

import type { CharacterCanon } from "../types/chapter-studio";
import type { CharacterVisualDna } from "../types/generation-debug-snapshot";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

export type CharacterRowForDnaHydration = {
  id: string;
  name: string;
  hairColor?: string | null;
  eyeColor?: string | null;
  appearance?: string | null;
  outfitDefault?: string | null;
};

export type HydrateBlueprintsWithCharacterDnaInput = {
  blueprints: PanelBlueprintPremium[];
  characters: CharacterRowForDnaHydration[];
  /** Index par `characterId` (ex. snapshot `data.characterCanons`). */
  characterCanonsById?: ReadonlyMap<string, CharacterCanon> | Record<string, CharacterCanon | undefined> | null;
};

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

function firstHairColorFromTraits(traits: string[]): string | null {
  for (const t of traits) {
    const s = t.trim();
    if (/^(blond|blonde|noir|noire|roux|roux|brun|brune|blanc|argent|bleu|vert|violet|rose)/i.test(s)) return s;
  }
  return null;
}

function buildDnaForCharacterId(
  characterId: string,
  db: CharacterRowForDnaHydration | undefined,
  canon: CharacterCanon | undefined,
): CharacterVisualDna {
  const displayName = canon?.canonicalName ?? db?.name ?? characterId;
  const hairColor =
    db?.hairColor?.trim()
    || firstHairColorFromTraits(canon?.hairTraits ?? [])
    || null;
  const eyeColor =
    db?.eyeColor?.trim()
    || (canon?.eyeTraits?.[0]?.trim() ?? null)
    || null;
  const outfitParts = canon?.defaultOutfitSet?.[0];
  const outfitSignature =
    db?.outfitDefault?.trim()
    || [outfitParts?.top, outfitParts?.bottom, outfitParts?.label].filter(Boolean).join(", ").trim()
    || null;
  const sigParts = [
    db?.appearance?.trim(),
    ...(canon?.visualIdentity ?? []).slice(0, 4),
    ...(canon?.mustKeep ?? []).slice(0, 4),
  ].filter(Boolean) as string[];
  const canonSignatureText = sigParts.length > 0 ? [...new Set(sigParts)].join("; ") : null;
  const forbiddenDrift = [...(canon?.forbiddenDrift ?? [])];

  return {
    characterId,
    displayName,
    hairColor,
    eyeColor,
    outfitSignature,
    canonSignatureText,
    forbiddenDrift: forbiddenDrift.length > 0 ? forbiddenDrift : undefined,
  };
}

function mergeDna(prev: CharacterVisualDna, built: CharacterVisualDna): CharacterVisualDna {
  return {
    characterId: prev.characterId,
    displayName: prev.displayName?.trim() || built.displayName,
    hairColor: prev.hairColor?.trim() || built.hairColor,
    eyeColor: prev.eyeColor?.trim() || built.eyeColor,
    outfitSignature: prev.outfitSignature?.trim() || built.outfitSignature,
    canonSignatureText: prev.canonSignatureText?.trim() || built.canonSignatureText,
    forbiddenDrift:
      prev.forbiddenDrift && prev.forbiddenDrift.length > 0 ? prev.forbiddenDrift : built.forbiddenDrift,
  };
}

/**
 * Pour chaque panel, garantit une entrée `characterVisualDna` par ID présent dans
 * `requiredCharacterIds` ∪ `mustShowCharacterIds`. Fusionne avec l’existant.
 */
export function hydrateBlueprintsWithCharacterDna(
  input: HydrateBlueprintsWithCharacterDnaInput,
): PanelBlueprintPremium[] {
  const byId = new Map(input.characters.map((c) => [c.id, c]));
  const canons = canonMap(input.characterCanonsById);

  return input.blueprints.map((bp) => {
    const requiredIds = [
      ...new Set([...(bp.requiredCharacterIds ?? []), ...(bp.mustShowCharacterIds ?? [])]),
    ];
    if (requiredIds.length === 0) return bp;

    const byChar = new Map((bp.characterVisualDna ?? []).map((d) => [d.characterId, { ...d }]));

    for (const id of requiredIds) {
      const built = buildDnaForCharacterId(id, byId.get(id), canons.get(id));
      const prev = byChar.get(id);
      byChar.set(id, prev ? mergeDna(prev, built) : built);
    }

    return {
      ...bp,
      characterVisualDna: [...byChar.values()],
    };
  });
}
