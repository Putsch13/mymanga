import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createStabilityAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("stability");
  return {
    id: "stability",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const engineId = process.env.STABILITY_ENGINE_ID ?? "stable-diffusion-xl-1024-v1-0";
      const host = process.env.STABILITY_API_HOST ?? "https://api.stability.ai";
      const url = `${host}/v1/generation/${engineId}/text-to-image`;

      const body = {
        cfg_scale: 7,
        height: input.height ?? 1024,
        width: input.width ?? 1024,
        samples: 1,
        steps: 30,
        text_prompts: [
          { text: input.positivePrompt, weight: 1 },
          ...(input.negativePrompt ? [{ text: input.negativePrompt, weight: -1 }] : []),
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { artifacts?: Array<{ base64?: string; finishReason?: string }> }
        | { message?: string; name?: string };

      if (!res.ok) {
        const msg =
          (json as { message?: string })?.message ??
          (json as { name?: string })?.name ??
          `stability error ${res.status}`;
        throw new Error(msg);
      }

      const b64 = (json as { artifacts?: Array<{ base64?: string }> })?.artifacts?.[0]?.base64;
      if (!b64) {
        throw new Error("StabilityAdapter: réponse sans base64");
      }

      // Important: on retournera une data URL; le workflow devra idéalement la stocker dans un bucket.
      const dataUrl = `data:image/png;base64,${b64}`;
      return {
        imageUrl: dataUrl,
        provider: "stability",
        model: engineId,
        raw: { engineId },
      };
    },
  };
}
