/**
 * P7.2 — Drift Metrics
 *
 * Calcule et expose des métriques de dérive visuelle pour un chapitre.
 * Utilisé pour monitorer la qualité de génération et détecter les régressions.
 *
 * Métriques calculées :
 *   - Taux de dérive caractère (panels où le personnage ne ressemble pas au canon)
 *   - Taux de dérive environnement (panels où le décor ne match pas le contexte)
 *   - Taux de contamination héros (panels non-héros avec héros trop visible)
 *   - Score de cohérence chapitre
 */

import type { SubjectBalanceScore } from "./subject-balance-score";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DriftMetrics {
  chapterId: string;
  totalPanels: number;
  analyzedPanels: number;
  characterDrift: CharacterDriftMetrics;
  environmentDrift: EnvironmentDriftMetrics;
  heroContamination: HeroContaminationMetrics;
  overallCoherence: number;
  timestamp: number;
}

export interface CharacterDriftMetrics {
  panelsWithDrift: number;
  driftRate: number;
  averageSimilarityScore: number;
  worstPanelId: string | null;
  worstPanelScore: number | null;
}

export interface EnvironmentDriftMetrics {
  panelsWithInconsistency: number;
  inconsistencyRate: number;
  averageEnvironmentScore: number;
}

export interface HeroContaminationMetrics {
  contaminatedPanels: number;
  contaminationRate: number;
  affectedPanelTypes: string[];
}

