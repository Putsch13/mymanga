export * from "./content-intensity";
export * from "./provider-capabilities";
export * from "./assembled-payload-guard";

import type { ContentIntensityLayer } from "./content-intensity";
import type { ImageProviderForModeration } from "./content-intensity";
import { capabilityFor } from "./provider-capabilities";

export function moderationOutcomeForImage(
  layer: ContentIntensityLayer,
  provider: ImageProviderForModeration,
): { decision: "ALLOW" | "DEGRADE" | "BLOCK"; reasons: string[] } {
  const cap = capabilityFor(provider, layer);
  const reasons: string[] = [];
  if (cap.notes) reasons.push(cap.notes);
  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    return { decision: "BLOCK", reasons: [...reasons, "Couche RESTRICTED_BLOCKED_VISUAL"] };
  }
  if (cap.image === "BLOCK") return { decision: "BLOCK", reasons };
  if (cap.image === "DEGRADE") return { decision: "DEGRADE", reasons };
  return { decision: "ALLOW", reasons };
}
