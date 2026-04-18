/**
 * P1.3 + P1.4 — Helpers pour construire des hints de retry personnage
 * robustes sur le plan physique, et sérialiser les blobs JSON
 * (bodyState, wardrobeProfile) sans provoquer de `[object Object]`
 * dans le prompt.
 *
 * Ces helpers sont purs et réutilisables :
 *   - `serializeBodyStateForPrompt(bs)`
 *   - `serializeWardrobeProfileForPrompt(wp)`
 *   - `buildCharacterRetryHints({ target })`
 *
 * Ils sont consommés par :
 *   - `apps/web/app/api/scene-images/[sceneImageId]/retry/route.ts` (P1.3)
 *   - `apps/web/app/api/characters/[characterId]/generate-visual/route.ts` (P1.4)
 *
 * Règle d'or : toute valeur imprimée dans un prompt doit passer par un
 * serializer explicite qui gère string / array / object / null, pas un
 * `String(blob)` naïf.
 */

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [k: string]: JsonValue | undefined };

/**
 * Sérialise un bodyState en bullet-list lisible pour un prompt.
 * Exemples d'entrée :
 *   - "lean muscular build, slight scar over right eye"
 *   - ["tall build", "prosthetic left arm", "burn mark on neck"]
 *   - { build: "athletic", scars: ["right eye"], prosthetics: ["left arm"] }
 */
export function serializeBodyStateForPrompt(bodyState: unknown): string | null {
  if (bodyState === null || bodyState === undefined) return null;
  if (typeof bodyState === "string") {
    const trimmed = bodyState.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(bodyState)) {
    const parts = bodyState
      .map((v) => (typeof v === "string" ? v.trim() : JSON.stringify(v)))
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof bodyState === "object") {
    const obj = bodyState as JsonObject;
    const parts: string[] = [];
    if (typeof obj.build === "string") parts.push(`build: ${obj.build}`);
    if (typeof obj.height === "string") parts.push(`height: ${obj.height}`);
    if (Array.isArray(obj.scars) && obj.scars.length > 0) {
      parts.push(`scars (${obj.scars.join(", ")})`);
    }
    if (Array.isArray(obj.tattoos) && obj.tattoos.length > 0) {
      parts.push(`tattoos (${obj.tattoos.join(", ")})`);
    }
    if (Array.isArray(obj.prosthetics) && obj.prosthetics.length > 0) {
      parts.push(`prosthetics (${obj.prosthetics.join(", ")})`);
    }
    if (Array.isArray(obj.permanentMarkers) && obj.permanentMarkers.length > 0) {
      parts.push(`permanent markers (${obj.permanentMarkers.join(", ")})`);
    }
    if (Array.isArray(obj.currentInjuries) && obj.currentInjuries.length > 0) {
      parts.push(`current injuries (${obj.currentInjuries.join(", ")})`);
    }
    if (parts.length > 0) return parts.join("; ");
    // Fallback non destructif : on sérialise en JSON plutôt que `[object Object]`.
    try {
      return JSON.stringify(bodyState).slice(0, 400);
    } catch {
      return null;
    }
  }
  return String(bodyState);
}

/**
 * Sérialise un wardrobeProfile (outfit par défaut + variantes).
 */
export function serializeWardrobeProfileForPrompt(wardrobe: unknown): string | null {
  if (wardrobe === null || wardrobe === undefined) return null;
  if (typeof wardrobe === "string") {
    const trimmed = wardrobe.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(wardrobe)) {
    const parts = wardrobe
      .map((v) => (typeof v === "string" ? v.trim() : JSON.stringify(v)))
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof wardrobe === "object") {
    const obj = wardrobe as JsonObject;
    const parts: string[] = [];
    if (typeof obj.default === "string") parts.push(`default outfit: ${obj.default}`);
    if (Array.isArray(obj.altOutfits) && obj.altOutfits.length > 0) {
      parts.push(`alt outfits (${obj.altOutfits.join(", ")})`);
    }
    if (Array.isArray(obj.fixedAccessories) && obj.fixedAccessories.length > 0) {
      parts.push(`fixed accessories (${obj.fixedAccessories.join(", ")})`);
    }
    if (typeof obj.palette === "string") parts.push(`palette: ${obj.palette}`);
    if (obj.outfitLock === true) parts.push(`outfit lock: strict`);
    if (parts.length > 0) return parts.join("; ");
    try {
      return JSON.stringify(wardrobe).slice(0, 400);
    } catch {
      return null;
    }
  }
  return String(wardrobe);
}

