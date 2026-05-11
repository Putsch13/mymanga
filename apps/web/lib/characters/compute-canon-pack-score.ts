/**
 * Calcul déterministe du score de complétude d'un CanonPack.
 *
 * Pourquoi : `CharacterCanonPack.completenessScore` est une colonne stockée en
 * DB qui n'était jamais calculée par le code applicatif → tous les héros
 * étaient bloqués à `score 0%` même quand l'utilisateur avait tout rempli.
 *
 * Cette fonction évalue la complétude sur les champs qui comptent vraiment
 * pour générer un personnage cohérent visuellement et narrativement, puis
 * retourne un score normalisé entre 0 et 1.
 *
 * Pondération (somme = 1.0) :
 *   - Identité narrative (nom, rôle, genre, bio, objective) : 0.20
 *   - Apparence physique (appearance, hairColor, eyeColor, outfitDefault) : 0.30
 *   - Profil de voix (voiceRegister, voiceVocabularyStyle) : 0.10
 *   - Stable DNA (visual + speech + psyche) : 0.20
 *   - Au moins 1 visualRef non-archivée : 0.20
 *
 * Le tout flag `complete` à true si score ≥ 0.7.
 */

/** Seuil unique : même que `complete` et que le préflight launch (≥ = fiche prête). */
export const CANON_PACK_COMPLETE_SCORE_THRESHOLD = 0.7;

export interface CanonPackScoreInput {
  name: string | null | undefined;
  roleType: string | null | undefined;
  gender: string | null | undefined;
  biography: string | null | undefined;
  objective: string | null | undefined;
  appearance: string | null | undefined;
  hairColor: string | null | undefined;
  eyeColor: string | null | undefined;
  outfitDefault: string | null | undefined;
  voiceRegister: string | null | undefined;
  voiceVocabularyStyle: string | null | undefined;
  /** JSON object — non-empty if has stable DNA fields. */
  stableVisualDNA: unknown;
  stableSpeechDNA: unknown;
  stablePsycheDNA: unknown;
  /** Nombre de refs visuelles non archivées. */
  activeVisualRefCount: number;
}

export interface CanonPackScoreResult {
  /** Score 0..1, arrondi à 2 décimales. */
  score: number;
  /** True si score ≥ 0.7. */
  complete: boolean;
  /** Détail par axe (debug / UI). */
  breakdown: {
    identity: number;
    appearance: number;
    voice: number;
    stableDna: number;
    visualRefs: number;
  };
  /** Liste des champs manquants pour aider l'utilisateur. */
  missing: string[];
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonEmptyObject(v: unknown): boolean {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) continue;
    return true;
  }
  return false;
}

export function computeCanonPackScore(input: CanonPackScoreInput): CanonPackScoreResult {
  const missing: string[] = [];

  // Identité narrative (5 champs · poids 0.20)
  const identityChecks = [
    { key: "name", ok: isNonEmptyString(input.name) },
    { key: "roleType", ok: isNonEmptyString(input.roleType) },
    { key: "gender", ok: isNonEmptyString(input.gender) },
    { key: "biography", ok: isNonEmptyString(input.biography) },
    { key: "objective", ok: isNonEmptyString(input.objective) },
  ];
  const identityFilled = identityChecks.filter((c) => c.ok).length;
  const identityScore = (identityFilled / identityChecks.length) * 0.2;
  for (const c of identityChecks) if (!c.ok) missing.push(`identity.${c.key}`);

  // Apparence physique (4 champs · poids 0.30)
  const appearanceChecks = [
    { key: "appearance", ok: isNonEmptyString(input.appearance) },
    { key: "hairColor", ok: isNonEmptyString(input.hairColor) },
    { key: "eyeColor", ok: isNonEmptyString(input.eyeColor) },
    { key: "outfitDefault", ok: isNonEmptyString(input.outfitDefault) },
  ];
  const appearanceFilled = appearanceChecks.filter((c) => c.ok).length;
  const appearanceScore = (appearanceFilled / appearanceChecks.length) * 0.3;
  for (const c of appearanceChecks) if (!c.ok) missing.push(`appearance.${c.key}`);

  // Profil voix (2 champs · poids 0.10)
  const voiceChecks = [
    { key: "voiceRegister", ok: isNonEmptyString(input.voiceRegister) },
    { key: "voiceVocabularyStyle", ok: isNonEmptyString(input.voiceVocabularyStyle) },
  ];
  const voiceFilled = voiceChecks.filter((c) => c.ok).length;
  const voiceScore = (voiceFilled / voiceChecks.length) * 0.1;
  for (const c of voiceChecks) if (!c.ok) missing.push(`voice.${c.key}`);

  // Stable DNA (3 axes · poids 0.20)
  const dnaChecks = [
    { key: "stableVisualDNA", ok: isNonEmptyObject(input.stableVisualDNA) },
    { key: "stableSpeechDNA", ok: isNonEmptyObject(input.stableSpeechDNA) },
    { key: "stablePsycheDNA", ok: isNonEmptyObject(input.stablePsycheDNA) },
  ];
  const dnaFilled = dnaChecks.filter((c) => c.ok).length;
  const stableDnaScore = (dnaFilled / dnaChecks.length) * 0.2;
  for (const c of dnaChecks) if (!c.ok) missing.push(`dna.${c.key}`);

  // Visual refs (binaire · poids 0.20)
  const hasRef = (input.activeVisualRefCount ?? 0) > 0;
  const visualRefsScore = hasRef ? 0.2 : 0;
  if (!hasRef) missing.push("visualRefs.atLeastOne");

  const total = identityScore + appearanceScore + voiceScore + stableDnaScore + visualRefsScore;
  const score = Math.round(total * 100) / 100;

  return {
    score,
    complete: score >= CANON_PACK_COMPLETE_SCORE_THRESHOLD,
    breakdown: {
      identity: Math.round(identityScore * 100) / 100,
      appearance: Math.round(appearanceScore * 100) / 100,
      voice: Math.round(voiceScore * 100) / 100,
      stableDna: Math.round(stableDnaScore * 100) / 100,
      visualRefs: visualRefsScore,
    },
    missing,
  };
}
