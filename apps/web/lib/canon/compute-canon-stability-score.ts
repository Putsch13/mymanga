/**
 * P7.1 — Score de stabilité canonique par personnage / lieu / panel.
 *
 * But produit : afficher, dans le studio ou dans un dashboard "canon health"
 * (P7.2), un niveau de fiabilité OBJECTIF plutôt qu'intuitif.
 *
 * Formule (somme de pondérations, chacune 0-1, total rescale en 0-100) :
 *   - hasStableCanonicalRef  (0.30)  — au moins 1 ref stable en storage
 *   - hasActiveVisualLock    (0.20)  — un characterVisualLock.isActive
 *   - hasFingerprint         (0.15)  — `characterFingerprint` non vide
 *   - hasHardTraits          (0.10)  — hardTraits populé (fingerprint ou DNA)
 *   - hasDefaultOutfit       (0.10)  — outfitDefault non vide
 *   - idFirstResolution      (0.10)  — panelCast.focus.characterId présent
 *   - noDriftViolations      (0.05)  — pas de drift `hard` détecté récemment
 *
 * Score ∈ [0, 100]. Niveaux d'interprétation :
 *   - 80-100 : HARD_LOCK viable
 *   - 60-79  : STRONG (continuité tenable sur plusieurs chapitres)
 *   - 40-59  : MEDIUM (dérives possibles hors panels importants)
 *   - 20-39  : SOFT (canon encore instable)
 *   - 0-19   : UNKNOWN / manquant
 */

export type CanonStabilitySignals = {
  hasStableCanonicalRef: boolean;
  hasActiveVisualLock: boolean;
  hasFingerprint: boolean;
  hasHardTraits: boolean;
  hasDefaultOutfit: boolean;
  idFirstResolution: boolean;
  recentDriftHardViolations: number;
};

export type CanonStabilityLevel =
  | "HARD_LOCK"
  | "STRONG"
  | "MEDIUM"
  | "SOFT"
  | "UNKNOWN";

export type CanonStabilityScore = {
  score: number;
  level: CanonStabilityLevel;
  missing: Array<keyof CanonStabilitySignals>;
};

const WEIGHTS: Record<keyof Omit<CanonStabilitySignals, "recentDriftHardViolations">, number> = {
  hasStableCanonicalRef: 0.30,
  hasActiveVisualLock: 0.20,
  hasFingerprint: 0.15,
  hasHardTraits: 0.10,
  hasDefaultOutfit: 0.10,
  idFirstResolution: 0.10,
};

export function computeCanonStabilityScore(signals: CanonStabilitySignals): CanonStabilityScore {
  let raw = 0;
  const missing: Array<keyof CanonStabilitySignals> = [];
  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof typeof WEIGHTS, number][]) {
    if (signals[key]) {
      raw += weight;
    } else {
      missing.push(key);
    }
  }
  // Pénalité drift `hard` récent : -0.05 par violation, plafonné à -0.15.
  const penalty = Math.min(0.15, Math.max(0, signals.recentDriftHardViolations * 0.05));
  const noDriftBonus = signals.recentDriftHardViolations === 0 ? 0.05 : 0;
  const finalScore = Math.max(0, Math.min(1, raw + noDriftBonus - penalty));
  const score = Math.round(finalScore * 100);

  let level: CanonStabilityLevel = "UNKNOWN";
  if (score >= 80) level = "HARD_LOCK";
  else if (score >= 60) level = "STRONG";
  else if (score >= 40) level = "MEDIUM";
  else if (score >= 20) level = "SOFT";

  return { score, level, missing };
}

/**
 * Helper : extrait les signaux depuis un payload character + visualLocks.
 * Les consommateurs (API canon-health P7.2, studio) doivent fournir un
 * payload enrichi (characterFingerprint + visualLocks + visualRefs).
 */
export type CharacterForStability = {
  characterFingerprint?: unknown;
  stableVisualDNA?: unknown;
  outfitDefault?: string | null;
  visualLocks?: Array<{ isActive?: boolean | null }>;
  visualRefs?: Array<{ imageUrl?: string | null; archivedAt?: Date | null }>;
  // Quelques drifts historiques (panel metadata) — agrégation externe
  recentDriftHardViolations?: number;
  // Indique si au moins 1 panelCast récent a focus.characterId renseigné.
  idFirstResolution?: boolean;
};

export function extractStabilitySignals(input: CharacterForStability): CanonStabilitySignals {
  const fp = input.characterFingerprint && typeof input.characterFingerprint === "object"
    ? (input.characterFingerprint as Record<string, unknown>)
    : null;
  const dna = input.stableVisualDNA && typeof input.stableVisualDNA === "object"
    ? (input.stableVisualDNA as Record<string, unknown>)
    : null;
  const hardFromFp = Array.isArray(fp?.hardTraits) && (fp!.hardTraits as unknown[]).length > 0;
  const hardFromDna = Array.isArray(dna?.scars) || Array.isArray(dna?.tattoos) || Array.isArray(dna?.fixedAccessories);
  const hasFingerprint = Boolean(fp && Object.keys(fp).length > 0);
  const activeVisualLock = (input.visualLocks ?? []).some((l) => l?.isActive === true);
  const hasStableRef = (input.visualRefs ?? []).some((r) => !r.archivedAt && typeof r.imageUrl === "string" && r.imageUrl.length > 0);
  return {
    hasStableCanonicalRef: hasStableRef,
    hasActiveVisualLock: activeVisualLock,
    hasFingerprint,
    hasHardTraits: hardFromFp || hardFromDna,
    hasDefaultOutfit: typeof input.outfitDefault === "string" && input.outfitDefault.length > 0,
    idFirstResolution: Boolean(input.idFirstResolution),
    recentDriftHardViolations: Math.max(0, input.recentDriftHardViolations ?? 0),
  };
}
