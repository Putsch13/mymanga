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
  /** JSON studio `Character.stableVisualDNA` — traits configurateur verrouillés. */
  stableVisualDNA?: Record<string, unknown> | null;
};

const STABLE_VISUAL_EXCERPT_KEYS = [
  "faceShape",
  "skinTone",
  "hairColor",
  "eyeColor",
  "hairStyle",
  "hairLength",
  "hairTexture",
  "eyeShape",
  "eyeSize",
  "eyebrowStyle",
  "noseStyle",
  "mouthStyle",
  "jawline",
  "silhouetteType",
  "silhouette",
  "scars",
  "tattoos",
  "accessories",
  "fixedAccessories",
  "perceivedAge",
] as const;

const VISUAL_CANON_EXCERPT_MAX = 320;

/** Compacte `stableVisualDNA` pour prompts (ordre stable de clés). */
export function excerptFromStableVisualDNA(stable: unknown): string | null {
  if (!stable || typeof stable !== "object" || Array.isArray(stable)) return null;
  const r = stable as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of STABLE_VISUAL_EXCERPT_KEYS) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v.trim()}`);
    } else if (Array.isArray(v) && v.length > 0) {
      const joined = v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
        .join(", ");
      if (joined) parts.push(`${k}: ${joined}`);
    }
    if (parts.join("; ").length >= VISUAL_CANON_EXCERPT_MAX) break;
  }
  if (parts.length === 0) return null;
  const out = parts.join("; ").trim();
  return out.length > VISUAL_CANON_EXCERPT_MAX ? out.slice(0, VISUAL_CANON_EXCERPT_MAX) : out;
}

function stableScalarString(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length > 0) {
    const joined = v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .join(", ");
    return joined || null;
  }
  return null;
}

/**
 * Extrait les champs structurés du configurateur (`Character.stableVisualDNA`)
 * vers les propriétés typées de `CharacterVisualDna` (prompts / preflight).
 */
export function visualDnaTraitFieldsFromStableVisualDNA(stable: unknown): Partial<CharacterVisualDna> {
  if (!stable || typeof stable !== "object" || Array.isArray(stable)) return {};
  const r = stable as Record<string, unknown>;
  const out: Partial<CharacterVisualDna> = {};
  const put = (field: keyof CharacterVisualDna, ...keys: string[]) => {
    for (const k of keys) {
      const s = stableScalarString(r, k);
      if (s) {
        (out as Record<string, string>)[field as string] = s;
        return;
      }
    }
  };
  put("hairColor", "hairColor");
  put("eyeColor", "eyeColor");
  put("faceShape", "faceShape");
  put("skinTone", "skinTone");
  put("hairStyle", "hairStyle");
  put("hairLength", "hairLength");
  put("hairTexture", "hairTexture");
  put("eyeShape", "eyeShape");
  put("eyeSize", "eyeSize");
  put("eyebrowStyle", "eyebrowStyle");
  put("noseStyle", "noseStyle");
  put("mouthStyle", "mouthStyle");
  put("jawline", "jawline");
  put("perceivedAge", "perceivedAge");
  const silhouette = stableScalarString(r, "silhouetteType") ?? stableScalarString(r, "silhouette");
  if (silhouette) out.silhouetteType = silhouette;
  const scars = stableScalarString(r, "scars");
  const tattoos = stableScalarString(r, "tattoos");
  const marks = [scars, tattoos].filter(Boolean).join(" ; ");
  if (marks) out.distinctiveMarksLine = marks;
  const acc = stableScalarString(r, "accessories");
  const facc = stableScalarString(r, "fixedAccessories");
  const accLine = [acc, facc].filter(Boolean).join(" ; ");
  if (accLine) out.accessoriesLine = accLine;
  return out;
}

export type HydrateBlueprintsWithCharacterDnaInput = {
  blueprints: PanelBlueprintPremium[];
  characters: CharacterRowForDnaHydration[];
  /** Index par `characterId` (ex. snapshot `data.characterCanons`). */
  characterCanonsById?: ReadonlyMap<string, CharacterCanon> | Record<string, CharacterCanon | undefined> | null;
  /**
   * Héros 2 / co‑protagonistes : sur tout panel où au moins un personnage est requis
   * (requis, must-show, ou locuteur `speaker_visible`), on injecte aussi leur DNA pour
   * le preflight strict et les prompts sans exiger que chaque beat liste explicitement le co‑héros.
   */
  coProtagonistCharacterIds?: readonly string[] | null;
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
  const fromStable = visualDnaTraitFieldsFromStableVisualDNA(db?.stableVisualDNA ?? null);
  const displayName = canon?.canonicalName ?? db?.name ?? characterId;
  const hairColor =
    db?.hairColor?.trim()
    || fromStable.hairColor?.trim()
    || firstHairColorFromTraits(canon?.hairTraits ?? [])
    || null;
  const eyeColor =
    db?.eyeColor?.trim()
    || fromStable.eyeColor?.trim()
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
  const visualCanonExcerpt = excerptFromStableVisualDNA(db?.stableVisualDNA ?? null);

  return {
    characterId,
    displayName,
    hairColor,
    eyeColor,
    outfitSignature,
    canonSignatureText,
    forbiddenDrift: forbiddenDrift.length > 0 ? forbiddenDrift : undefined,
    visualCanonExcerpt: visualCanonExcerpt ?? undefined,
    faceShape: fromStable.faceShape,
    skinTone: fromStable.skinTone,
    hairStyle: fromStable.hairStyle,
    hairLength: fromStable.hairLength,
    hairTexture: fromStable.hairTexture,
    eyeShape: fromStable.eyeShape,
    eyeSize: fromStable.eyeSize,
    eyebrowStyle: fromStable.eyebrowStyle,
    noseStyle: fromStable.noseStyle,
    mouthStyle: fromStable.mouthStyle,
    jawline: fromStable.jawline,
    silhouetteType: fromStable.silhouetteType,
    perceivedAge: fromStable.perceivedAge,
    distinctiveMarksLine: fromStable.distinctiveMarksLine,
    accessoriesLine: fromStable.accessoriesLine,
  };
}

function mergeDna(prev: CharacterVisualDna, built: CharacterVisualDna): CharacterVisualDna {
  const pick = <T extends string | null | undefined>(a: T, b: T): T | undefined => {
    const as = typeof a === "string" ? a.trim() : "";
    if (as) return a;
    const bs = typeof b === "string" ? b.trim() : "";
    return bs ? b : undefined;
  };
  return {
    characterId: prev.characterId,
    displayName: prev.displayName?.trim() || built.displayName,
    hairColor: prev.hairColor?.trim() || built.hairColor,
    eyeColor: prev.eyeColor?.trim() || built.eyeColor,
    outfitSignature: prev.outfitSignature?.trim() || built.outfitSignature,
    canonSignatureText: prev.canonSignatureText?.trim() || built.canonSignatureText,
    forbiddenDrift:
      prev.forbiddenDrift && prev.forbiddenDrift.length > 0 ? prev.forbiddenDrift : built.forbiddenDrift,
    visualCanonExcerpt:
      prev.visualCanonExcerpt?.trim()
      || built.visualCanonExcerpt
      || undefined,
    hairStyle: pick(prev.hairStyle, built.hairStyle),
    skinTone: pick(prev.skinTone, built.skinTone),
    hairLength: pick(prev.hairLength, built.hairLength),
    hairTexture: pick(prev.hairTexture, built.hairTexture),
    faceShape: pick(prev.faceShape, built.faceShape),
    eyeShape: pick(prev.eyeShape, built.eyeShape),
    eyeSize: pick(prev.eyeSize, built.eyeSize),
    eyebrowStyle: pick(prev.eyebrowStyle, built.eyebrowStyle),
    noseStyle: pick(prev.noseStyle, built.noseStyle),
    mouthStyle: pick(prev.mouthStyle, built.mouthStyle),
    jawline: pick(prev.jawline, built.jawline),
    silhouetteType: pick(prev.silhouetteType, built.silhouetteType),
    perceivedAge: pick(prev.perceivedAge, built.perceivedAge),
    distinctiveMarksLine: pick(prev.distinctiveMarksLine, built.distinctiveMarksLine),
    accessoriesLine: pick(prev.accessoriesLine, built.accessoriesLine),
  };
}

/**
 * Pour chaque panel, garantit une entrée `characterVisualDna` par ID présent dans
 * `requiredCharacterIds` ∪ `mustShowCharacterIds` ∪ `requiredCharacters` (même sémantique
 * que `blueprint-to-canonical-plan`) ∪ locuteur `speaker_visible`,
 * plus les `coProtagonistCharacterIds` lorsqu’au moins un slot personnage est actif.
 * Fusionne avec l’existant.
 */
export function hydrateBlueprintsWithCharacterDna(
  input: HydrateBlueprintsWithCharacterDnaInput,
): PanelBlueprintPremium[] {
  const byId = new Map(input.characters.map((c) => [c.id, c]));
  const canons = canonMap(input.characterCanonsById);
  const coIds = (input.coProtagonistCharacterIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );

  return input.blueprints.map((bp) => {
    const speakerAnchor =
      bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId?.trim()
        ? bp.speakerAnchorCharacterId.trim()
        : null;
    let requiredIds = [
      ...new Set([
        ...(bp.requiredCharacterIds ?? []),
        ...(bp.mustShowCharacterIds ?? []),
        ...(bp.requiredCharacters ?? []),
        ...(speakerAnchor ? [speakerAnchor] : []),
      ]),
    ];
    const hasCharacterSlot = requiredIds.length > 0;
    if (hasCharacterSlot && coIds.length > 0) {
      requiredIds = [...new Set([...requiredIds, ...coIds])];
    }
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
