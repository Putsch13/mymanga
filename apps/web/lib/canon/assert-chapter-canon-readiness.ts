/**
 * P0.5 — Garde "canon health" avant lancement d'un chapitre.
 *
 * Objectif produit : empêcher un utilisateur de lancer la génération d'un
 * chapitre "sérieux" si les personnages critiques (hero, antagoniste
 * principal, personnages lockés explicitement) n'ont pas une assise canonique
 * minimale (ref stable + fingerprint + lock actif). Sans ça, on sait d'avance
 * que les panels vont driver et que le retry va partir en fallback nom.
 *
 * Lecture seule, usage côté launch/route.ts et pipeline si pertinent.
 *
 * Mode "semi-bloquant" :
 *   - severity = "blocking" si un personnage critique est en `UNKNOWN` ou
 *     n'a ni lock actif ni ref canonique stable
 *   - severity = "warning" si score < 60 mais présence minimum (ref OU lock)
 */
import { prisma } from "@manga-ai-studio/db";
import {
  computeCanonStabilityScore,
  extractStabilitySignals,
  type CanonStabilityLevel,
} from "./compute-canon-stability-score";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";

export type ChapterCanonReadinessViolation = {
  characterId: string;
  characterName: string;
  roleType: string | null;
  score: number;
  level: CanonStabilityLevel;
  severity: "blocking" | "warning";
  missing: string[];
  reason: string;
};

export type ChapterCanonReadinessReport = {
  ok: boolean;
  blocking: boolean;
  violations: ChapterCanonReadinessViolation[];
  checkedCharacterIds: string[];
  thresholds: {
    minScoreForCriticalRole: number;
    blockingBelowScore: number;
  };
};

const MIN_SCORE_FOR_CRITICAL_ROLE = 60;
const BLOCKING_BELOW_SCORE = 30;

/**
 * Sélection des personnages critiques d'un projet :
 *   1. Tous les personnages avec `visualLocks.isActive = true` (lock explicite)
 *   2. Tous les personnages avec `roleType` dans { hero, antagonist, main }
 *   3. Optionnellement, les personnages passés via `requiredCharacterIds`
 *      (si un orchestrateur amont sait qu'un chapitre parle de Bob)
 */
export async function assertChapterCanonReadiness(params: {
  projectId: string;
  requiredCharacterIds?: string[] | null;
}): Promise<ChapterCanonReadinessReport> {
  const { projectId, requiredCharacterIds } = params;

  const chars = await prisma.character.findMany({
    where: {
      projectId,
      OR: [
        { visualLocks: { some: { isActive: true } } },
        { roleType: { in: ["hero", "antagonist", "main"] } },
        requiredCharacterIds && requiredCharacterIds.length > 0
          ? { id: { in: requiredCharacterIds } }
          : { id: "__never__" },
      ],
    },
    select: {
      id: true,
      name: true,
      roleType: true,
      characterFingerprint: true,
      stableVisualDNA: true,
      outfitDefault: true,
      visualLocks: { select: { isActive: true } },
      visualRefs: {
        where: { archivedAt: null },
        select: { imageUrl: true, isPrimary: true },
      },
    },
  });

  const violations: ChapterCanonReadinessViolation[] = [];
  for (const c of chars) {
    const hasStableRefUrl = c.visualRefs.some(
      (r) => typeof r.imageUrl === "string" && isStableImageUrl(r.imageUrl),
    );
    const signals = extractStabilitySignals({
      characterFingerprint: c.characterFingerprint,
      stableVisualDNA: c.stableVisualDNA,
      outfitDefault: c.outfitDefault,
      visualLocks: c.visualLocks,
      visualRefs: c.visualRefs.map((r) => ({ imageUrl: r.imageUrl })),
      idFirstResolution: true,
      recentDriftHardViolations: 0,
    });
    // On override hasStableCanonicalRef par une vraie validation URL stable.
    signals.hasStableCanonicalRef = hasStableRefUrl;
    const { score, level, missing } = computeCanonStabilityScore(signals);

    if (score < MIN_SCORE_FOR_CRITICAL_ROLE) {
      const severity: "blocking" | "warning" =
        score < BLOCKING_BELOW_SCORE || (!hasStableRefUrl && !signals.hasActiveVisualLock)
          ? "blocking"
          : "warning";

      const reasonParts: string[] = [];
      if (!hasStableRefUrl) reasonParts.push("aucune ref visuelle stable");
      if (!signals.hasActiveVisualLock) reasonParts.push("aucun lock visuel actif");
      if (!signals.hasFingerprint) reasonParts.push("pas de fingerprint");
      if (!signals.hasHardTraits) reasonParts.push("pas de traits durs");

      violations.push({
        characterId: c.id,
        characterName: c.name,
        roleType: c.roleType ?? null,
        score,
        level,
        severity,
        missing: missing.map(String),
        reason: reasonParts.length > 0
          ? `Canon insuffisant : ${reasonParts.join(", ")}`
          : `Canon score ${score}/${MIN_SCORE_FOR_CRITICAL_ROLE}`,
      });
    }
  }

  const blocking = violations.some((v) => v.severity === "blocking");
  return {
    ok: violations.length === 0,
    blocking,
    violations,
    checkedCharacterIds: chars.map((c) => c.id),
    thresholds: {
      minScoreForCriticalRole: MIN_SCORE_FOR_CRITICAL_ROLE,
      blockingBelowScore: BLOCKING_BELOW_SCORE,
    },
  };
}
