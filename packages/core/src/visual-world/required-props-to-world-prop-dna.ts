/**
 * Convertit les `RequiredProp` des blueprints (hydratés VW / inférence)
 * en entrées `VisualWorldPropDna` pour le render spec et le prompt image.
 */

import type { RequiredProp } from "../types/narrative-facts";
import type { VisualWorldPropDna } from "./visual-world-contract";

function continuityPolicyFromRequiredProp(p: RequiredProp): VisualWorldPropDna["continuityPolicy"] {
  if (p.narrativeRole === "evidence" || p.narrativeRole === "ritual") return "symbolic";
  if (p.mustBeVisible) return "recurring";
  return "single_use";
}

/**
 * Mappe les props requis du panel vers le contrat monde visuel (sous-ensemble
 * utilisé côté prompt ; pas de second catalogue créatif).
 */
export function requiredPropsToWorldPropsVisualDna(
  props: RequiredProp[] | null | undefined,
  beatId: string,
): VisualWorldPropDna[] {
  if (!props?.length) return [];
  return props.map((p) => ({
    id: p.id,
    canonicalName: p.canonicalName,
    category: p.category,
    visualDescription: [p.canonicalName, p.narrativeRole, p.visibilityMode].filter(Boolean).join(" · ").slice(0, 480),
    ownerCharacterId: p.ownerId ?? null,
    locationId: null,
    requiredBeatIds: p.requiredForBeatIds?.length ? [...p.requiredForBeatIds] : [beatId],
    continuityPolicy: continuityPolicyFromRequiredProp(p),
  }));
}
