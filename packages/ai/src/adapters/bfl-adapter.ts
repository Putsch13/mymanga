import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createBflAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("bfl");
  return {
    id: "bfl",
    async generateImage(_input: GenerateImageInput): Promise<GenerateImageResult> {
      void _input;
      throw new Error("BflAdapter: intégrer API BFL officielle.");
    },
  };
}
