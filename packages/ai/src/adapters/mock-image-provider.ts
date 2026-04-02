import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId } from "../types.js";

export function createMockImageProvider(id: ImageProviderId): ImageGenerationProvider {
  const allowMock =
    process.env.ALLOW_MOCK_IMAGE_PROVIDER === "true" || process.env.NODE_ENV !== "production";
  return {
    id,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      if (!allowMock) {
        throw new Error(
          `MockImageProvider interdit en production (provider=${id}). Configure la clé API correspondante.`,
        );
      }
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
