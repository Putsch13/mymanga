import {
  collectPremiumBlockingReasons,
  type AiStepReadiness,
  type ChapterAiReadiness,
} from "@manga-ai-studio/core";
import type { GenerationStackStatus } from "@/lib/generation/stack-readiness";

function openAiStep(label: string, stack: GenerationStackStatus, premiumOnly: boolean): AiStepReadiness {
  if (stack.hasOpenAI) {
    return {
      status: "real",
      provider: "openai",
      model: process.env.OPENAI_CHAT_MODEL?.trim() || undefined,
    };
  }
  return {
    status: "missing",
    reason: `${label} requiert OPENAI_API_KEY.`,
    premiumBlocking: premiumOnly,
  };
}

function imageProviderStep(stack: GenerationStackStatus, premiumOnly: boolean): AiStepReadiness {
  if (!stack.canGenerateImages) {
    return {
      status: "missing",
      reason: (stack.blockers ?? [])[0] ?? "Aucun provider image utilisable avec la persistance requise.",
      premiumBlocking: premiumOnly,
    };
  }
  const p = stack.preferredImageProvider ?? stack.configuredProviders[0] ?? "image";
  return { status: "real", provider: p };
}

function visualQaStep(stack: GenerationStackStatus, premiumOnly: boolean): AiStepReadiness {
  if (stack.premiumVisualQaPreflight.launchBlocked) {
    const missing =
      stack.premiumVisualQaPreflight.missing.length > 0
        ? stack.premiumVisualQaPreflight.missing.join(", ")
        : "configuration QA vision incomplète";
    return {
      status: "failed",
      reason: `QA vision premium: ${missing}`,
      premiumBlocking: premiumOnly,
    };
  }
  if (!stack.visionPremiumQaEnvReady) {
    return {
      status: "fallback",
      reason:
        "VISUAL_PANEL_QA_VISION / ENABLE_PREMIUM_VISION_QA non activés — QA vision limitée tant que la prod stricte n'est pas exigée.",
      premiumBlocking: premiumOnly,
    };
  }
  return { status: "real", provider: "vision_qa" };
}

function loraBindingsStep(stack: GenerationStackStatus, premiumOnly: boolean): AiStepReadiness {
  if (process.env.NODE_ENV === "production" && stack.allowMockImageProvider) {
    return {
      status: "fallback",
      reason:
        "ALLOW_MOCK_IMAGE_PROVIDER autorise des mocks — incompatible avec un rendu premium fiable en production.",
      premiumBlocking: premiumOnly,
    };
  }
  return { status: "real", provider: "runtime_lora" };
}

export function computePremiumAiReadiness(args: {
  stack: GenerationStackStatus;
  premiumOnly: boolean;
}): { aiReadiness: ChapterAiReadiness; premiumBlockingReasons: string[] } {
  const { stack, premiumOnly } = args;
  const aiReadiness: ChapterAiReadiness = {
    outline: openAiStep("Outline & bundle chapitre", stack, premiumOnly),
    storySpine: openAiStep("Story spine", stack, premiumOnly),
    genreDirector: openAiStep("Genre director", stack, premiumOnly),
    narrativeFacts: openAiStep("Faits narratifs", stack, premiumOnly),
    dialogue: openAiStep("Dialogue / scène", stack, premiumOnly),
    imageProvider: imageProviderStep(stack, premiumOnly),
    visualQa: visualQaStep(stack, premiumOnly),
    loraBindings: loraBindingsStep(stack, premiumOnly),
  };
  const premiumBlockingReasons = premiumOnly ? collectPremiumBlockingReasons(aiReadiness) : [];
  return { aiReadiness, premiumBlockingReasons };
}
