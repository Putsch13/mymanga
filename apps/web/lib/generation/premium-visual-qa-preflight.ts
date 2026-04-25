import { NextResponse } from "next/server";
import {
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
} from "@manga-ai-studio/workflow";

/**
 * Réponse 400 si la prod premium-only exige la QA vision mais que l’environnement est incomplet.
 * Retourne `null` si le contrôle ne s’applique pas ou si la config est OK.
 */
export function premiumVisualQaPreflightResponse(): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.PIPELINE_V3_PREMIUM_ONLY !== "true") return null;
  if (!isPremiumVisualQaStrictlyRequired()) return null;
  const cfg = getPremiumVisualQaConfigStatus();
  if (cfg.ok) return null;

  return NextResponse.json(
    {
      ok: false,
      code: "PREMIUM_VISUAL_QA_CONFIG_MISSING",
      missing: cfg.missing,
      message:
        "La QA visuelle premium n'est pas configurée sur ce serveur. " +
        "Définir les variables listées dans `missing`, ou définir PREMIUM_VISUAL_QA_REQUIRED=false " +
        "pour autoriser la génération avec qualité needs_review (mode dégradé).",
    },
    { status: 400 },
  );
}
