import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types";
import { createMockImageProvider } from "./mock-image-provider";

// flux/dev : qualité premium, $0.025/MP — idéal pour panels manga
const FAL_FLUX_DEV = "https://fal.run/fal-ai/flux/dev";
// flux/dev avec IP-Adapter pour la cohérence visuelle des personnages
const FAL_FLUX_DEV_REDUX = "https://fal.run/fal-ai/flux-pro/v1/redux";

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
    const timeout = setTimeout(() => controller.abort(), 60_000);
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
        if (res.status >= 500 && attempt < retries) continue;
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
        lastError = new Error("fal.run: timeout 45s");
        if (attempt < retries) continue;
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
      const imageSize = isCover ? "landscape_4_3" : "portrait_4_3";

      // Si une image de référence est fournie, utiliser flux-redux (IP-Adapter)
      // pour préserver l'identité visuelle du personnage.
      const referenceUrl =
        input.referenceImageUrls && input.referenceImageUrls.length > 0
          ? input.referenceImageUrls[0]
          : null;

      const useRedux = Boolean(referenceUrl);
      const endpoint = useRedux ? FAL_FLUX_DEV_REDUX : FAL_FLUX_DEV;

      const promptWithNeg = input.negativePrompt
        ? `${input.positivePrompt}. Avoid: ${input.negativePrompt}`
        : input.positivePrompt;

      const body: Record<string, unknown> = useRedux
        ? {
            prompt: promptWithNeg,
            image_url: referenceUrl,
            image_size: imageSize,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            num_images: 1,
            enable_safety_checker: !isMature,
            output_format: "jpeg",
            // Strength contrôle combien l'image de référence influence le résultat
            // 0.75 = forte ressemblance personnage, 0.6 = plus de liberté créative
            strength: 0.72,
          }
        : {
            prompt: promptWithNeg,
            image_size: imageSize,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            num_images: 1,
            enable_safety_checker: !isMature,
            output_format: "jpeg",
          };

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
        model: "fal-ai/flux/dev",
        raw: data,
      };
    },
  };
}
