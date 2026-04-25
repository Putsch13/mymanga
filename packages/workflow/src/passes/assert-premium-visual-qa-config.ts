/**
 * Préflight production — évite un faux sentiment de « succès » sans vision / sans provider.
 * Appelé uniquement en premium-only + NODE_ENV=production.
 */
export function assertPremiumVisualQaConfig(): void {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      "premium_visual_qa_config: OPENAI_API_KEY manquante en production premium-only.",
    );
  }
  const fal = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!fal?.trim()) {
    throw new Error(
      "premium_visual_qa_config: FAL_KEY (ou FAL_API_KEY) manquante en production premium-only.",
    );
  }
  const mocks = process.env.ENABLE_IMAGE_MOCKS;
  if (mocks === "true" || mocks === "1") {
    throw new Error(
      "premium_visual_qa_config: ENABLE_IMAGE_MOCKS ne doit pas être activé en production premium-only.",
    );
  }
  if (process.env.VISUAL_PANEL_QA_VISION !== "true") {
    throw new Error(
      "premium_visual_qa_config: VISUAL_PANEL_QA_VISION=true requis en production premium-only.",
    );
  }
  if (process.env.ENABLE_PREMIUM_VISION_QA !== "true") {
    throw new Error(
      "premium_visual_qa_config: ENABLE_PREMIUM_VISION_QA=true requis en production premium-only.",
    );
  }
}
