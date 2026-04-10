import type { GenerateImageInput, GenerateImageResult } from "../types";
import { optimizePromptForFal } from "../services/prompt-translator";
import { createFalJobClient, type FalJobClientInput } from "../services/fal-job-client";

export const FAL_MODEL_TEXT = "fal-ai/flux/dev";
export const FAL_MODEL_REDUX = "fal-ai/flux/dev/redux";
export const FAL_MODEL_LORA = "fal-ai/flux-lora";

export function buildFalNegativePrompt(raw: string | undefined) {
  if (!raw?.trim()) return "";
  const normalized = optimizePromptForFal(raw, 400)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowed = normalized.filter((item) =>
    /empty background|studio backdrop|studio background|flat grey backdrop|isolated centered portrait|isolated portrait|blurry environment|weak social interaction|missing school architecture|floating character|disconnected characters|no crowd/.test(item),
  );
  const fallback = [
    "empty background",
    "studio backdrop",
    "flat grey backdrop",
    "isolated centered portrait",
    "blurry environment",
  ];
  return [...new Set([...(allowed.length > 0 ? allowed : normalized.slice(0, 8)), ...fallback])].join(", ");
}

export function describeReferencePolicy(value: unknown) {
  return value === "NONE" || value === "LIGHT" || value === "STRONG" ? value : "LIGHT";
}

export function normalizeRequestedFalModel(
  requested: string | null | undefined,
  flags: { useLora: boolean; useRedux: boolean },
) {
  if (flags.useLora) return { model: FAL_MODEL_LORA };
  if (flags.useRedux) return { model: FAL_MODEL_REDUX };
  if (requested === "flux-pro/v1.1") {
    return { model: FAL_MODEL_TEXT };
  }
  return { model: FAL_MODEL_TEXT };
}

export function buildFalGenerationRequest(input: GenerateImageInput) {
  const isMature =
    input.providerParams?.contentIntensityLayer === "MATURE_VISUAL" ||
    input.providerParams?.contentIntensityLayer === "ADULT_EXPLICIT";
  const isCover =
    String(input.providerParams?.mode ?? "").includes("COVER") ||
    String(input.providerParams?.mode ?? "").includes("LOCATION");
  const imageSize =
    typeof input.width === "number" && typeof input.height === "number"
      ? { width: input.width, height: input.height }
      : (isCover ? "landscape_4_3" : "portrait_4_3");
  const referencePolicy = describeReferencePolicy(input.providerParams?.referencePolicy);
  const panelCategory = typeof input.providerParams?.panelCategory === "string" ? input.providerParams.panelCategory : "CHARACTER_IN_SCENE";
  const scenePass = typeof input.providerParams?.scenePass === "string" ? input.providerParams.scenePass : "single_pass";
  const translatedPositive = optimizePromptForFal(input.positivePrompt);
  const translatedNegative = buildFalNegativePrompt(input.negativePrompt);
  const activeLoras = input.loras?.filter((l) => l.url) ?? [];
  const loraPromptPrefix = activeLoras.map((l) => l.triggerWord).filter(Boolean).join(", ");
  const promptWithLoras = loraPromptPrefix ? `${loraPromptPrefix}, ${translatedPositive}` : translatedPositive;
  const promptWithNeg = translatedNegative
    ? `${promptWithLoras}. Negative constraints: ${translatedNegative}`
    : promptWithLoras;
  const effectiveReferenceUrls = referencePolicy === "NONE" ? [] : (input.referenceImageUrls ?? []);
  const referenceUrl = effectiveReferenceUrls.length > 0 ? effectiveReferenceUrls[0] : null;
  const effectiveLoras =
    referencePolicy === "NONE"
      ? []
      : activeLoras.map((lora) => ({
          ...lora,
          scale: referencePolicy === "LIGHT" ? Math.min(0.55, lora.scale ?? 0.85) : lora.scale ?? 0.85,
        }));
  const useLora = effectiveLoras.length > 0;
  const useRedux = !useLora && Boolean(referenceUrl) && referencePolicy === "STRONG" && panelCategory === "CHARACTER_LOCK";
  const useLoraWithRef = useLora && Boolean(referenceUrl);
  const target = normalizeRequestedFalModel(
    typeof input.providerParams?.model === "string" ? input.providerParams.model : null,
    { useLora, useRedux },
  );

  let payload: Record<string, unknown>;
  if (useLora) {
    payload = {
      prompt: promptWithNeg,
      image_size: imageSize,
      num_inference_steps: 28,
      guidance_scale: 3.9,
      num_images: 1,
      enable_safety_checker: !isMature,
      output_format: "jpeg",
      loras: effectiveLoras.map((l) => ({
        path: l.url,
        scale: l.scale ?? 0.85,
      })),
    };
    if (useLoraWithRef && referenceUrl) {
      payload.image_url = referenceUrl;
      payload.strength = referencePolicy === "LIGHT" ? 0.28 : 0.55;
    }
  } else if (useRedux) {
    payload = {
      prompt: promptWithNeg,
      image_url: referenceUrl,
      image_size: imageSize,
      num_inference_steps: 28,
      guidance_scale: 3.9,
      num_images: 1,
      enable_safety_checker: !isMature,
      output_format: "jpeg",
      strength: 0.7,
    };
  } else {
    payload = {
      prompt: promptWithNeg,
      image_size: imageSize,
      num_inference_steps: 28,
      guidance_scale: 3.9,
      num_images: 1,
      enable_safety_checker: !isMature,
      output_format: "jpeg",
    };
  }

  if (typeof input.providerParams?.seed === "number") {
    payload.seed = input.providerParams.seed;
  }

  return {
    target,
    payload,
    referencePolicy,
    panelCategory,
    scenePass,
    imageSize,
    effectiveReferenceUrls,
    translatedPositive,
    translatedNegative,
    mode: (useLoraWithRef || useRedux || Boolean(referenceUrl)) ? "img2img" : "text2img",
  } as const;
}

