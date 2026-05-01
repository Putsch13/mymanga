/**
 * Hydrate `characterVisualDna` sur chaque blueprint après merge canonique / provenance.
 * Source : personnages projet + CharacterCanon studio (optionnel).
 */

import {
  mergeCharacterVisualDna,
  type ContractCharacterVisualDna,
  type DbCharacterVisualFields,
  type StoryboardCharacterVisualDna,
} from "../characters/merge-character-visual-dna";
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
  characterFingerprint?: unknown;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
  visualRefs?: unknown;
  visualLocks?: unknown;
  canonPack?: unknown;
  loraAttachments?: unknown;
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
  const bodyType = stableScalarString(r, "bodyType");
  if (bodyType) out.bodyType = bodyType;
  const stableStringArray = (key: string): string[] => {
    const v = r[key];
    if (Array.isArray(v)) {
      return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
    }
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  };
  const scarsArr = stableStringArray("scars");
  const tattoosArr = stableStringArray("tattoos");
  const accArr = [...stableStringArray("accessories"), ...stableStringArray("fixedAccessories")];
  if (scarsArr.length) out.scars = scarsArr;
  if (tattoosArr.length) out.tattoos = tattoosArr;
  if (accArr.length) out.accessories = [...new Set(accArr)];
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
  /** Alias liste — converti en map par `characterId`. */
  characterCanons?: readonly CharacterCanon[] | null;
  /**
   * Premium strict : n’injecte pas de ligne `characterVisualDna` sans source DB ou canon ;
   * ajoute une note `character_dna_strict_unresolved:{id}` par ID manquant.
   */
  strict?: boolean;
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

function mergedCanonMap(input: HydrateBlueprintsWithCharacterDnaInput): Map<string, CharacterCanon> {
  const fromRecord = canonMap(input.characterCanonsById);
  if (!input.characterCanons?.length) return fromRecord;
  for (const c of input.characterCanons) {
    if (c?.characterId) fromRecord.set(c.characterId, c);
  }
  return fromRecord;
}

/** Au moins un signal visuel exploitable (hors seul displayName / characterId). */
export function isSubstantialCharacterVisualDna(d: CharacterVisualDna): boolean {
  const strings = [
    d.hairColor,
    d.eyeColor,
    d.hairStyle,
    d.skinTone,
    d.outfitSignature,
    d.canonSignatureText,
    d.visualCanonExcerpt,
    d.faceShape,
    d.eyeShape,
    d.eyeSize,
    d.eyebrowStyle,
    d.hairLength,
    d.hairTexture,
    d.noseStyle,
    d.mouthStyle,
    d.jawline,
    d.silhouetteType,
    d.perceivedAge,
    d.distinctiveMarksLine,
    d.accessoriesLine,
  ];
  if (strings.some((s) => typeof s === "string" && s.trim().length > 0)) return true;
  if (d.forbiddenDrift && d.forbiddenDrift.length > 0) return true;
  if (d.bodyType?.trim()) return true;
  if (d.scars && d.scars.length > 0) return true;
  if (d.tattoos && d.tattoos.length > 0) return true;
  if (d.accessories && d.accessories.length > 0) return true;
  return false;
}

function collectRequiredCharacterIds(
  bp: PanelBlueprintPremium,
  coProtagonistCharacterIds: readonly string[],
): string[] {
  const speakerAnchor =
    bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId?.trim()
      ? bp.speakerAnchorCharacterId.trim()
      : null;
  const ids = new Set<string>([
    ...(bp.requiredCharacterIds ?? []),
    ...(bp.mustShowCharacterIds ?? []),
    ...(bp.requiredCharacters ?? []),
    ...(bp.visibleCharacterIds ?? []),
    ...(speakerAnchor ? [speakerAnchor] : []),
  ]);
  const speakerChar = typeof bp.speakerCharacterId === "string" ? bp.speakerCharacterId.trim() : "";
  if (speakerChar) ids.add(speakerChar);
  for (const line of bp.dialogueLines ?? []) {
    const cid = typeof line.characterId === "string" ? line.characterId.trim() : "";
    if (cid) ids.add(cid);
  }
  const entityIds = bp.requiredEntityIds ?? [];
  for (const eid of entityIds) {
    if (typeof eid === "string" && eid.trim()) ids.add(eid.trim());
  }
  let requiredIds = [...ids];
  const hasCharacterSlot = requiredIds.length > 0;
  if (hasCharacterSlot && coProtagonistCharacterIds.length > 0) {
    requiredIds = [...new Set([...requiredIds, ...coProtagonistCharacterIds])];
  }
  return requiredIds;
}

