/**
 * P5.3 — Construction et résolution du LocationCanon studio.
 * Extrait de lib/chapter-studio.ts — logique inchangée.
 */

import {
  resolveEffectiveLocationCanon as resolveEffectiveLocationCanonCore,
  type ChapterStudioSnapshot,
  type LocationCanon,
} from "@manga-ai-studio/core";
import { asRecord, asStringArray, safeString } from "./utils";

export function buildLocationCanonFromLocation(location: {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
  metadata?: unknown;
}): LocationCanon {
  const metadata = asRecord(location.metadata);
  return {
    locationId: location.id,
    label: location.name,
    visualMarkers: [
      safeString(location.description),
      ...asStringArray(metadata.visualMarkers),
    ].filter((value): value is string => Boolean(value)),
    architecture: asStringArray(metadata.architecture),
    density: safeString(metadata.density ?? location.type),
    atmosphere: asStringArray(metadata.atmosphere),
    timeOfDayVariants: asStringArray(metadata.timeOfDayVariants),
    weatherVariants: asStringArray(metadata.weatherVariants),
    mustKeep: asStringArray(metadata.mustKeep),
    forbiddenDrift: asStringArray(metadata.forbiddenDrift),
  };
}

export function resolveEffectiveLocationCanon(input: {
  snapshot: ChapterStudioSnapshot;
  locationIdOrLabel?: string | null;
  fallbackLocationCanon?: LocationCanon | null;
}) {
  return resolveEffectiveLocationCanonCore({
    studioLocationCanons: input.snapshot.data.locationCanons,
    locationIdOrLabel: input.locationIdOrLabel,
    fallbackLocationCanon: input.fallbackLocationCanon ?? null,
  });
}
