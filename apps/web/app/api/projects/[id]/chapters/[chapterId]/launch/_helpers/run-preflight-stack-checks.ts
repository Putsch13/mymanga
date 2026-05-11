/**
 * P5.2 — Preflight checks de stack pour le launch d'un chapitre premium.
 *
 * Centralise tous les "garde-fous" de configuration server avant qu'on touche à
 * la DB chapitre :
 *   - rate limit (`pipeline`)
 *   - generation stack readiness (`canGenerateChapters`)
 *   - PIPELINE_V3_STORYBOARD activé
 *   - premium visual QA preflight (FAL/Vision)
 *   - V3 premium stack (FAL + storage durable + OpenAI + vision QA)
 *   - premium AI readiness (LLMs / images / QA / bindings)
 *
 * Renvoie soit `{ ok: true, stack, premiumOnly, strictPremiumContinuity }`
 * soit `{ ok: false, response }` (NextResponse à propager).
 */
import { NextResponse } from "next/server";
import {
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
} from "@manga-ai-studio/core";
import { isPipelineV3StoryboardEnabled } from "@manga-ai-studio/workflow";
import { validationError } from "@/lib/api-response";
import {
  getGenerationStackStatus,
  logGenerationStackReadiness,
} from "@/lib/generation/stack-readiness";
import { computePremiumAiReadiness } from "@/lib/compute-premium-ai-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { premiumVisualQaPreflightResponse } from "@/lib/generation/premium-visual-qa-preflight";

type StackStatus = ReturnType<typeof getGenerationStackStatus>;

export type PreflightResult =
  | {
      ok: true;
      stack: StackStatus;
      premiumOnly: boolean;
      strictPremiumContinuity: boolean;
    }
  | { ok: false; response: NextResponse };

export async function runLaunchPreflightStackChecks(args: {
  userId: string;
  projectId: string;
  chapterId: string;
  logBlock: (code: string, reason: string, extra?: Record<string, unknown>) => void;
}): Promise<PreflightResult> {
  // `projectId` reste dans le type args pour les checks futurs par projet
  // (audit/quotas) mais n'est pas lu ici aujourd'hui.
  const { userId, chapterId, logBlock } = args;

  const rl = await checkRateLimit(userId, "pipeline");
  if (!rl.ok) {
    logBlock("RATE_LIMITED", "Too many launch requests", { retryAfterSecs: rl.retryAfterSecs });
    return {
      ok: false,
      response: NextResponse.json(
        { error: rl.message },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
      ),
    };
  }

  const stack = getGenerationStackStatus();
  logGenerationStackReadiness(stack);

  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const strictPremiumContinuity = premiumOnly || isPremiumStrictMode();
  const { aiReadiness, premiumBlockingReasons } = computePremiumAiReadiness({ stack, premiumOnly });

  if (premiumOnly && premiumBlockingReasons.length > 0) {
    logBlock("PREMIUM_AI_READINESS_FAILED", "Premium AI readiness gate", {
      premiumBlockingReasons,
    });
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "premium_ai_readiness_failed",
          code: "PREMIUM_AI_READINESS_FAILED",
          message:
            "Des moteurs IA requis pour le mode premium-only ne sont pas prêts (LLM, images, QA vision ou bindings). "
            + "Corrige la configuration du serveur ou utilise un environnement de développement.",
          aiReadiness,
          premiumBlockingReasons,
        },
        { status: 422 },
      ),
    };
  }

  if (!stack.canGenerateChapters) {
    logBlock("STACK_NOT_READY", "Generation stack not ready for full chapter", {
      blockers: stack.blockers,
    });
    return {
      ok: false,
      response: validationError(
        "La stack de génération n'est pas prête pour un chapitre complet.",
        stack,
      ),
    };
  }

  // HARD GUARD : le launch premium DOIT tourner via la pipeline v3.
  if (!isPipelineV3StoryboardEnabled()) {
    logBlock("V3_PREMIUM_DISABLED", "PIPELINE_V3_STORYBOARD not enabled");
    console.warn(
      `[launch] premium_pipeline_v3_required chapterId=${chapterId} — set PIPELINE_V3_STORYBOARD=true to enable premium rendering`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "premium_pipeline_v3_required",
          code: "PREMIUM_PIPELINE_V3_REQUIRED",
          message:
            "Le lancement premium nécessite la pipeline v3 (PIPELINE_V3_STORYBOARD=true). Le chemin legacy est désactivé pour les chapitres premium.",
        },
        { status: 409 },
      ),
    };
  }

  const visualQaBlocked = premiumVisualQaPreflightResponse();
  if (visualQaBlocked) {
    logBlock("PREMIUM_VISUAL_QA_CONFIG_MISSING", "Premium visual QA preflight failed");
    console.warn(
      `[launch] premium_visual_qa_preflight_failed chapterId=${chapterId} — job non créé (config serveur)`,
    );
    return { ok: false, response: visualQaBlocked };
  }

  // P0.4 — V3 premium nécessite FAL + storage durable.
  if (!stack.canRunV3Premium) {
    const missingComponents: string[] = [];
    if (!stack.hasFal) missingComponents.push("FAL_KEY");
    if (!stack.hasStoragePersistence)
      missingComponents.push("SUPABASE storage (SUPABASE_SERVICE_ROLE_KEY + STORAGE_BUCKET)");
    if (!stack.hasOpenAI) missingComponents.push("OPENAI_API_KEY");
    if (process.env.NODE_ENV === "production" && !stack.visionPremiumQaEnvReady) {
      missingComponents.push("VISUAL_PANEL_QA_VISION=true et ENABLE_PREMIUM_VISION_QA=true");
    }

    logBlock("V3_PREMIUM_STACK_INCOMPLETE", "Missing providers or storage for V3 premium", {
      missingComponents,
    });
    console.warn(
      `[launch] v3_premium_stack_incomplete chapterId=${chapterId} missing=[${missingComponents.join(", ")}]`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "v3_premium_stack_incomplete",
          code: "V3_PREMIUM_STACK_INCOMPLETE",
          message: `Le pipeline V3 premium nécessite: ${missingComponents.join(", ")}`,
          missingComponents,
        },
        { status: 409 },
      ),
    };
  }

  return { ok: true, stack, premiumOnly, strictPremiumContinuity };
}
