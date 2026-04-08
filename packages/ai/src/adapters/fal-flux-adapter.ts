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

      // Traduire FR→EN et dédupliquer avant envoi à FAL
      const translatedPositive = optimizePromptForFal(input.positivePrompt);

      // Injecter les trigger words des LoRAs dans le prompt
      const activeLoras = input.loras?.filter((l) => l.url) ?? [];
      const loraPromptPrefix = activeLoras.map((l) => l.triggerWord).filter(Boolean).join(", ");
      const promptWithLoras = loraPromptPrefix
        ? `${loraPromptPrefix}, ${translatedPositive}`
        : translatedPositive;

      const promptWithNeg = input.negativePrompt
        ? `${promptWithLoras}. Avoid: ${optimizePromptForFal(input.negativePrompt, 500)}`
        : promptWithLoras;

      // Priorité : LoRA > IP-Adapter (redux) > txt2img standard
      const referenceUrl =
        input.referenceImageUrls && input.referenceImageUrls.length > 0
          ? input.referenceImageUrls[0]
          : null;

      const useLora = activeLoras.length > 0;
      const useRedux = !useLora && Boolean(referenceUrl);
      const useLoraWithRef = useLora && Boolean(referenceUrl);
      const endpoint = useLora ? FAL_FLUX_LORA : useRedux ? FAL_FLUX_DEV_REDUX : FAL_FLUX_DEV;

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
          loras: activeLoras.map((l) => ({
            path: l.url,
            scale: l.scale ?? 0.85,
          })),
        };
        if (useLoraWithRef && referenceUrl) {
          body.image_url = referenceUrl;
          body.strength = 0.55;
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
          strength: 0.72,
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

      const data = await callFal(apiKey, body, endpoint);
      const imageUrl = extractUrl(data);
      if (!imageUrl) {
        throw new Error("fal.run: pas d'URL image dans la réponse");
      }

      return {
        imageUrl,
        provider: "fal",
        model: useLora ? "fal-ai/flux-lora" : useRedux ? "fal-ai/flux/dev/redux" : "fal-ai/flux/dev",
        raw: data,
      };
    },
  };
}
