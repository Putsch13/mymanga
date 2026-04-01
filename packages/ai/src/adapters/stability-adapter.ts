import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createStabilityAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("stability");
  return {
    id: "stability",
    async generateImage(_input: GenerateImageInput): Promise<GenerateImageResult> {
      void _input;
      throw new Error("StabilityAdapter: intégrer Stable Image Ultra API.");
    },
  };
}
