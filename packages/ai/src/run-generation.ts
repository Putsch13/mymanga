import { createBflAdapter } from "./adapters/bfl-adapter";
import { createFalFluxAdapter } from "./adapters/fal-flux-adapter";
import { createRunwareAdapter } from "./adapters/runware-adapter";
import { createStabilityAdapter } from "./adapters/stability-adapter";
import { decideImageRoute } from "./image-routing-service";
import type { GenerateImageInput, GenerateImageResult, ImageGenerationProvider, ImageProviderId, RoutingContext } from "./types";

function getProvider(id: ImageProviderId): ImageGenerationProvider {
  const falKey = process.env.FAL_KEY;
  const bflKey = process.env.BFL_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY;
  const stabilityKey = process.env.STABILITY_API_KEY;
  switch (id) {
    case "fal":
      return createFalFluxAdapter(falKey);
    case "bfl":
      return createBflAdapter(bflKey);
    case "runware":
      return createRunwareAdapter(runwareKey);
    case "stability":
      return createStabilityAdapter(stabilityKey);
    default:
      return createFalFluxAdapter(falKey);
  }
}

export async function runRoutedImageGeneration(
  ctx: RoutingContext,
  input: GenerateImageInput,
): Promise<
  | { ok: true; result: GenerateImageResult; routing: Exclude<ReturnType<typeof decideImageRoute>, { blocked: true }> }
  | { ok: false; blocked: true; reason: string; textOnlyFallback?: boolean }
> {
  const decision = decideImageRoute(ctx);
  if ("blocked" in decision) {
    return { ok: false, blocked: true, reason: decision.reason, textOnlyFallback: decision.textOnlyFallback };
  }
  const provider = getProvider(decision.provider);
  const result = await provider.generateImage({
    ...input,
    providerParams: { ...input.providerParams, model: decision.model },
  });
  return { ok: true, result, routing: decision };
}
