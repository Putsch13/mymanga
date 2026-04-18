/**
 * P5.3 — Construction et résolution du LocationCanon studio.
 * P3.2 — Enrichi via `resolveLocationVisualCanon` (canon décor unifié).
 *
 * On n'étend PAS le schema Zod `LocationCanon` côté `@manga-ai-studio/core`
 * pour ne pas casser les consommateurs existants (core/ai/workflow). À la
 * place, on "sur-remplit" les champs déjà présents avec des données
 * canoniques unifiées :
 *   - `architecture`        ← architecturalMarkers + permanentArchitecture
 *   - `atmosphere`          ← lighting + atmosphere
 *   - `mustKeep`            ← canonicalProps + mustKeep declarés
 *   - `forbiddenDrift`      ← forbiddenDrift declarés
 *   - `visualMarkers`       ← palette + markers + description
 *
 * Les consommateurs qui ont besoin des refs visuelles cross-chapitres
 * (`referenceAssets`), des flags `isCanonicalLocation`, ou du
 * `establishedBrief`, doivent passer par `resolveLocationVisualCanon`
 * directement (P3.1).
 */

import {
  resolveEffectiveLocationCanon as resolveEffectiveLocationCanonCore,
  type ChapterStudioSnapshot,
  type LocationCanon,
} from "@manga-ai-studio/core";
import { resolveLocationVisualCanon, type LocationCanonInput } from "@/lib/canon/resolve-location-visual-canon";
import { asRecord, asStringArray, safeString } from "./utils";

export function buildLocationCanonFromLocation(location: LocationCanonInput & {
  description?: string | null;
}): LocationCanon {
  const metadata = asRecord(location.metadata);
  const resolved = resolveLocationVisualCanon(location);

  const visualMarkers = [
    safeString(location.description),
    ...asStringArray(metadata.visualMarkers),
    ...resolved.canonicalPalette,
    ...resolved.canonicalViews,
  ].filter((value): value is string => Boolean(value));

  const architecture = [
    ...resolved.permanentArchitecture,
    ...asStringArray(metadata.architecture),
  ];

  const atmosphere = [
    ...resolved.canonicalLighting,
    ...asStringArray(metadata.atmosphere),
  ];

  const mustKeep = [
    ...resolved.canonicalProps,
    ...asStringArray(metadata.mustKeep),
  ];

  return {
    locationId: location.id,
    label: location.name,
    visualMarkers: Array.from(new Set(visualMarkers)),
    architecture: Array.from(new Set(architecture)),
    density: resolved.density,
    atmosphere: Array.from(new Set(atmosphere)),
    timeOfDayVariants: asStringArray(metadata.timeOfDayVariants),
    weatherVariants: asStringArray(metadata.weatherVariants),
    mustKeep: Array.from(new Set(mustKeep)),
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
