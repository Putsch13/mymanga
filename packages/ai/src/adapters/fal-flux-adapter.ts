import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types";
import { createMockImageProvider } from "./mock-image-provider";
import { createFalCharacterAdapter } from "./fal-character-adapter";
import { createFalPanelAdapter } from "./fal-panel-adapter";
import { createFalSceneAdapter } from "./fal-scene-adapter";

export function createFalFluxAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) {
    return createMockImageProvider("fal");
  }

  const characterAdapter = createFalCharacterAdapter(apiKey);
  const sceneAdapter = createFalSceneAdapter(apiKey);
  const panelAdapter = createFalPanelAdapter(apiKey);

  return {
    id: "fal",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const mode = String(input.providerParams?.mode ?? input.mode);
      if (mode.includes("CHARACTER")) {
        return characterAdapter.generateImage(input);
      }
      if (mode.includes("SCENE") || mode.includes("LOCATION")) {
        return sceneAdapter.generateImage(input);
      }
      return panelAdapter.generateImage(input);
    },
  };
}
