/**
 * P1.1 — Normaliseur d'enums shot-plan ↔ narrative-facts / PanelContract.
 *
 * Contexte : deux vocabulaires coexistent dans la codebase pour décrire un
 * panel :
 *   1. Le ShotPlan (core/types/shot-plan.ts) produit par le director narratif.
 *   2. Le PanelBlueprint / PanelContract / NarrativeFacts (core/types/*.ts)
 *      consommé par les blueprints, QA et générateur d'image.
 *
 * Leurs enums ne coïncident pas :
 *   - `subjectFocus` : shot-plan dit `antagonist` / `important_npc`, les blueprints
 *     attendent `enemy` / `npc`.
 *   - `cutawayType` : shot-plan dit `hands` / `eyes` / `landscape` / `crowd_reaction`,
 *     les blueprints attendent `prop_insert` / `reaction` / `environment` / `npc_group`.
 *   - `shotType` : shot-plan émet `establishing`, PanelContract ne l'accepte pas.
 *   - `cameraAngle` : shot-plan émet `low` / `high` / `worm` / `birds_eye`,
 *     PanelContract attend `low_angle` / `high_angle`.
 *
 * Avant : cast `as unknown as string | null` à la frontière
 * (`applyShotPlanToContract.ts`), aucun alignement → drift silencieux (ex.
 * `subjectFocus=antagonist` passe en fingerprint comme un inconnu, la QA
 * retombe sur le héros).
 *
 * Maintenant : toute valeur entrante passe par ces normaliseurs qui
 *   a. matchent exactement dans la grammaire canonique (narrative-facts),
 *   b. traduisent le vocabulaire shot-plan,
 *   c. renvoient un `warning` si la valeur est inconnue (callsite décide quoi
 *      faire, typiquement logger + fallback).
 */

import type {
  SubjectFocus as NarrativeSubjectFocus,
  CutawayType as NarrativeCutawayType,
} from "./narrative-facts";

// ─── SubjectFocus ─────────────────────────────────────────────────────────

export const CANONICAL_SUBJECT_FOCUS_VALUES = [
  "hero",
  "enemy",
  "ally",
  "duo",
  "npc",
  "group",
  "environment",
  "prop",
  "reaction",
  "speaker",
  "location",
  "aftermath",
  "visual_entity",
] as const;

export type CanonicalSubjectFocus = typeof CANONICAL_SUBJECT_FOCUS_VALUES[number];

// Alignement de type : toute valeur canonique doit appartenir à l'enum
// `SubjectFocus` de narrative-facts.ts. Si ce _checkType casse, il faut
// synchroniser l'un ou l'autre.
const _checkSubjectFocusAlignment: Record<CanonicalSubjectFocus, NarrativeSubjectFocus> = {
  hero: "hero",
  enemy: "enemy",
  ally: "ally",
  duo: "duo",
  npc: "npc",
  group: "group",
  environment: "environment",
  prop: "prop",
  reaction: "reaction",
  speaker: "speaker",
  location: "location",
  aftermath: "aftermath",
  visual_entity: "visual_entity",
};
void _checkSubjectFocusAlignment;

const SHOT_PLAN_SUBJECT_FOCUS_TO_CANONICAL: Record<string, CanonicalSubjectFocus> = {
  hero: "hero",
  antagonist: "enemy",
  important_npc: "npc",
  group: "group",
  environment: "environment",
  prop: "prop",
  reaction: "reaction",
  // P3.1 — Guard/soldier/crowd synonyms → map to group
  guard: "group",
  guards: "group",
  guard_group: "group",
  security: "group",
  soldier: "group",
  soldiers: "group",
  soldier_group: "group",
  military: "group",
  patrol: "group",
  crowd: "group",
  bystanders: "group",
  audience: "group",
  masses: "group",
};

export interface NormalizeResult<T> {
  value: T | null;
  /**
   * Indique que la valeur entrée n'était pas directement canonique.
   *   - undefined : valeur déjà canonique (ou null/undefined en entrée).
   *   - "translated" : mapping shot-plan → canonique appliqué.
   *   - "unknown" : valeur inconnue, `value` vaut null.
   */
  source?: "translated" | "unknown";
  raw?: string;
}

