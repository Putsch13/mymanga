/**
 * Préflight production — évite un faux sentiment de « succès » sans vision / sans provider.
 * Appelé uniquement en premium-only + NODE_ENV=production (sauf contournement explicite).
 */

export type PremiumVisualQaConfigMissingKey =
  | "OPENAI_API_KEY"
  | "FAL_KEY"
  | "ENABLE_IMAGE_MOCKS_OFF"
  | "VISUAL_PANEL_QA_VISION"
  | "ENABLE_PREMIUM_VISION_QA";

export interface PremiumVisualQaConfigStatus {
  ok: boolean;
  /** Identifiants stables pour UI / API (pas de texte localisé ici). */
  missing: PremiumVisualQaConfigMissingKey[];
}

/** Par défaut la QA vision production est obligatoire ; `PREMIUM_VISUAL_QA_REQUIRED=false` désactive le blocage dur. */
export function isPremiumVisualQaStrictlyRequired(): boolean {
  return process.env.PREMIUM_VISUAL_QA_REQUIRED !== "false";
}

/**
 * Vérifie la config attendue par la pipeline premium-only en production
 * (aligné sur `assertPremiumVisualQaConfig`).
 */
export function getPremiumVisualQaConfigStatus(): PremiumVisualQaConfigStatus {
  const missing: PremiumVisualQaConfigMissingKey[] = [];

  if (!process.env.OPENAI_API_KEY?.trim()) {
    missing.push("OPENAI_API_KEY");
  }
  const fal = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!fal?.trim()) {
    missing.push("FAL_KEY");
  }
  const mocks = process.env.ENABLE_IMAGE_MOCKS;
  if (mocks === "true" || mocks === "1") {
    missing.push("ENABLE_IMAGE_MOCKS_OFF");
  }
  if (process.env.VISUAL_PANEL_QA_VISION !== "true") {
    missing.push("VISUAL_PANEL_QA_VISION");
  }
  if (process.env.ENABLE_PREMIUM_VISION_QA !== "true") {
    missing.push("ENABLE_PREMIUM_VISION_QA");
  }

  return { ok: missing.length === 0, missing };
}

export function assertPremiumVisualQaConfig(): void {
  const { ok, missing } = getPremiumVisualQaConfigStatus();
  if (ok) return;
  const first = missing[0];
  if (first === "OPENAI_API_KEY") {
    throw new Error("premium_visual_qa_config: OPENAI_API_KEY manquante en production premium-only.");
  }
  if (first === "FAL_KEY") {
    throw new Error("premium_visual_qa_config: FAL_KEY (ou FAL_API_KEY) manquante en production premium-only.");
  }
  if (first === "ENABLE_IMAGE_MOCKS_OFF") {
    throw new Error("premium_visual_qa_config: ENABLE_IMAGE_MOCKS ne doit pas être activé en production premium-only.");
  }
  if (first === "VISUAL_PANEL_QA_VISION") {
    throw new Error("premium_visual_qa_config: VISUAL_PANEL_QA_VISION=true requis en production premium-only.");
  }
  throw new Error("premium_visual_qa_config: ENABLE_PREMIUM_VISION_QA=true requis en production premium-only.");
}

export function isProductionPremiumOnlyPipeline(): boolean {
  return process.env.NODE_ENV === "production" && process.env.PIPELINE_V3_PREMIUM_ONLY === "true";
}