// ── buildCharacterRetryHints (P1.3) ───────────────────────────────────────

export type RetryHintsTarget = {
  id?: string | null;
  name: string;
  characterFingerprint?: unknown;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  visualProfile?: unknown;
  bodyState?: unknown;
  wardrobeProfile?: unknown;
  /** Jamais en colonne directe : dérivée de `stableVisualDNA.forbiddenVisualDrift`. */
  forbiddenVisualDrift?: unknown;
  stableVisualDNA?: unknown;
};

export type CharacterRetryHints = { positive: string; negative: string };

/**
 * Construit une paire (positive / negative) de hints de retry pour
 * verrouiller l'identité d'un personnage au-delà de hair+eye+appearance :
 *   - build / height
 *   - cicatrices, tatouages, prothèses (via bodyState)
 *   - outfit verrouillé (via wardrobeProfile + outfitDefault)
 *   - forbiddenVisualDrift injecté en négatif
 *
 * Les segments absents sont simplement omis (pas de `null` dans le prompt).
 */
export function buildCharacterRetryHints(target: RetryHintsTarget | null | undefined): CharacterRetryHints {
  if (!target) {
    return {
      positive: "preserve character identity, same face, same hair, same outfit, strict continuity",
      negative: "wrong hair color, wrong outfit, inconsistent face, identity drift",
    };
  }

  const fp = target.characterFingerprint && typeof target.characterFingerprint === "object"
    ? target.characterFingerprint as Record<string, unknown>
    : null;
  const vp = target.visualProfile && typeof target.visualProfile === "object"
    ? target.visualProfile as Record<string, unknown>
    : null;

  const dna = target.stableVisualDNA && typeof target.stableVisualDNA === "object"
    ? target.stableVisualDNA as Record<string, unknown>
    : null;

  const hairColor = pickStr(fp?.hairColor, dna?.hairColor, vp?.hairColor, target.hairColor);
  const eyeColor = pickStr(fp?.eyeColor, dna?.eyeColor, vp?.eyeColor, target.eyeColor);
  const gender = pickStr(fp?.gender, vp?.gender);
  const appearance = pickStr(fp?.appearance, target.appearance);
  const outfitDefault = pickStr(target.outfitDefault);

  const bodyStateLine = serializeBodyStateForPrompt(target.bodyState);
  const wardrobeLine = serializeWardrobeProfileForPrompt(target.wardrobeProfile);

  const positiveBits: string[] = [];
  positiveBits.push(`preserve ${target.name}'s face`);
  if (hairColor) positiveBits.push(`hair (${hairColor})`);
  if (eyeColor) positiveBits.push(`eyes (${eyeColor})`);
  if (appearance) positiveBits.push(`appearance: ${appearance.slice(0, 100)}`);
  if (bodyStateLine) positiveBits.push(`body state (${bodyStateLine.slice(0, 160)})`);
  if (wardrobeLine) positiveBits.push(`wardrobe profile (${wardrobeLine.slice(0, 160)})`);
  if (outfitDefault) positiveBits.push(`default outfit: ${outfitDefault.slice(0, 100)}`);
  positiveBits.push(`strict identity lock on ${target.name}${gender ? `, ${gender}` : ""}`);

  // forbiddenVisualDrift peut venir soit du champ direct (legacy / NPC auto),
  // soit du JSON `stableVisualDNA.forbiddenVisualDrift` (source primaire
  // pour les characters canoniques — voir schema.prisma).
  const directForbidden = Array.isArray(target.forbiddenVisualDrift)
    ? (target.forbiddenVisualDrift as unknown[])
    : [];
  const dnaForbidden = Array.isArray(dna?.forbiddenVisualDrift)
    ? (dna!.forbiddenVisualDrift as unknown[])
    : [];
  const forbiddenDrift = [...directForbidden, ...dnaForbidden].filter((v): v is string => typeof v === "string");

  const negativeBits: string[] = [];
  negativeBits.push(`wrong face for ${target.name}`);
  negativeBits.push("identity drift");
  negativeBits.push(`generic anime face replacing ${target.name}`);
  if (hairColor) negativeBits.push(`wrong hair color for ${target.name}`);
  if (outfitDefault || wardrobeLine) negativeBits.push(`wrong outfit for ${target.name}`);
  if (forbiddenDrift.length > 0) negativeBits.push(...forbiddenDrift);

  return {
    positive: positiveBits.join(", "),
    negative: negativeBits.join(", "),
  };
}

function pickStr(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}
