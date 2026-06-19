/**
 * B1-2 — Politique de retry automatique par criticité de panel.
 * Centralise la logique de retry pour éviter la duplication dans le pipeline.
 */

export type PanelCriticalityLevel = "critical" | "high" | "medium" | "low";

export interface RetryPolicy {
  shouldRetry: boolean;
  maxRetries: number;
  retryMode: "robust" | "standard" | "none";
  reason: string;
}

/**
 * Détermine si un panel doit être retenté automatiquement après un échec,
 * et avec quelle politique, en fonction de sa criticité.
 */
export function shouldAutoRetry(
  criticality: PanelCriticalityLevel | string | null | undefined,
  attempt: number,
): boolean {
  const policy = getRetryPolicy(criticality);
  return policy.shouldRetry && attempt < policy.maxRetries;
}

export function getRetryPolicy(
  criticality: PanelCriticalityLevel | string | null | undefined,
): RetryPolicy {
  switch (criticality) {
    case "critical":
      return {
        shouldRetry: true,
        maxRetries: 3,
        retryMode: "robust",
        reason: "Panel critique — retry robuste automatique",
      };
    case "high":
      return {
        shouldRetry: true,
        maxRetries: 2,
        retryMode: "robust",
        reason: "Panel haute priorité — retry robuste",
      };
    case "medium":
      return {
        shouldRetry: true,
        maxRetries: 1,
        retryMode: "standard",
        reason: "Panel standard — 1 retry",
      };
    case "low":
    default:
      return {
        shouldRetry: false,
        maxRetries: 0,
        retryMode: "none",
        reason: "Panel basse priorité — pas de retry automatique",
      };
  }
}

/**
 * Retourne le nombre maximum de rerolls qualité selon la criticité.
 * Utilisé pour remplacer le `MAX_REROLL` hardcodé dans le pipeline.
 */
export function getMaxRerolls(
  criticality: PanelCriticalityLevel | string | null | undefined,
  retryPolicy: "robust" | "standard" | string | null | undefined,
): number {
  // La retryPolicy de la strategy FAL prend la priorité
  if (retryPolicy === "robust") return 3;
  // Sinon, basé sur la criticité
  switch (criticality) {
    case "critical": return 3;
    case "high": return 2;
    case "medium": return 2;
    case "low": return 1;
    default: return 2;
  }
}
