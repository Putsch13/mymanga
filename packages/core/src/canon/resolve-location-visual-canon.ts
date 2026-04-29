/**
 * P3.1 — Canon visuel lieu (partagé core / web / workflow).
 * Voir historique apps/web/lib/canon/resolve-location-visual-canon.ts.
 */

import { isStableImageUrl } from "../images/stable-image-url";

export type ResolvedLocationVisualRef = {
  url: string;
  type: "keyframe" | "user_upload" | "generated" | "canon_image";
  capturedFromChapterId: string | null;
  stable: true;
};

export type ResolvedLocationVisualCanon = {
  locationId: string;
  label: string;
  permanentArchitecture: string[];
  canonicalProps: string[];
  canonicalPalette: string[];
  canonicalLighting: string[];
  density: string | null;
  canonicalViews: string[];
  referenceAssets: ResolvedLocationVisualRef[];
  establishedBrief: string | null;
  isCanonicalLocation: boolean;
  requiresVisualContinuity: boolean;
  source:
    | "canon_image_and_refs"
    | "established_brief"
    | "metadata_only"
    | "description_fallback"
    | "empty";
};

export type LocationCanonInput = {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
  visualBrief?: string | null;
  establishedVisualBrief?: string | null;
  canonImageUrl?: string | null;
  visualRefs?: unknown;
  canonLocked?: boolean | null;
  metadata?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function normalizeRefType(raw: unknown): ResolvedLocationVisualRef["type"] {
  const t = typeof raw === "string" ? raw.toLowerCase() : "";
  if (t === "keyframe" || t === "user_upload" || t === "generated" || t === "canon_image") return t;
  return "generated";
}

function parseVisualRefs(raw: unknown): ResolvedLocationVisualRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ResolvedLocationVisualRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url : null;
    if (!url || !isStableImageUrl(url)) continue;
    out.push({
      url,
      type: normalizeRefType(obj.type),
      capturedFromChapterId:
        typeof obj.capturedFromChapterId === "string" ? obj.capturedFromChapterId : null,
      stable: true,
    });
  }
  return out;
}

export function resolveLocationVisualCanon(input: LocationCanonInput): ResolvedLocationVisualCanon {
  const metadata = asRecord(input.metadata);
  const parsedRefs = parseVisualRefs(input.visualRefs);

  const metaIsCanonical = metadata.isCanonicalLocation === true;
  const metaRequiresContinuity = metadata.requiresVisualContinuity === true;
  const isCanonicalLocation =
    metaIsCanonical
    || input.canonLocked === true
    || parsedRefs.length > 0
    || Boolean(input.canonImageUrl && isStableImageUrl(input.canonImageUrl));
  const requiresVisualContinuity = metaRequiresContinuity || isCanonicalLocation;

  const permanentArchitecture = [
    ...asStringArray(metadata.architecture),
    ...asStringArray(metadata.architecturalMarkers),
    ...asStringArray(metadata.permanentArchitecture),
  ];

  const canonicalProps = [
    ...asStringArray(metadata.canonicalProps),
    ...asStringArray(metadata.permanentProps),
    ...asStringArray(metadata.fixedProps),
  ];

  const canonicalPalette = [
    ...asStringArray(metadata.palette),
    ...asStringArray(metadata.colorPalette),
    ...asStringArray(metadata.canonicalPalette),
  ];

  const canonicalLighting = [
    ...asStringArray(metadata.lighting),
    ...asStringArray(metadata.canonicalLighting),
    ...asStringArray(metadata.atmosphere),
  ];

  const canonicalViews = [
    ...asStringArray(metadata.canonicalViews),
    ...asStringArray(metadata.establishingShots),
  ];

  const density = safeString(metadata.density) ?? safeString(input.type);

  const referenceAssets: ResolvedLocationVisualRef[] = [];
  if (input.canonImageUrl && isStableImageUrl(input.canonImageUrl)) {
    referenceAssets.push({
      url: input.canonImageUrl,
      type: "canon_image",
      capturedFromChapterId: null,
      stable: true,
    });
  }
  for (const r of parsedRefs) {
    if (!referenceAssets.some((existing) => existing.url === r.url)) {
      referenceAssets.push(r);
    }
  }

  const establishedBrief =
    safeString(input.establishedVisualBrief) ?? safeString(input.visualBrief) ?? null;

  let source: ResolvedLocationVisualCanon["source"] = "empty";
  if (referenceAssets.length > 0) source = "canon_image_and_refs";
  else if (establishedBrief) source = "established_brief";
  else if (permanentArchitecture.length + canonicalProps.length + canonicalPalette.length > 0) {
    source = "metadata_only";
  } else if (input.description || input.type) source = "description_fallback";

  return {
    locationId: input.id,
    label: input.name,
    permanentArchitecture: Array.from(new Set(permanentArchitecture)),
    canonicalProps: Array.from(new Set(canonicalProps)),
    canonicalPalette: Array.from(new Set(canonicalPalette)),
    canonicalLighting: Array.from(new Set(canonicalLighting)),
    density,
    canonicalViews: Array.from(new Set(canonicalViews)),
    referenceAssets,
    establishedBrief,
    isCanonicalLocation,
    requiresVisualContinuity,
    source,
  };
}

export function isLocationCanonical(input: LocationCanonInput): boolean {
  return resolveLocationVisualCanon(input).isCanonicalLocation;
}

export function locationRequiresVisualContinuity(input: LocationCanonInput): boolean {
  return resolveLocationVisualCanon(input).requiresVisualContinuity;
}

export interface CompactLocationCanonSummary {
  architecture: string[];
  props: string[];
  palette: string[];
  lighting: string[];
  views: string[];
}

export function summarizeLocationCanonForPrompt(
  canon: ResolvedLocationVisualCanon,
  opts: { maxEach?: number } = {},
): CompactLocationCanonSummary {
  const maxEach = Math.max(1, opts.maxEach ?? 3);
  return {
    architecture: canon.permanentArchitecture.slice(0, maxEach),
    props: canon.canonicalProps.slice(0, maxEach),
    palette: canon.canonicalPalette.slice(0, Math.min(maxEach, 3)),
    lighting: canon.canonicalLighting.slice(0, Math.min(maxEach, 2)),
    views: canon.canonicalViews.slice(0, Math.min(maxEach, 2)),
  };
}
