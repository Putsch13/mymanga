import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createRunwareAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("runware");
  return {
    id: "runware",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const endpoint = process.env.RUNWARE_API_HOST ?? "https://api.runware.ai/v1";
      const model =
        process.env.RUNWARE_MODEL ??
        // Exemple doc Runware (CivitAI)
        "civitai:102438@133677";

      const taskUUID =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `task_${Date.now()}`;

      const payload = [
        {
          taskType: "imageInference",
          taskUUID,
          positivePrompt: input.positivePrompt,
          ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
          width: input.width ?? 1024,
          height: input.height ?? 1024,
          model,
          numberResults: 1,
          outputType: "URL",
          outputFormat: "JPG",
        },
      ];

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as
        | { data?: Array<{ taskType?: string; taskUUID?: string; imageURL?: string }>; errors?: unknown }
        | { error?: string };

      if (!res.ok) {
        const msg = (json as { error?: string })?.error ?? `runware error ${res.status}`;
        throw new Error(msg);
      }

      const imageUrl = (json as { data?: Array<{ imageURL?: string }> })?.data?.find((d) => d.imageURL)?.imageURL;
      if (!imageUrl) {
        throw new Error("RunwareAdapter: réponse sans imageURL");
      }

      return {
        imageUrl,
        provider: "runware",
        model,
        raw: { taskUUID },
      };
    },
  };
}