function firstHairColorFromTraits(traits: string[]): string | null {
  for (const t of traits) {
    const s = t.trim();
    if (/^(blond|blonde|noir|noire|roux|roux|brun|brune|blanc|argent|bleu|vert|violet|rose)/i.test(s)) return s;
  }
  return null;
}

/** Pass-through champs studio (configurateur / Prisma) vers le DNA panel. */
function studioCanonFieldsFromDbRow(db: CharacterRowForDnaHydration | undefined): Partial<CharacterVisualDna> {
  if (!db) return {};
  const out: Partial<CharacterVisualDna> = {};
  const put = (key: keyof CharacterVisualDna, val: unknown) => {
    if (val !== undefined && val !== null) (out as Record<string, unknown>)[key as string] = val;
  };
  put("characterFingerprint", db.characterFingerprint);
  put("visualProfile", db.visualProfile);
  put("wardrobeProfile", db.wardrobeProfile);
  put("bodyState", db.bodyState);
  put("continuityProfile", db.continuityProfile);
  put("visualRefs", db.visualRefs);
  put("visualLocks", db.visualLocks);
  put("canonPack", db.canonPack);
  put("loraAttachments", db.loraAttachments);
  return out;
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
    bodyType: fromStable.bodyType,
    scars: fromStable.scars,
    tattoos: fromStable.tattoos,
    accessories: fromStable.accessories,
    ...studioCanonFieldsFromDbRow(db),
  };
}

function characterVisualDnaToDbFields(d: CharacterVisualDna): DbCharacterVisualFields {
  return {
    hairColor: d.hairColor,
    eyeColor: d.eyeColor,
    canonSignatureText: d.canonSignatureText,
    forbiddenVisualDrift: d.forbiddenDrift,
  };
}

function characterVisualDnaToContractFields(d: CharacterVisualDna): ContractCharacterVisualDna {
  const marks = [
    ...(d.distinctiveMarksLine ? d.distinctiveMarksLine.split(" ; ").map((x) => x.trim()).filter(Boolean) : []),
    ...(d.scars ?? []),
    ...(d.tattoos ?? []),
  ];
  return {
    eyeColor: d.eyeColor,
    hairColor: d.hairColor,
    hairStyle: d.hairStyle,
    skinTone: d.skinTone,
    outfitSignature: d.outfitSignature,
    distinctiveTraits: marks.length > 0 ? [...new Set(marks)] : undefined,
    silhouette: d.silhouetteType,
    ageAppearance: d.perceivedAge,
    bodyType: d.bodyType,
  };
}

function characterVisualDnaToStoryboardFields(d: CharacterVisualDna): StoryboardCharacterVisualDna {
  const features = [
    ...(d.distinctiveMarksLine ? d.distinctiveMarksLine.split(" ; ").map((x) => x.trim()).filter(Boolean) : []),
    ...(d.scars ?? []),
    ...(d.tattoos ?? []),
  ];
  return {
    eyeColor: d.eyeColor,
    hairColor: d.hairColor,
    hairStyle: d.hairStyle,
    outfitSignature: d.outfitSignature,
    distinctiveFeatures: features.length > 0 ? [...new Set(features)] : undefined,
  };
}

function mergeStringArraysPreferNonEmpty(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  const aa = a?.filter((x) => x.trim());
  const bb = b?.filter((x) => x.trim());
  if (aa && aa.length > 0) return aa;
  if (bb && bb.length > 0) return bb;
  return undefined;
}

/** Préfère la valeur issue du dernier build DB (`built`), sinon garde `prev` (blueprint). */
function studioPassThrough<T>(built: T | undefined | null, prev: T | undefined | null): T | undefined {
  if (built !== undefined && built !== null) return built as T;
  if (prev !== undefined && prev !== null) return prev as T;
  return undefined;
}

