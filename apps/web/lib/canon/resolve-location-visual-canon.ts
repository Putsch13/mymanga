/**
 * P1.3 — Source de vérité unique pour le canon visuel d'un lieu (décor).
 *
 * Problème historique : `LocationCanon` était 100% textuel (`visualBrief`,
 * `establishedVisualBrief`) — aucune référence visuelle stable ne survivait
 * entre chapitres, d'où des décors qui dérivent visuellement au fil d'un arc.
 *
 * Ce module enrichit le canon lieu avec :
 *   - `referenceAssets` (URLs stables, promues depuis les keyframes QA
 *     validées),
 *   - `permanentMarkers` (props fixes du lieu),
 *   - `fingerprint` (palette, architecture, densityHints — dérivés du brief).
 *
 * Matching : par `locationId` d'abord, label normalisé ensuite.
 */

import type { Location } from "@manga-ai-studio/db";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";
import { normalizeLocationName } from "@manga-ai-studio/workflow";

export type ResolvedLocationVisualCanon = {
  locationId: string;
  name: string;
  referenceAssets: string[];
  permanentMarkers: string[];
  fingerprint: {
    palette: string[];
    architecture: string[];
    densityHints: string[];
  };
  visualBrief: string | null;
  establishedVisualBrief: string | null;
  normalizedName: string;
};

type LocationVisualRefRecord = {
  url: string;
  type?: string | null;
  capturedFromChapterId?: string | null;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function extractRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw as LocationVisualRefRecord[]) {
    if (!entry) continue;
    if (typeof entry === "string" && isStableImageUrl(entry)) {
      out.push(entry);
    } else if (typeof entry === "object" && typeof entry.url === "string" && isStableImageUrl(entry.url)) {
      out.push(entry.url);
    }
  }
  return Array.from(new Set(out));
}

function heuristicPalette(brief: string | null): string[] {
  if (!brief) return [];
  const words = brief.toLowerCase();
  const palette: string[] = [];
  const hits: Array<[RegExp, string]> = [
    [/\b(néon|neon)\b/, "neon"],
    [/\b(monochrome|gris)\b/, "monochrome"],
    [/\b(ocre|orange)\b/, "ocre"],
    [/\b(bleu|blue)\b/, "bleu"],
    [/\b(rouge|red)\b/, "rouge"],
    [/\b(sépia|sepia)\b/, "sepia"],
  ];
  for (const [re, label] of hits) if (re.test(words)) palette.push(label);
  return palette;
}

function heuristicArchitecture(brief: string | null): string[] {
  if (!brief) return [];
  const words = brief.toLowerCase();
  const tags: string[] = [];
  const hits: Array<[RegExp, string]> = [
    [/\b(cyberpunk|néofuturiste)\b/, "cyberpunk"],
    [/\b(médiéval|medieval)\b/, "médiéval"],
    [/\b(japonais|tradition|traditionnel)\b/, "japonais traditionnel"],
    [/\b(moderne|contemporain)\b/, "moderne"],
    [/\b(industriel|friche)\b/, "industriel"],
  ];
  for (const [re, label] of hits) if (re.test(words)) tags.push(label);
  return tags;
}

export function resolveLocationVisualCanon(input: Location): ResolvedLocationVisualCanon {
  const visualBrief = (input as unknown as { visualBrief?: string | null }).visualBrief ?? null;
  const establishedVisualBrief = (input as unknown as { establishedVisualBrief?: string | null }).establishedVisualBrief ?? null;
  const combined = establishedVisualBrief ?? visualBrief;

  const referenceAssets = extractRefs((input as unknown as { visualRefs?: unknown }).visualRefs);
  const permanentMarkersRaw = asStringArray((input as unknown as { permanentMarkers?: unknown }).permanentMarkers);

  const densityHints: string[] = [];
  if (combined) {
    if (/\b(dense|saturé|foule|bondé)\b/i.test(combined)) densityHints.push("haute densité");
    if (/\b(vide|désert|calme)\b/i.test(combined)) densityHints.push("faible densité");
  }

  return {
    locationId: input.id,
    name: input.name,
    referenceAssets,
    permanentMarkers: permanentMarkersRaw,
    fingerprint: {
      palette: heuristicPalette(combined),
      architecture: heuristicArchitecture(combined),
      densityHints,
    },
    visualBrief,
    establishedVisualBrief,
    normalizedName: normalizeLocationName(input.name),
  };
}
