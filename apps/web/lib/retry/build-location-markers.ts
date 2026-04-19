/**
 * P1.4 (sprint 3) — Construction des marqueurs décor pour un retry
 * "environment" / "composition".
 *
 * Cette fonction délègue désormais à `resolveLocationVisualCanon` afin de
 * garantir UNE source unique de vérité pour le canon visuel des lieux. Les
 * retries partageront ainsi les mêmes marqueurs que ceux utilisés par le
 * narrative-pass et le studio (permanentArchitecture, canonicalProps,
 * palette, lighting, canonicalViews). On n'utilise plus uniquement un
 * sous-champ arbitraire (`architecturalFeatures`) du metadata brut.
 *
 * Retourne une chaîne type :
 *   `location: Ecole Tōkai; type: school; brief; architectural markers (...);
 *    canonical props (...); palette (...); lighting (...); views (...);
 *    canon-refs=N`
 * ou "" si la location est introuvable / null.
 */

import type { PrismaClient } from "@manga-ai-studio/db";
import {
  resolveLocationVisualCanon,
  type LocationCanonInput,
  type ResolvedLocationVisualCanon,
} from "@/lib/canon/resolve-location-visual-canon";

/**
 * P1.4 — Pur formatage du canon → ligne textuelle. Séparé de l'accès Prisma
 * pour pouvoir être testé sans DB et réutilisé ailleurs (ex: narrative-pass,
 * canon-health, eval harness).
 */
export function formatLocationCanonMarkersLine(canon: ResolvedLocationVisualCanon): string {
  const bits: string[] = [];
  if (canon.label) bits.push(`location: ${canon.label}`);
  if (canon.density) bits.push(`type: ${canon.density}`);
  if (canon.establishedBrief && canon.establishedBrief.length > 0) {
    bits.push(canon.establishedBrief.slice(0, 200));
  }
  if (canon.permanentArchitecture.length > 0) {
    bits.push(`architectural markers (${canon.permanentArchitecture.slice(0, 5).join(", ")})`);
  }
  if (canon.canonicalProps.length > 0) {
    bits.push(`canonical props (${canon.canonicalProps.slice(0, 5).join(", ")})`);
  }
  if (canon.canonicalPalette.length > 0) {
    bits.push(`palette (${canon.canonicalPalette.slice(0, 4).join(", ")})`);
  }
  if (canon.canonicalLighting.length > 0) {
    bits.push(`lighting (${canon.canonicalLighting.slice(0, 3).join(", ")})`);
  }
  if (canon.canonicalViews.length > 0) {
    bits.push(`views (${canon.canonicalViews.slice(0, 3).join(", ")})`);
  }
  if (canon.referenceAssets.length > 0) {
    bits.push(`canon-refs=${canon.referenceAssets.length}`);
  }
  if (canon.requiresVisualContinuity) {
    bits.push("requires_visual_continuity");
  }
  return bits.join("; ");
}

export async function buildLocationMarkersLine(params: {
  prisma: PrismaClient;
  locationId: string | null | undefined;
}): Promise<string> {
  if (!params.locationId) return "";
  try {
    const location = await params.prisma.location
      .findUnique({
        where: { id: params.locationId },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          visualBrief: true,
          establishedVisualBrief: true,
          canonImageUrl: true,
          visualRefs: true,
          canonLocked: true,
          metadata: true,
        },
      })
      .catch(() => null);
    if (!location) return "";

    const canonInput: LocationCanonInput = {
      id: location.id,
      name: location.name,
      type: location.type,
      description: location.description,
      visualBrief: location.visualBrief,
      establishedVisualBrief: location.establishedVisualBrief,
      canonImageUrl: location.canonImageUrl,
      visualRefs: location.visualRefs,
      canonLocked: location.canonLocked,
      metadata: location.metadata,
    };
    const canon = resolveLocationVisualCanon(canonInput);
    return formatLocationCanonMarkersLine(canon);
  } catch (locErr) {
    console.warn(
      `[retry:location] failed to resolve canon for locationId=${params.locationId}: ${
        locErr instanceof Error ? locErr.message : locErr
      }`,
    );
    return "";
  }
}
