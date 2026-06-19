import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider } from "../types.js";
import { createMockImageProvider } from "./mock-image-provider";

export function createBflAdapter(apiKey: string | undefined): ImageGenerationProvider {
  if (!apiKey) return createMockImageProvider("bfl");
  return {
    id: "bfl",
    async generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
      const host = process.env.BFL_API_HOST ?? "https://api.bfl.ai";
      const endpoint = process.env.BFL_ENDPOINT ?? "/v1/flux-dev";
      const url = `${host}${endpoint}`;

      const submitRes = await fetch(url, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "x-key": apiKey,
        },
        body: JSON.stringify({
          prompt: input.positivePrompt,
          width: input.width ?? 1024,
          height: input.height ?? 1024,
        }),
      });

      const submitJson = (await submitRes.json().catch(() => null)) as
        | { id?: string; polling_url?: string; error?: unknown }
        | null;

      if (!submitRes.ok || !submitJson?.polling_url) {
        throw new Error(`BFL submit failed (${submitRes.status})`);
      }

      const pollingUrl = submitJson.polling_url;
      const start = Date.now();
      const timeoutMs = 90_000;

      // Poll (0.5s -> 2s backoff)
      let delay = 500;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - start > timeoutMs) {
          throw new Error("BFL polling timeout");
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(2000, Math.floor(delay * 1.5));

        const pollRes = await fetch(pollingUrl, {
          method: "GET",
          headers: { accept: "application/json", "x-key": apiKey },
        });
        const pollJson = (await pollRes.json().catch(() => null)) as
          | { status?: string; result?: { sample?: string } }
          | { error?: unknown }
          | null;

        if (!pollRes.ok || !pollJson) continue;
        const status = (pollJson as { status?: string })?.status;
        if (status === "Ready") {
          const sample = (pollJson as { result?: { sample?: string } })?.result?.sample;
          if (!sample) throw new Error("BFL ready sans sample");
          return {
            imageUrl: sample,
            provider: "bfl",
            model: endpoint.replace("/v1/", ""),
            raw: { pollingUrl },
          };
        }
        if (status === "Error" || status === "Failed") {
          throw new Error("BFL génération échouée");
        }
      }
    },
  };
}
