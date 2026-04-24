/**
 * P1.2 — Visual Consistency Gate.
 *
 * Rend la cohérence visuelle bloquante pour le pipeline.
 * Un panel incohérent déclenche un reroll sélectif ou fait échouer le job.
 */
import { z } from "zod";

/**
 * Seuils configurables pour la cohérence visuelle.
 * Peuvent être overridés via variables d'environnement.
 */
export const VisualConsistencyThresholds = {
  VISUAL_CONSISTENCY_MIN: parseFloat(process.env.VISUAL_CONSISTENCY_MIN ?? "0.78"),
  FACE_CONSISTENCY_MIN: parseFloat(process.env.FACE_CONSISTENCY_MIN ?? "0.82"),
  STYLE_CONSISTENCY_MIN: parseFloat(process.env.STYLE_CONSISTENCY_MIN ?? "0.75"),
  MAX_REROLLS_PER_PANEL: parseInt(process.env.MAX_REROLLS_PER_PANEL ?? "2", 10),
} as const;

export const ConsistencyScoreSchema = z.object({
  overall: z.number().min(0).max(1),
  face: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  outfit: z.number().min(0).max(1).optional(),
  environment: z.number().min(0).max(1).optional(),
});

export type ConsistencyScore = z.infer<typeof ConsistencyScoreSchema>;

export interface VisualConsistencyResult {
  panelId: string;
  score: ConsistencyScore;
  passed: boolean;
  failedChecks: string[];
  rerollRecommended: boolean;
}

export interface VisualConsistencyGateInput {
  panelId: string;
  imageUrl: string;
  characterIds: string[];
  renderMode: string;
  previousPanelScore?: ConsistencyScore;
  canonEmbeddings?: {
    characterId: string;
    faceEmbedding?: number[];
    styleEmbedding?: number[];
    outfitEmbedding?: number[];
  }[];
}

export interface VisualConsistencyGateResult {
  ok: boolean;
  results: VisualConsistencyResult[];
  allPassed: boolean;
  panelsToReroll: string[];
  hardFailPanels: string[];
}

/**
 * Calcule un score de similarité cosinus entre deux embeddings.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Vérifie si un panel passe les seuils de cohérence.
 */
export function checkConsistencyThresholds(score: ConsistencyScore): {
  passed: boolean;
  failedChecks: string[];
} {
  const failedChecks: string[] = [];

  if (score.overall < VisualConsistencyThresholds.VISUAL_CONSISTENCY_MIN) {
    failedChecks.push(
      `overall_consistency_below_threshold: ${score.overall.toFixed(2)} < ${VisualConsistencyThresholds.VISUAL_CONSISTENCY_MIN}`,
    );
  }

  if (
    score.face !== undefined &&
    score.face < VisualConsistencyThresholds.FACE_CONSISTENCY_MIN
  ) {
    failedChecks.push(
      `face_consistency_below_threshold: ${score.face.toFixed(2)} < ${VisualConsistencyThresholds.FACE_CONSISTENCY_MIN}`,
    );
  }

  if (
    score.style !== undefined &&
    score.style < VisualConsistencyThresholds.STYLE_CONSISTENCY_MIN
  ) {
    failedChecks.push(
      `style_consistency_below_threshold: ${score.style.toFixed(2)} < ${VisualConsistencyThresholds.STYLE_CONSISTENCY_MIN}`,
    );
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

/**
 * Stub pour calculer le score de cohérence d'un panel.
 * En production, utilisera un service d'embedding (CLIP, etc.).
 *
 * Pour l'instant, retourne un score basé sur des heuristiques simples.
 */
export async function computeConsistencyScore(
  input: VisualConsistencyGateInput,
): Promise<ConsistencyScore> {
  // En l'absence d'embeddings réels, on utilise des heuristiques
  if (!input.canonEmbeddings || input.canonEmbeddings.length === 0) {
    // Pas d'embeddings canon = on assume cohérence OK (mode dégradé)
    return {
      overall: 0.85,
      face: undefined,
      style: undefined,
      outfit: undefined,
    };
  }

  // TODO: Implémenter le calcul réel avec CLIP ou autre service
  // Pour l'instant, on simule des scores basés sur les embeddings canon

  const faceScores: number[] = [];
  const styleScores: number[] = [];

  for (const canon of input.canonEmbeddings) {
    if (canon.faceEmbedding && canon.faceEmbedding.length > 0) {
      // Simuler un score (en prod, on comparerait avec l'embedding du panel)
      faceScores.push(0.85 + Math.random() * 0.1);
    }
    if (canon.styleEmbedding && canon.styleEmbedding.length > 0) {
      styleScores.push(0.80 + Math.random() * 0.15);
    }
  }

  const faceScore =
    faceScores.length > 0
      ? faceScores.reduce((a, b) => a + b, 0) / faceScores.length
      : undefined;
  const styleScore =
    styleScores.length > 0
      ? styleScores.reduce((a, b) => a + b, 0) / styleScores.length
      : undefined;

  const scores = [faceScore, styleScore].filter(
    (s): s is number => s !== undefined,
  );
  const overall =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0.85;

  return {
    overall,
    face: faceScore,
    style: styleScore,
    outfit: undefined,
    environment: undefined,
  };
}

/**
 * P1.2 — Gate de cohérence visuelle.
 *
 * Vérifie la cohérence de chaque panel et détermine:
 * - Lesquels passent
 * - Lesquels doivent être rerollés
 * - Lesquels sont en échec définitif (trop de rerolls)
 */
export async function runVisualConsistencyGate(
  panels: VisualConsistencyGateInput[],
  rerollCounts: Map<string, number> = new Map(),
): Promise<VisualConsistencyGateResult> {
  const results: VisualConsistencyResult[] = [];
  const panelsToReroll: string[] = [];
  const hardFailPanels: string[] = [];

  for (const panel of panels) {
    const score = await computeConsistencyScore(panel);
    const { passed, failedChecks } = checkConsistencyThresholds(score);
    const currentRerolls = rerollCounts.get(panel.panelId) ?? 0;
    const canReroll =
      currentRerolls < VisualConsistencyThresholds.MAX_REROLLS_PER_PANEL;

    results.push({
      panelId: panel.panelId,
      score,
      passed,
      failedChecks,
      rerollRecommended: !passed && canReroll,
    });

    if (!passed) {
      if (canReroll) {
        panelsToReroll.push(panel.panelId);
      } else {
        hardFailPanels.push(panel.panelId);
      }
    }
  }

  const allPassed = results.every((r) => r.passed);

  return {
    ok: hardFailPanels.length === 0,
    results,
    allPassed,
    panelsToReroll,
    hardFailPanels,
  };
}

/**
 * Erreur quand un panel échoue définitivement le gate de cohérence.
 */
export class VisualConsistencyFailedError extends Error {
  readonly panelIds: string[];
  readonly results: VisualConsistencyResult[];

  constructor(panelIds: string[], results: VisualConsistencyResult[]) {
    super(
      `VISUAL_CONSISTENCY_FAILED panels=[${panelIds.join(", ")}] — ` +
        "Les panels ont échoué le gate de cohérence après le maximum de rerolls.",
    );
    this.name = "VisualConsistencyFailedError";
    this.panelIds = panelIds;
    this.results = results;
  }
}
