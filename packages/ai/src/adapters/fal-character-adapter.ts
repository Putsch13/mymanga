import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types";
import { createMockImageProvider } from "./mock-image-provider";
import { runFalGenerationJob } from "./fal-adapter-shared";

export function createFalCharacterAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) {
    return createMockImageProvider("fal");
  }

  return {
    id: "fal",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      return runFalGenerationJob(apiKey, input, "subscribe");
    },
  };
}