export function normalizeSubjectFocus(
  raw: string | null | undefined,
): NormalizeResult<CanonicalSubjectFocus> {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  const lower = String(raw).toLowerCase().trim();
  if ((CANONICAL_SUBJECT_FOCUS_VALUES as readonly string[]).includes(lower)) {
    return { value: lower as CanonicalSubjectFocus };
  }
  const translated = SHOT_PLAN_SUBJECT_FOCUS_TO_CANONICAL[lower];
  if (translated) {
    return { value: translated, source: "translated", raw };
  }
  return { value: null, source: "unknown", raw };
}

// ─── CutawayType ──────────────────────────────────────────────────────────

export const CANONICAL_CUTAWAY_VALUES = [
  "none",
  "environment",
  "enemy",
  "prop_insert",
  "reaction",
  "npc_group",
  "surveillance",
  "aftermath",
  "movement_trace",
  "crowd",
  "environment_establishing",
  "enemy_reveal",
  "object_insert",
  "reaction_insert",
  "location_transition",
  "threat_insert",
] as const;

export type CanonicalCutawayType = typeof CANONICAL_CUTAWAY_VALUES[number];

const _checkCutawayAlignment: Record<CanonicalCutawayType, NarrativeCutawayType> = {
  none: "none",
  environment: "environment",
  enemy: "enemy",
  prop_insert: "prop_insert",
  reaction: "reaction",
  npc_group: "npc_group",
  surveillance: "surveillance",
  aftermath: "aftermath",
  movement_trace: "movement_trace",
  crowd: "crowd",
  environment_establishing: "environment_establishing",
  enemy_reveal: "enemy_reveal",
  object_insert: "object_insert",
  reaction_insert: "reaction_insert",
  location_transition: "location_transition",
  threat_insert: "threat_insert",
};
void _checkCutawayAlignment;

const SHOT_PLAN_CUTAWAY_TO_CANONICAL: Record<string, CanonicalCutawayType> = {
  none: "none",
  hands: "prop_insert",
  eyes: "reaction",
  object: "prop_insert",
  landscape: "environment",
  crowd_reaction: "npc_group",
  // P3.1 — Guard/soldier/crowd synonyms
  guards: "npc_group",
  guard: "npc_group",
  guard_group: "npc_group",
  security: "npc_group",
  soldiers: "npc_group",
  soldier: "npc_group",
  soldier_group: "npc_group",
  military: "npc_group",
  patrol: "surveillance",
  bystanders: "crowd",
  audience: "crowd",
  masses: "crowd",
};

export function normalizeCutawayType(
  raw: string | null | undefined,
): NormalizeResult<CanonicalCutawayType> {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  const lower = String(raw).toLowerCase().trim();
  if ((CANONICAL_CUTAWAY_VALUES as readonly string[]).includes(lower)) {
    return { value: lower as CanonicalCutawayType };
  }
  const translated = SHOT_PLAN_CUTAWAY_TO_CANONICAL[lower];
  if (translated) {
    return { value: translated, source: "translated", raw };
  }
  return { value: null, source: "unknown", raw };
}

// ─── ShotType ─────────────────────────────────────────────────────────────
// PanelContract n'accepte pas `establishing` → on le traduit en `wide`
// (c'est le plus proche, et c'était le comportement de facto quand `establishing`
// atteignait une branche de pattern matching par défaut).

export const CANONICAL_SHOT_TYPE_VALUES = [
  "wide",
  "medium",
  "closeup",
  "extreme_closeup",
  "over_shoulder",
] as const;

export type CanonicalShotType = typeof CANONICAL_SHOT_TYPE_VALUES[number];

const SHOT_PLAN_SHOT_TYPE_TO_CANONICAL: Record<string, CanonicalShotType> = {
  establishing: "wide",
};

export function normalizeShotType(
  raw: string | null | undefined,
): NormalizeResult<CanonicalShotType> {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  const lower = String(raw).toLowerCase().trim();
  if ((CANONICAL_SHOT_TYPE_VALUES as readonly string[]).includes(lower)) {
    return { value: lower as CanonicalShotType };
  }
  const translated = SHOT_PLAN_SHOT_TYPE_TO_CANONICAL[lower];
  if (translated) {
    return { value: translated, source: "translated", raw };
  }
  return { value: null, source: "unknown", raw };
}

// ─── CameraAngle ──────────────────────────────────────────────────────────
// PanelContract : `eye_level | low_angle | high_angle | dutch`.
// ShotPlan : `eye_level | low | high | dutch | worm | birds_eye`.

export const CANONICAL_CAMERA_ANGLE_VALUES = [
  "eye_level",
  "low_angle",
  "high_angle",
  "dutch",
] as const;

