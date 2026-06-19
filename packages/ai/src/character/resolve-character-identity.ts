/**
 * Résolveur d'identité visuelle unique.
 *
 * Fusionne les ~8 représentations éparpillées d'un personnage en UN objet
 * typé (`CharacterIdentity`). Règle de précédence par champ :
 *   1. `stableVisualDNA` (canon verrouillé par l'IA)
 *   2. `visualProfile` (configurateur utilisateur)
 *   3. colonne plate (legacy / création rapide)
 *
 * Ne throw jamais. Un champ absent → `null` / `[]` / `false`.
 */

/* ── Types d'entrée ────────────────────────────────────────────────────── */

export interface CharacterIdentitySource {
  name: string;
  gender?: string | null;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  roleType?: string | null;
  emotionalState?: string | null;
  traits?: string[] | null;
  flaws?: string[] | null;
  entityKind?: string | null;
  speciesLabel?: string | null;

  visualProfile?: Record<string, unknown> | null;
  bodyState?: Record<string, unknown> | null;
  wardrobeProfile?: Record<string, unknown> | null;
  continuityProfile?: Record<string, unknown> | null;
  stableVisualDNA?: Record<string, unknown> | null;
}

/* ── Type de sortie ────────────────────────────────────────────────────── */

export interface BeardDescriptor {
  present: boolean;
  style: string | null;
  density: string | null;
  color: string | null;
}

export interface MustacheDescriptor {
  present: boolean;
  style: string | null;
}

export interface BodyMarkers {
  leftArm: boolean;
  rightArm: boolean;
  leftEye: boolean;
  rightEye: boolean;
}

export interface CharacterIdentity {
  name: string;
  gender: string | null;
  entityKind: string | null;
  speciesLabel: string | null;

  appearanceText: string | null;
  hairColor: string | null;
  hairStyle: string | null;
  eyeColor: string | null;
  eyeShape: string | null;
  faceShape: string | null;
  skinTone: string | null;
  silhouette: string | null;

  beard: BeardDescriptor;
  mustache: MustacheDescriptor;
  sideburns: string | null;

  scars: string | null;
  tattoos: string | null;
  accessories: string | null;

  outfit: string | null;
  colorPalette: string | null;

  bodyMarkers: BodyMarkers;

  lockedVisualTraits: string[];
  forbiddenVisualDrift: string[];

  restingFace: string | null;
  typicalGaze: string | null;
  habitualPosture: string | null;
  signatureGesture: string | null;

  roleType: string | null;
  emotionalState: string | null;
  traits: string[];
}

/* ── Helpers internes ──────────────────────────────────────────────────── */

function pick(...candidates: unknown[]): string | null {
  for (const v of candidates) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function safeStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function safeStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  return [];
}

function safeBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

/* ── Résolveur principal ───────────────────────────────────────────────── */

export function resolveCharacterIdentity(
  source: CharacterIdentitySource,
): CharacterIdentity {
  const dna = (source.stableVisualDNA ?? {}) as Record<string, unknown>;
  const vp = (source.visualProfile ?? {}) as Record<string, unknown>;
  const bs = (source.bodyState ?? {}) as Record<string, unknown>;
  const wp = (source.wardrobeProfile ?? {}) as Record<string, unknown>;
  const cp = (source.continuityProfile ?? {}) as Record<string, unknown>;

  const beardPresent = safeBool(vp.beardPresent, false);
  const mustachePresent = safeBool(vp.mustachePresent, false);

  return {
    name: source.name,
    gender: pick(safeStr(dna.gender), source.gender),
    entityKind: source.entityKind ?? null,
    speciesLabel: source.speciesLabel ?? null,

    appearanceText: pick(safeStr(dna.appearance), source.appearance),
    hairColor: pick(safeStr(dna.hairColor), safeStr(vp.hairColor), source.hairColor),
    hairStyle: pick(safeStr(dna.hairStyle), safeStr(vp.hairStyle)),
    eyeColor: pick(safeStr(dna.eyeColor), safeStr(vp.eyeColor), source.eyeColor),
    eyeShape: pick(safeStr(dna.eyeShape), safeStr(vp.eyeShape)),
    faceShape: pick(safeStr(dna.faceShape), safeStr(vp.faceShape)),
    skinTone: pick(safeStr(dna.skinTone), safeStr(vp.skinTone)),
    silhouette: pick(safeStr(dna.silhouette), safeStr(vp.silhouetteType)),

    beard: {
      present: beardPresent,
      style: beardPresent ? pick(safeStr(vp.beardStyle)) : null,
      density: beardPresent ? pick(safeStr(vp.beardDensity)) : null,
      color: beardPresent ? pick(safeStr(vp.beardColor)) : null,
    },
    mustache: {
      present: mustachePresent,
      style: mustachePresent ? pick(safeStr(vp.mustacheStyle)) : null,
    },
    sideburns: (() => {
      const v = safeStr(vp.sideburns);
      return v && v.toLowerCase() !== "aucun" ? v : null;
    })(),

    scars: pick(
      safeStr(dna.scars),
      safeStr(vp.scars),
      safeStringArray(dna.distinctiveFeatures).filter((f) => /scar|cicatric/i.test(f)).join(", ") || null,
    ),
    tattoos: pick(safeStr(dna.tattoos), safeStr(vp.tattoos)),
    accessories: pick(safeStr(dna.accessories), safeStr(vp.accessories)),

    outfit: pick(
      safeStr(dna.defaultOutfit),
      safeStr(wp.defaultOutfit),
      source.outfitDefault,
    ),
    colorPalette: pick(safeStr(wp.colorPalette)),

    bodyMarkers: {
      leftArm: safeBool(bs.leftArmPresent, true),
      rightArm: safeBool(bs.rightArmPresent, true),
      leftEye: safeBool(bs.leftEyePresent, true),
      rightEye: safeBool(bs.rightEyePresent, true),
    },

    lockedVisualTraits: [
      ...safeStringArray((cp as Record<string, unknown>).lockedVisualTraits),
      ...safeStringArray((cp as Record<string, unknown>).lockedBodyTraits),
      ...safeStringArray((cp as Record<string, unknown>).lockedWardrobeTraits),
    ],
    forbiddenVisualDrift: [
      ...safeStringArray(dna.forbiddenVisualDrift),
      ...safeStringArray((cp as Record<string, unknown>).forbiddenDrift),
    ],

    restingFace: pick(safeStr(vp.restingFace)),
    typicalGaze: pick(safeStr(vp.typicalGaze)),
    habitualPosture: pick(safeStr(vp.habitualPosture)),
    signatureGesture: pick(safeStr(vp.signatureGesture)),

    roleType: source.roleType ?? null,
    emotionalState: source.emotionalState ?? null,
    traits: [
      ...safeStringArray(source.traits),
      ...safeStringArray(source.flaws),
    ],
  };
}
