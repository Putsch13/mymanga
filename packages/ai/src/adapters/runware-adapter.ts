import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createRunwareAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("runware");
  return {
    id: "runware",
    async generateImage(_input: GenerateImageInput): Promise<GenerateImageResult> {
      void _input;
      throw new Error("RunwareAdapter: intégrer SDK Runware / workflows ComfyUI.");
    },
  };
}