export type CanonicalCameraAngle = typeof CANONICAL_CAMERA_ANGLE_VALUES[number];

const SHOT_PLAN_CAMERA_TO_CANONICAL: Record<string, CanonicalCameraAngle> = {
  low: "low_angle",
  high: "high_angle",
  worm: "low_angle",
  birds_eye: "high_angle",
};

export function normalizeCameraAngle(
  raw: string | null | undefined,
): NormalizeResult<CanonicalCameraAngle> {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  const lower = String(raw).toLowerCase().trim();
  if ((CANONICAL_CAMERA_ANGLE_VALUES as readonly string[]).includes(lower)) {
    return { value: lower as CanonicalCameraAngle };
  }
  const translated = SHOT_PLAN_CAMERA_TO_CANONICAL[lower];
  if (translated) {
    return { value: translated, source: "translated", raw };
  }
  return { value: null, source: "unknown", raw };
}

// ─── Helpers groupés ──────────────────────────────────────────────────────

/**
 * Normalise en bloc les 4 enums d'un panel shot-plan → canonique. Logue un
 * warning (via console.warn) si une valeur est inconnue — callsite reste
 * maître de la sévérité en lisant `unknowns`.
 */
export function normalizeShotPlanPanelEnums(input: {
  shotType?: string | null;
  cameraAngle?: string | null;
  subjectFocus?: string | null;
  cutawayType?: string | null;
}, context?: string): {
  shotType: CanonicalShotType | null;
  cameraAngle: CanonicalCameraAngle | null;
  subjectFocus: CanonicalSubjectFocus | null;
  cutawayType: CanonicalCutawayType | null;
  unknowns: string[];
} {
  const s = normalizeShotType(input.shotType);
  const c = normalizeCameraAngle(input.cameraAngle);
  const f = normalizeSubjectFocus(input.subjectFocus);
  const u = normalizeCutawayType(input.cutawayType);
  const unknowns: string[] = [];
  if (s.source === "unknown") unknowns.push(`shotType=${s.raw}`);
  if (c.source === "unknown") unknowns.push(`cameraAngle=${c.raw}`);
  if (f.source === "unknown") unknowns.push(`subjectFocus=${f.raw}`);
  if (u.source === "unknown") unknowns.push(`cutawayType=${u.raw}`);
  if (unknowns.length > 0) {
    const ctx = context ? `[${context}] ` : "";
    console.warn(`${ctx}enum-normalizer: valeurs inconnues — ${unknowns.join(", ")}`);
  }
  return {
    shotType: s.value,
    cameraAngle: c.value,
    subjectFocus: f.value,
    cutawayType: u.value,
    unknowns,
  };
}

/**
 * P1.2 (sprint 5) — Lecture + normalisation des enums stockés dans un champ
 * JSON Prisma (`panelContract` / `shotPlan` / `panelDebugTrace.shotPlan`).
 *
 * Les casts `value as string` à la frontière JSON sont inévitables (Prisma
 * type les Json en `unknown`), mais on garantit ici qu'AUCUNE valeur brute
 * ne s'échappe dans le routing : toute valeur passe par `normalize*` et
 * devient soit canonique, soit `null` (avec warning dans `unknowns`).
 *
 * Usage typique :
 *   const { subjectFocus, shotType, cameraAngle, cutawayType } =
 *     readShotPlanEnumsFromJson(panelContractMeta, "retry-route");
 */
export function readShotPlanEnumsFromJson(
  json: Record<string, unknown> | undefined | null,
  context?: string,
): {
  shotType: CanonicalShotType | null;
  cameraAngle: CanonicalCameraAngle | null;
  subjectFocus: CanonicalSubjectFocus | null;
  cutawayType: CanonicalCutawayType | null;
  unknowns: string[];
} {
  if (!json) {
    return { shotType: null, cameraAngle: null, subjectFocus: null, cutawayType: null, unknowns: [] };
  }
  const shotRaw = typeof json.shotType === "string" ? json.shotType : null;
  const cameraRaw = typeof json.cameraAngle === "string" ? json.cameraAngle : null;
  const focusRaw = typeof json.subjectFocus === "string" ? json.subjectFocus : null;
  const cutRaw = typeof json.cutawayType === "string" ? json.cutawayType : null;
  return normalizeShotPlanPanelEnums(
    { shotType: shotRaw, cameraAngle: cameraRaw, subjectFocus: focusRaw, cutawayType: cutRaw },
    context,
  );
}