export interface PanelDriftInput {
  panelId: string;
  panelType: string;
  dominantSubject: string;
  characterSimilarityScore?: number | null;
  environmentScore?: number | null;
  balanceScore?: SubjectBalanceScore | null;
  heroWasVisible?: boolean;
  heroShouldBeVisible?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Thresholds
// ────────────────────────────────────────────────────────────────────────────

const CHARACTER_DRIFT_THRESHOLD = 0.65;
const ENVIRONMENT_INCONSISTENCY_THRESHOLD = 0.5;
const HERO_CONTAMINATION_THRESHOLD = 0.4;

// ────────────────────────────────────────────────────────────────────────────
// Metrics calculation
// ────────────────────────────────────────────────────────────────────────────

export function calculateDriftMetrics(
  chapterId: string,
  panels: PanelDriftInput[],
): DriftMetrics {
  const analyzed = panels.filter(
    (p) => p.characterSimilarityScore !== null || p.environmentScore !== null || p.balanceScore !== null,
  );

  // Character drift
  const withCharScore = panels.filter((p) => p.characterSimilarityScore !== null && p.characterSimilarityScore !== undefined);
  const charDriftPanels = withCharScore.filter((p) => p.characterSimilarityScore! < CHARACTER_DRIFT_THRESHOLD);
  const worstChar = withCharScore.length > 0
    ? withCharScore.reduce((min, p) =>
        (p.characterSimilarityScore ?? 1) < (min.characterSimilarityScore ?? 1) ? p : min,
      )
    : null;

  const characterDrift: CharacterDriftMetrics = {
    panelsWithDrift: charDriftPanels.length,
    driftRate: withCharScore.length > 0 ? charDriftPanels.length / withCharScore.length : 0,
    averageSimilarityScore:
      withCharScore.length > 0
        ? withCharScore.reduce((sum, p) => sum + (p.characterSimilarityScore ?? 0), 0) / withCharScore.length
        : 1,
    worstPanelId: worstChar?.panelId ?? null,
    worstPanelScore: worstChar?.characterSimilarityScore ?? null,
  };

  // Environment drift
  const withEnvScore = panels.filter((p) => p.environmentScore !== null && p.environmentScore !== undefined);
  const envInconsistentPanels = withEnvScore.filter((p) => p.environmentScore! < ENVIRONMENT_INCONSISTENCY_THRESHOLD);

  const environmentDrift: EnvironmentDriftMetrics = {
    panelsWithInconsistency: envInconsistentPanels.length,
    inconsistencyRate: withEnvScore.length > 0 ? envInconsistentPanels.length / withEnvScore.length : 0,
    averageEnvironmentScore:
      withEnvScore.length > 0
        ? withEnvScore.reduce((sum, p) => sum + (p.environmentScore ?? 0), 0) / withEnvScore.length
        : 1,
  };

  // Hero contamination
  const nonHeroPanels = panels.filter(
    (p) => !["hero", "duo"].includes(p.dominantSubject) && p.heroShouldBeVisible === false,
  );
  const contaminatedPanels = nonHeroPanels.filter((p) => p.heroWasVisible === true);
  const affectedTypes = [...new Set(contaminatedPanels.map((p) => p.panelType))];

  const heroContamination: HeroContaminationMetrics = {
    contaminatedPanels: contaminatedPanels.length,
    contaminationRate: nonHeroPanels.length > 0 ? contaminatedPanels.length / nonHeroPanels.length : 0,
    affectedPanelTypes: affectedTypes,
  };

  // Balance-based contamination check
  const withBalanceScore = panels.filter((p) => p.balanceScore?.observedScore !== null);
  const balanceContaminated = withBalanceScore.filter((p) => {
    if (!p.balanceScore) return false;
    const { targetScore, observedScore } = p.balanceScore;
    if (observedScore === null) return false;
    // If hero is much more visible than target in non-hero panels
    return !["hero", "duo"].includes(p.dominantSubject) && observedScore - targetScore > 25;
  });

  // Add balance-based contamination to total
  const totalContaminated = new Set([
    ...contaminatedPanels.map((p) => p.panelId),
    ...balanceContaminated.map((p) => p.panelId),
  ]).size;

  const updatedHeroContamination: HeroContaminationMetrics = {
    contaminatedPanels: totalContaminated,
    contaminationRate:
      nonHeroPanels.length > 0 ? totalContaminated / nonHeroPanels.length : heroContamination.contaminationRate,
    affectedPanelTypes: [
      ...new Set([...affectedTypes, ...balanceContaminated.map((p) => p.panelType)]),
    ],
  };

  // Overall coherence score (weighted average)
  const charWeight = 0.4;
  const envWeight = 0.3;
  const contamWeight = 0.3;

  const overallCoherence =
    (1 - characterDrift.driftRate) * charWeight +
    (1 - environmentDrift.inconsistencyRate) * envWeight +
    (1 - updatedHeroContamination.contaminationRate) * contamWeight;

  return {
    chapterId,
    totalPanels: panels.length,
    analyzedPanels: analyzed.length,
    characterDrift,
    environmentDrift: environmentDrift,
    heroContamination: updatedHeroContamination,
    overallCoherence,
    timestamp: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────────────────

export function formatDriftMetrics(metrics: DriftMetrics): string {
  return [
    `[drift-metrics] chapter=${metrics.chapterId}`,
    `  panels: total=${metrics.totalPanels} analyzed=${metrics.analyzedPanels}`,
    `  character: drift_rate=${(metrics.characterDrift.driftRate * 100).toFixed(1)}% avg_sim=${metrics.characterDrift.averageSimilarityScore.toFixed(2)}`,
    `  environment: inconsistency=${(metrics.environmentDrift.inconsistencyRate * 100).toFixed(1)}% avg=${metrics.environmentDrift.averageEnvironmentScore.toFixed(2)}`,
    `  hero_contamination: rate=${(metrics.heroContamination.contaminationRate * 100).toFixed(1)}% affected=${metrics.heroContamination.contaminatedPanels}`,
    `  coherence: ${(metrics.overallCoherence * 100).toFixed(1)}%`,
  ].join("\n");
}

export function isDriftAcceptable(metrics: DriftMetrics): boolean {
  return (
    metrics.characterDrift.driftRate < 0.15 &&
    metrics.environmentDrift.inconsistencyRate < 0.2 &&
    metrics.heroContamination.contaminationRate < 0.1 &&
    metrics.overallCoherence > 0.8
  );
}

export function getDriftAlerts(metrics: DriftMetrics): string[] {
  const alerts: string[] = [];

  if (metrics.characterDrift.driftRate > 0.2) {
    alerts.push(`HIGH_CHARACTER_DRIFT: ${(metrics.characterDrift.driftRate * 100).toFixed(1)}% panels drifted`);
  }

  if (metrics.environmentDrift.inconsistencyRate > 0.25) {
    alerts.push(
      `HIGH_ENVIRONMENT_INCONSISTENCY: ${(metrics.environmentDrift.inconsistencyRate * 100).toFixed(1)}% panels inconsistent`,
    );
  }

  if (metrics.heroContamination.contaminationRate > 0.15) {
    alerts.push(
      `HIGH_HERO_CONTAMINATION: ${metrics.heroContamination.contaminatedPanels} panels contaminated (types: ${metrics.heroContamination.affectedPanelTypes.join(", ")})`,
    );
  }

  if (metrics.overallCoherence < 0.7) {
    alerts.push(`LOW_OVERALL_COHERENCE: ${(metrics.overallCoherence * 100).toFixed(1)}%`);
  }

  return alerts;
}