function mergeDna(prev: CharacterVisualDna, built: CharacterVisualDna): CharacterVisualDna {
  const pick = <T extends string | null | undefined>(a: T, b: T): T | undefined => {
    const as = typeof a === "string" ? a.trim() : "";
    if (as) return a;
    const bs = typeof b === "string" ? b.trim() : "";
    return bs ? b : undefined;
  };

  const mergedCore = mergeCharacterVisualDna({
    dbCharacter: characterVisualDnaToDbFields(built),
    contractCharacter: characterVisualDnaToContractFields(built),
    storyboardCharacterDna: characterVisualDnaToStoryboardFields(prev),
  });

  const distinctiveMarksLine = pick(prev.distinctiveMarksLine, built.distinctiveMarksLine);
  const mergedTraits = mergedCore.distinctiveTraits?.length ? mergedCore.distinctiveTraits.join(" ; ") : "";

  return {
    characterId: prev.characterId,
    displayName: prev.displayName?.trim() || built.displayName,
    hairColor: mergedCore.hairColor ?? pick(prev.hairColor, built.hairColor) ?? null,
    eyeColor: mergedCore.eyeColor ?? pick(prev.eyeColor, built.eyeColor) ?? null,
    outfitSignature: mergedCore.outfitSignature ?? pick(prev.outfitSignature, built.outfitSignature) ?? null,
    canonSignatureText: pick(prev.canonSignatureText, built.canonSignatureText),
    forbiddenDrift:
      prev.forbiddenDrift && prev.forbiddenDrift.length > 0 ? prev.forbiddenDrift : built.forbiddenDrift,
    visualCanonExcerpt:
      prev.visualCanonExcerpt?.trim()
      || built.visualCanonExcerpt
      || undefined,
    hairStyle: mergedCore.hairStyle ?? pick(prev.hairStyle, built.hairStyle),
    skinTone: mergedCore.skinTone ?? pick(prev.skinTone, built.skinTone),
    hairLength: pick(prev.hairLength, built.hairLength),
    hairTexture: pick(prev.hairTexture, built.hairTexture),
    faceShape: pick(prev.faceShape, built.faceShape),
    eyeShape: pick(prev.eyeShape, built.eyeShape),
    eyeSize: pick(prev.eyeSize, built.eyeSize),
    eyebrowStyle: pick(prev.eyebrowStyle, built.eyebrowStyle),
    noseStyle: pick(prev.noseStyle, built.noseStyle),
    mouthStyle: pick(prev.mouthStyle, built.mouthStyle),
    jawline: pick(prev.jawline, built.jawline),
    silhouetteType: pick(prev.silhouetteType, built.silhouetteType) ?? mergedCore.silhouette ?? undefined,
    perceivedAge: pick(prev.perceivedAge, built.perceivedAge) ?? mergedCore.ageAppearance ?? undefined,
    distinctiveMarksLine: distinctiveMarksLine ?? (mergedTraits || undefined),
    accessoriesLine: pick(prev.accessoriesLine, built.accessoriesLine),
    bodyType: pick(prev.bodyType, built.bodyType) ?? mergedCore.bodyType ?? undefined,
    scars: mergeStringArraysPreferNonEmpty(prev.scars, built.scars),
    tattoos: mergeStringArraysPreferNonEmpty(prev.tattoos, built.tattoos),
    accessories: mergeStringArraysPreferNonEmpty(prev.accessories, built.accessories),
    characterFingerprint: studioPassThrough(built.characterFingerprint, prev.characterFingerprint),
    visualProfile: studioPassThrough(built.visualProfile, prev.visualProfile),
    wardrobeProfile: studioPassThrough(built.wardrobeProfile, prev.wardrobeProfile),
    bodyState: studioPassThrough(built.bodyState, prev.bodyState),
    continuityProfile: studioPassThrough(built.continuityProfile, prev.continuityProfile),
    visualRefs: studioPassThrough(built.visualRefs, prev.visualRefs),
    visualLocks: studioPassThrough(built.visualLocks, prev.visualLocks),
    canonPack: studioPassThrough(built.canonPack, prev.canonPack),
    loraAttachments: studioPassThrough(built.loraAttachments, prev.loraAttachments),
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
