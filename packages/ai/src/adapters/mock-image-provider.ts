import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId } from "../types.js";

export function createMockImageProvider(id: ImageProviderId): ImageGenerationProvider {
  return {
    id,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const seed = Buffer.from(JSON.stringify({ input: input.positivePrompt.slice(0, 80), id }))
        .toString("base64url")
        .slice(0, 32);
      return {
        imageUrl: `https://placehold.co/${input.width ?? 1024}x${input.height ?? 1024}/png?text=${encodeURIComponent(`${id}:${seed}`)}`,
        provider: id,
        model: "mock",
      };
    },
  };
}