export async function runFalGenerationJob(apiKey: string | undefined, input: GenerateImageInput, strategy: "subscribe" | "submitAndPoll") {
  const client = createFalJobClient(apiKey);
  const request = buildFalGenerationRequest(input);
  console.log(
    `[fal] ${JSON.stringify({
      strategy,
      model: request.target.model,
      imageSize: typeof request.imageSize === "string" ? request.imageSize : `${request.imageSize.width}x${request.imageSize.height}`,
      referencePolicy: request.referencePolicy,
      panelCategory: request.panelCategory,
      scenePass: request.scenePass,
      refs: request.effectiveReferenceUrls,
      positivePrompt: input.positivePrompt,
      optimizedPrompt: request.translatedPositive,
      negativePrompt: request.translatedNegative,
    })}`,
  );

  const jobInput: FalJobClientInput = {
    model: request.target.model,
    mode: request.mode,
    input: request.payload,
    timeoutMs: typeof input.providerParams?.timeoutMs === "number" ? input.providerParams.timeoutMs : 180_000,
    pollIntervalMs: typeof input.providerParams?.pollIntervalMs === "number" ? input.providerParams.pollIntervalMs : 2_000,
    networkRetries: typeof input.providerParams?.networkRetries === "number" ? input.providerParams.networkRetries : 2,
    logs: true,
  };
  const result = strategy === "subscribe"
    ? await client.subscribe(jobInput)
    : await client.submitAndPoll(jobInput);
  if (!result.ok) {
    throw new Error(result.error ?? "fal_job_failed");
  }
  const imageUrl = result.outputUrls[0];
  if (!imageUrl) {
    throw new Error("fal.run: pas d'URL image dans la réponse");
  }
  const response: GenerateImageResult = {
    imageUrl,
    provider: "fal",
    model: result.model,
    requestId: result.requestId,
    jobId: result.jobId,
    timings: result.timings as unknown as Record<string, unknown>,
    raw: result.raw,
  };
  return response;
}
