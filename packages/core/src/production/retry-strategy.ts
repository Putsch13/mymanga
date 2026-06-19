import { PRODUCTION_RULES } from "./production-rules";

/** Liste officielle des stratégies de retry image (alignée sur `PRODUCTION_RULES.retry.retryStrategies`). */
export const PANEL_RETRY_STRATEGIES = [...PRODUCTION_RULES.retry.retryStrategies] as const;

export type PanelRetryStrategy = (typeof PANEL_RETRY_STRATEGIES)[number];

const LEGACY_ALIASES: Record<string, PanelRetryStrategy> = {
  simpler_scene: "simplify_scene",
  force_subject_focus: "composition_fix",
  subject_focus: "refined_prompt",
};

/** Normalise une stratégie persistée / LLM vers la liste officielle. */
export function normalizePanelRetryStrategy(raw: string | null | undefined): PanelRetryStrategy {
  if (!raw || typeof raw !== "string") return "same_prompt";
  if ((PANEL_RETRY_STRATEGIES as readonly string[]).includes(raw)) {
    return raw as PanelRetryStrategy;
  }
  return LEGACY_ALIASES[raw] ?? "refined_prompt";
}

export function isOfficialPanelRetryStrategy(s: string): s is PanelRetryStrategy {
  return (PANEL_RETRY_STRATEGIES as readonly string[]).includes(s);
}
