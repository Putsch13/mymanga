/**
 * P1.1 / P1.2 — Réexport des types readiness depuis le core (source unique).
 */

export type {
  PremiumAiExecutionMode,
  AiStepReadiness,
  ChapterAiReadiness,
} from "@manga-ai-studio/core";

export { collectPremiumBlockingReasons } from "@manga-ai-studio/core";
