import { createBflAdapter } from "./adapters/bfl-adapter";
import { createFalFluxAdapter } from "./adapters/fal-flux-adapter";
import { createRunwareAdapter } from "./adapters/runware-adapter";
import { createStabilityAdapter } from "./adapters/stability-adapter";
import { decideImageRoute } from "./image-routing-service";
import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId, RoutingContext } from "./types";

function getProvider(id: ImageProviderId): ImageGenerationProvider {
  const falKey = process.env.FAL_KEY;
  const bflKey = process.env.BFL_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY;
  const stabilityKey = process.env.STABILITY_API_KEY;
  switch (id) {
    case "fal":
      return createFalFluxAdapter(falKey);
    case "bfl":
      return createBflAdapter(bflKey);
    case "runware":
      return createRunwareAdapter(runwareKey);
    case "stability":
      return createStabilityAdapter(stabilityKey);
    default:
      return createFalFluxAdapter(falKey);
  }
}

function hashPrompt(prompt: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(prompt.length, 200); i++) {
    h = (Math.imul(31, h) + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

function isRetryableError(message: string) {
  return /\b(429|500|502|503|504)\b/.test(message)
    || /concurrent_requests_limit/i.test(message)
    || /bad gateway/i.test(message)
    || /internal server error/i.test(message)
    || /timeout/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ImageGenerationLog {
  provider: string;
  model: string;
  workflow?: string;
  promptHash: string;
  responseTimeMs: number;
  success: boolean;
  error?: string;
  moderationDecision?: string;
  imageUrl?: string;
  imageSize?: string;
  referenceImageCount?: number;
}

export async function runRoutedImageGeneration(
  ctx: RoutingContext,
  input: GenerateImageInput,
): Promise<
  | { ok: true; result: GenerateImageResult; routing: Exclude<ReturnType<typeof decideImageRoute>, { blocked: true }>; log: ImageGenerationLog }
  | { ok: false; blocked: true; reason: string; textOnlyFallback?: boolean; log: ImageGenerationLog }
> {
  const rawDecision = decideImageRoute(ctx);
  const promptHash = hashPrompt(input.positivePrompt);

  if ("blocked" in rawDecision) {
    const log: ImageGenerationLog = {
      provider: "blocked",
      model: "none",
      promptHash,
      responseTimeMs: 0,
      success: false,
      error: rawDecision.reason,
      moderationDecision: "BLOCKED",
    };
    console.warn(`[image-gen] BLOCKED promptHash=${promptHash} reason=${rawDecision.reason}`);
    return { ok: false, blocked: true, reason: rawDecision.reason, textOnlyFallback: rawDecision.textOnlyFallback, log };
  }

  // Les workflows LoRA/multi-ref ne sont pleinement supportés que via FAL ici.
  const needsFal =
    Array.isArray(input.loras) && input.loras.length > 0 ||
    Array.isArray(input.referenceImageUrls) && input.referenceImageUrls.length > 0;
  const decision = needsFal && rawDecision.provider !== "fal"
    ? {
        ...rawDecision,
        provider: "fal" as const,
        model: rawDecision.model || "flux-pro/v1.1",
        reason: `${rawDecision.reason} | forced_fal_for_lora_or_refs`,
      }
    : rawDecision;

  const provider = getProvider(decision.provider);
  const maxAttempts = decision.provider === "fal" ? 3 : 2;
  let lastError: unknown;
  let lastLog: ImageGenerationLog | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startMs = Date.now();
    try {
      const result = await provider.generateImage({
        ...input,
        providerParams: {
          ...input.providerParams,
          model: decision.model,
          seed:
            typeof input.providerParams?.seed === "number"
              ? input.providerParams.seed + (attempt - 1)
              : input.providerParams?.seed,
        },
      });

      const responseTimeMs = Date.now() - startMs;
      const log: ImageGenerationLog = {
        provider: decision.provider,
        model: decision.model ?? "unknown",
        workflow: decision.workflow,
        promptHash,
        responseTimeMs,
        success: true,
        imageUrl: result.imageUrl,
        moderationDecision: ctx.contentIntensityLayer ?? "GENERAL_SAFE",
        imageSize:
          typeof input.width === "number" && typeof input.height === "number"
            ? `${input.width}x${input.height}`
            : undefined,
        referenceImageCount: input.referenceImageUrls?.length ?? 0,
      };

      console.log(
        `[image-gen] OK provider=${decision.provider} model=${decision.model} hash=${promptHash} ms=${responseTimeMs} attempt=${attempt} url=${result.imageUrl?.slice(0, 60)}...`
      );

      return { ok: true, result, routing: decision, log };
    } catch (err) {
      const responseTimeMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastError = err;
      lastLog = {
        provider: decision.provider,
        model: decision.model ?? "unknown",
        workflow: decision.workflow,
        promptHash,
        responseTimeMs,
        success: false,
        error: errorMsg,
        imageSize:
          typeof input.width === "number" && typeof input.height === "number"
            ? `${input.width}x${input.height}`
            : undefined,
        referenceImageCount: input.referenceImageUrls?.length ?? 0,
      };

      console.error(
        `[image-gen] FAILED provider=${decision.provider} hash=${promptHash} ms=${responseTimeMs} attempt=${attempt} error=${errorMsg}`
      );

      if (attempt >= maxAttempts || !isRetryableError(errorMsg)) break;
      await sleep(decision.provider === "fal" ? 1200 * attempt : 800 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(lastLog?.error ?? "image_generation_failed");
}
