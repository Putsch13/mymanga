import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types";
import { createMockImageProvider } from "./mock-image-provider";

const FAL_FLUX_SCHNELL = "https://fal.run/fal-ai/flux/schnell";

type FalImageResponse = {
  images?: Array<{ url: string }>;
  image?: { url: string };
};

function extractUrl(data: FalImageResponse): string | undefined {
  return data.images?.[0]?.url ?? data.image?.url;
}

/**
 * FLUX via fal.run — `flux/schnell` (rapide). Pour la prod premium, basculer vers `flux-pro` / endpoints multi-ref.
 */
export function createFalFluxAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) {
    return createMockImageProvider("fal");
  }
  return {
    id: "fal",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const res = await fetch(FAL_FLUX_SCHNELL, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.positivePrompt,
          image_size: "landscape_4_3",
          num_images: 1,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`fal.run error ${res.status}: ${text.slice(0, 500)}`);
      }
      let data: FalImageResponse;
      try {
        data = JSON.parse(text) as FalImageResponse;
      } catch {
        throw new Error("fal.run: réponse JSON invalide");
      }
      const imageUrl = extractUrl(data);
      if (!imageUrl) {
        throw new Error("fal.run: pas d'URL image dans la réponse");
      }
      return {
        imageUrl,
        provider: "fal",
        model: "fal-ai/flux/schnell",
        raw: data,
      };
    },
  };
}
