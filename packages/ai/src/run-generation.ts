import { createBflAdapter } from "./adapters/bfl-adapter";
import { createFalFluxAdapter } from "./adapters/fal-flux-adapter";
import { createRunwareAdapter } from "./adapters/runware-adapter";
import { createStabilityAdapter } from "./adapters/stability-adapter";
import { decideImageRoute } from "./image-routing-service";
import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId, RoutingContext } from "./types";

type RoutedDecision = Exclude<ReturnType<typeof decideImageRoute>, { blocked: true }>;

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

function defaultModelForProvider(id: ImageProviderId) {
  if (id === "fal") return "fal-ai/flux/dev";
  if (id === "runware") return "runware-custom-stack";
  if (id === "stability") return "stable-image-ultra";
  return "flux-dev";
}

function providerSupportsInput(provider: ImageProviderId, decision: RoutedDecision, input: GenerateImageInput) {
  const hasRefs = Array.isArray(input.referenceImageUrls) && input.referenceImageUrls.length > 0;
  const hasLoras = Array.isArray(input.loras) && input.loras.length > 0;
  const needsMask = Boolean(input.maskUrl);
  const workflow = decision.workflow;

  if (provider !== "fal" && (hasRefs || hasLoras || needsMask)) return false;
  if (provider !== "fal" && (workflow === "multi_ref" || workflow === "lora_stack" || workflow === "inpaint" || workflow === "controlnet")) {
    return false;
  }
  return true;
}

function buildProviderPlan(decision: RoutedDecision, input: GenerateImageInput): ImageProviderId[] {
  const preferredOrder: Record<ImageProviderId, ImageProviderId[]> = {
    fal: ["fal", "runware", "stability", "bfl"],
    runware: ["runware", "fal", "stability", "bfl"],
    stability: ["stability", "fal", "runware", "bfl"],
    bfl: ["bfl", "fal", "runware", "stability"],
  };
  return preferredOrder[decision.provider].filter((provider, index, all) =>
    all.indexOf(provider) === index && providerSupportsInput(provider, decision, input),
  );
}

function buildDecisionForProvider(base: RoutedDecision, provider: ImageProviderId, failoverReason?: string): RoutedDecision {
  return {
    ...base,
    provider,
    model: provider === base.provider ? base.model : defaultModelForProvider(provider),
    workflow: provider === "fal" ? base.workflow : "txt2img",
    reason:
      provider === base.provider
        ? base.reason
        : `${base.reason} | failover_from=${base.provider}${failoverReason ? ` | ${failoverReason}` : ""}`,
  };
}

export interface ImageGenerationLog {
  provider: string;
  initialProvider?: string;
  fallbackProvider?: string;
  failoverReason?: string;
  model: string;
  workflow?: string;
  requestId?: string;
  jobId?: string;
  promptHash: string;
  responseTimeMs: number;
  success: boolean;
  error?: string;
  retryCount?: number;
  providerAttempts?: Array<{
    provider: string;
    attempt: number;
    phase: "initial" | "retry" | "failover";
    success: boolean;
    error?: string;
  }>;
  moderationDecision?: string;
  imageUrl?: string;
  sceneComplexityScore?: number;
  referencePolicy?: string;
  panelCategory?: string;
  imageSize?: string;
}

type RunGenerationOptions = {
  providerFactory?: (id: ImageProviderId) => ImageGenerationProvider;
  routeDecision?: ReturnType<typeof decideImageRoute>;
  sleepFn?: (ms: number) => Promise<void>;
};

export async function runRoutedImageGeneration(
  ctx: RoutingContext,
  input: GenerateImageInput,
  options?: RunGenerationOptions,
): Promise<
  | { ok: true; result: GenerateImageResult; routing: Exclude<ReturnType<typeof decideImageRoute>, { blocked: true }>; log: ImageGenerationLog }
  | { ok: false; blocked: true; reason: string; textOnlyFallback?: boolean; log: ImageGenerationLog }
