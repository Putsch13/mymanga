import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types";
import { createMockImageProvider } from "./mock-image-provider";
import { optimizePromptForFal } from "../services/prompt-translator";

// flux/dev : qualité premium, $0.025/MP — idéal pour panels manga
const FAL_FLUX_DEV = "https://fal.run/fal-ai/flux/dev";
// flux/dev avec IP-Adapter pour la cohérence visuelle des personnages
const FAL_FLUX_DEV_REDUX = "https://fal.run/fal-ai/flux/dev/redux";
// flux-lora : flux/dev + injection de LoRA personnalisé (personnage entraîné)
const FAL_FLUX_LORA = "https://fal.run/fal-ai/flux-lora";

type FalImageResponse = {
  images?: Array<{ url: string; content_type?: string }>;
  image?: { url: string };
};

function buildFalNegativePrompt(raw: string | undefined) {
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

function describeReferencePolicy(value: unknown) {
  return value === "NONE" || value === "LIGHT" || value === "STRONG" ? value : "LIGHT";
}

function normalizeRequestedFalModel(
  requested: string | null | undefined,
  flags: { useLora: boolean; useRedux: boolean },
) {
  if (flags.useLora) return { model: "fal-ai/flux-lora", endpoint: FAL_FLUX_LORA };
  if (flags.useRedux) return { model: "fal-ai/flux/dev/redux", endpoint: FAL_FLUX_DEV_REDUX };
  if (requested === "flux-pro/v1.1") {
    return { model: "fal-ai/flux/dev", endpoint: FAL_FLUX_DEV };
  }
  return { model: "fal-ai/flux/dev", endpoint: FAL_FLUX_DEV };
}

function extractUrl(data: FalImageResponse): string | undefined {
  return data.images?.[0]?.url ?? data.image?.url;
}

async function callFal(
  apiKey: string,
  body: Record<string, unknown>,
  endpoint = FAL_FLUX_DEV,
  retries = 2,
): Promise<FalImageResponse> {
  let lastError: Error = new Error("fal.run: échec inconnu");
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      if (!res.ok) {
        lastError = new Error(`fal.run error ${res.status}: ${text.slice(0, 500)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          // 429 = trop de concurrence côté FAL.
          // On temporise franchement avant de relancer pour laisser la file se vider.
          const delayMs = res.status === 429
            ? 10_000 * (attempt + 1)
            : 1_500 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw lastError;
      }
      try {
        return JSON.parse(text) as FalImageResponse;
      } catch {
        throw new Error("fal.run: réponse JSON invalide");
      }
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === "AbortError") {
        lastError = new Error("fal.run: timeout 120s");
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError;
}

/**
 * FLUX.1 [dev] via fal.run — qualité premium pour panels manga.
 * enable_safety_checker est désactivé : la modération est gérée côté app
 * par la matrice provider-capabilities avant l'appel.
 */
export function createFalFluxAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) {
    return createMockImageProvider("fal");
  }

  return {
    id: "fal",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const isMature =
        input.providerParams?.contentIntensityLayer === "MATURE_VISUAL" ||
        input.providerParams?.contentIntensityLayer === "ADULT_EXPLICIT";

      // L'API FAL actuelle attend des tailles prédéfinies comme portrait_4_3.
      // On garde un format vertical pour les panels/personnages et paysage pour les covers/décors.
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

      // Traduire FR→EN et dédupliquer avant envoi à FAL
      const translatedPositive = optimizePromptForFal(input.positivePrompt);
      const translatedNegative = buildFalNegativePrompt(input.negativePrompt);

      // Injecter les trigger words des LoRAs dans le prompt
      const activeLoras = input.loras?.filter((l) => l.url) ?? [];
      const loraPromptPrefix = activeLoras.map((l) => l.triggerWord).filter(Boolean).join(", ");
      const promptWithLoras = loraPromptPrefix
        ? `${loraPromptPrefix}, ${translatedPositive}`
        : translatedPositive;

      const promptWithNeg = translatedNegative
        ? `${promptWithLoras}. Negative constraints: ${translatedNegative}`
        : promptWithLoras;

      // Priorité : LoRA > IP-Adapter (redux) > txt2img standard
      const effectiveReferenceUrls =
        referencePolicy === "NONE"
          ? []
          : (input.referenceImageUrls ?? []);
      const referenceUrl =
        effectiveReferenceUrls.length > 0
          ? effectiveReferenceUrls[0]
          : null;

      const effectiveLoras =
        referencePolicy === "NONE"
          ? []
          : activeLoras.map((lora) => ({
              ...lora,
              scale:
                referencePolicy === "LIGHT"
                  ? Math.min(0.55, lora.scale ?? 0.85)
                  : lora.scale ?? 0.85,
            }));
      const useLora = effectiveLoras.length > 0;
      const useRedux = !useLora && Boolean(referenceUrl) && referencePolicy === "STRONG" && panelCategory === "CHARACTER_LOCK";
      const useLoraWithRef = useLora && Boolean(referenceUrl);
      const falTarget = normalizeRequestedFalModel(
        typeof input.providerParams?.model === "string" ? input.providerParams.model : null,
        { useLora, useRedux },
      );
      const endpoint = falTarget.endpoint;

      let body: Record<string, unknown>;

      if (useLora) {
        body = {
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
          body.image_url = referenceUrl;
          body.strength = referencePolicy === "LIGHT" ? 0.28 : 0.55;
        }
      } else if (useRedux) {
        // flux-redux : IP-Adapter avec image de référence
        body = {
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
        // flux/dev standard
        body = {
          prompt: promptWithNeg,
          image_size: imageSize,
          num_inference_steps: 28,
          guidance_scale: 3.9,
          num_images: 1,
          enable_safety_checker: !isMature,
          output_format: "jpeg",
        };
      }

      if (input.providerParams?.seed && typeof input.providerParams.seed === "number") {
        body.seed = input.providerParams.seed;
      }

      console.log(
        `[fal] ${JSON.stringify({
          workflow: useLora ? "lora_stack" : useRedux ? "redux" : "txt2img",
          model: falTarget.model,
          imageSize: typeof imageSize === "string" ? imageSize : `${imageSize.width}x${imageSize.height}`,
          referencePolicy,
          panelCategory,
          scenePass,
          refs: effectiveReferenceUrls,
          guidanceScale: body.guidance_scale,
          seed: body.seed ?? null,
          strength: body.strength ?? null,
          positivePrompt: input.positivePrompt,
          optimizedPrompt: translatedPositive,
          negativePrompt: translatedNegative,
        })}`,
      );

      const data = await callFal(apiKey, body, endpoint);
      const imageUrl = extractUrl(data);
      if (!imageUrl) {
        throw new Error("fal.run: pas d'URL image dans la réponse");
      }

      return {
        imageUrl,
        provider: "fal",
        model: falTarget.model,
        raw: data,
      };
    },
  };
}