> {
  const rawDecision = options?.routeDecision ?? decideImageRoute(ctx);
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

  const providerFactory = options?.providerFactory ?? getProvider;
  const sleepFn = options?.sleepFn ?? sleep;
  const providerPlan = buildProviderPlan(decision, input);
  if (providerPlan.length === 0) {
    throw new Error(`No compatible image provider for workflow=${decision.workflow} provider=${decision.provider}`);
  }
  const providerAttempts: NonNullable<ImageGenerationLog["providerAttempts"]> = [];
  let localRetryCount = 0;
  let lastError: unknown;
  let lastLog: ImageGenerationLog | null = null;
  let fallbackProvider: ImageProviderId | undefined;
  let failoverReason: string | undefined;

  for (let providerIndex = 0; providerIndex < providerPlan.length; providerIndex++) {
    const providerId = providerPlan[providerIndex]!;
    const activeDecision = buildDecisionForProvider(decision, providerId, failoverReason);
    const provider = providerFactory(providerId);
    const maxAttempts = providerId === "fal" ? 3 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startMs = Date.now();
      const phase =
        providerIndex === 0
          ? (attempt === 1 ? "initial" : "retry")
          : "failover";
      try {
        const result = await provider.generateImage({
          ...input,
          providerParams: {
            ...input.providerParams,
            model: activeDecision.model,
            seed:
              typeof input.providerParams?.seed === "number"
                ? input.providerParams.seed + (attempt - 1)
                : input.providerParams?.seed,
          },
        });

        const responseTimeMs = Date.now() - startMs;
        providerAttempts.push({ provider: providerId, attempt, phase, success: true });
        const log: ImageGenerationLog = {
          provider: providerId,
          initialProvider: decision.provider,
          fallbackProvider,
          failoverReason,
          model: activeDecision.model ?? "unknown",
          workflow: activeDecision.workflow,
          promptHash,
          responseTimeMs,
          success: true,
          imageUrl: result.imageUrl,
          requestId: result.requestId,
          jobId: result.jobId,
          moderationDecision: ctx.contentIntensityLayer ?? "GENERAL_SAFE",
          sceneComplexityScore: activeDecision.sceneComplexityScore,
          referencePolicy: activeDecision.referencePolicy,
          panelCategory: activeDecision.panelCategory,
          retryCount: localRetryCount,
          providerAttempts,
          imageSize:
            typeof input.width === "number" && typeof input.height === "number"
              ? `${input.width}x${input.height}`
              : undefined,
        };

        console.log(
          `[image-gen] OK provider=${providerId} model=${activeDecision.model} hash=${promptHash} requestId=${result.requestId ?? "n/a"} jobId=${result.jobId ?? "n/a"} ms=${responseTimeMs} attempt=${attempt}${fallbackProvider ? ` fallback=${fallbackProvider}` : ""} url=${result.imageUrl?.slice(0, 60)}...`
        );

        return { ok: true, result, routing: activeDecision, log };
      } catch (err) {
        const responseTimeMs = Date.now() - startMs;
        const errorMsg = err instanceof Error ? err.message : String(err);
        const retryable = isRetryableError(errorMsg);
        lastError = err;
        providerAttempts.push({ provider: providerId, attempt, phase, success: false, error: errorMsg });
        lastLog = {
          provider: providerId,
          initialProvider: decision.provider,
          fallbackProvider,
          failoverReason,
          model: activeDecision.model ?? "unknown",
          workflow: activeDecision.workflow,
          promptHash,
          responseTimeMs,
          success: false,
          error: errorMsg,
          sceneComplexityScore: activeDecision.sceneComplexityScore,
          referencePolicy: activeDecision.referencePolicy,
          panelCategory: activeDecision.panelCategory,
          retryCount: localRetryCount,
          providerAttempts,
          imageSize:
            typeof input.width === "number" && typeof input.height === "number"
              ? `${input.width}x${input.height}`
              : undefined,
        };

        console.error(
          `[image-gen] FAILED provider=${providerId} hash=${promptHash} ms=${responseTimeMs} attempt=${attempt} error=${errorMsg}`
        );

        if (retryable && attempt < maxAttempts) {
          localRetryCount += 1;
          await sleepFn(providerId === "fal" ? 1200 * attempt : 800 * attempt);
          continue;
        }

        const canFailover = providerIndex < providerPlan.length - 1;
        if (canFailover) {
          fallbackProvider = providerPlan[providerIndex + 1];
          failoverReason = retryable
            ? `retry_exhausted_on_${providerId}`
            : `hard_failure_on_${providerId}:${errorMsg.slice(0, 120)}`;
          console.warn(`[image-gen] FAILOVER from=${providerId} to=${fallbackProvider} reason=${failoverReason}`);
        }
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(lastLog?.error ?? "image_generation_failed");
}
