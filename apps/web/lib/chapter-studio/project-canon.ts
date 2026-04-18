/**
 * P5.3 — Construction et résolution du ProjectCanon studio.
 * Extrait de lib/chapter-studio.ts — logique inchangée.
 */

import {
  resolveEffectiveProjectCanon as resolveEffectiveProjectCanonCore,
  type ChapterStudioSnapshot,
  type ProjectCanon,
} from "@manga-ai-studio/core";
import { asStringArray, safeString } from "./utils";

export function resolveEffectiveProjectCanon(input: {
  snapshot: ChapterStudioSnapshot;
  fallbackProjectCanon?: ProjectCanon | null;
}) {
  return resolveEffectiveProjectCanonCore({
    studioProjectCanon: input.snapshot.data.projectCanon ?? null,
    fallbackProjectCanon: input.fallbackProjectCanon ?? null,
  });
}

export function buildProjectCanonFromProject(project: {
  visualStyle?: string | null;
  tone?: string | null;
  settings?: {
    violenceLevel?: number | null;
    romanceLevel?: number | null;
  } | null;
  bible?: {
    summary?: string | null;
    themes?: unknown;
    worldRules?: unknown;
    lockedCanon?: unknown;
  } | null;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    anatomyBias?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
    negativeConstraints?: unknown;
  } | null;
}): ProjectCanon {
  return {
    artStyleCanon: [
      safeString(project.visualStyle),
      safeString(project.stylePack?.renderFamily),
      safeString(project.stylePack?.lineWeight),
      safeString(project.stylePack?.shadingMode),
      safeString(project.stylePack?.contrastProfile),
      safeString(project.stylePack?.cameraLanguage),
    ].filter((value): value is string => Boolean(value)),
    worldRules: [
      ...asStringArray(project.bible?.worldRules),
      ...asStringArray(project.bible?.lockedCanon),
    ],
    toneRules: [safeString(project.tone)].filter((value): value is string => Boolean(value)),
    violenceLevel: project.settings?.violenceLevel ?? null,
    romanceLevel: project.settings?.romanceLevel ?? null,
    supernaturalRules: [],
    panelingPreferences: [safeString(project.stylePack?.backgroundDensity)].filter((value): value is string => Boolean(value)),
    blackAndWhitePolicy: "manga_monochrome",
    inkingPolicy: safeString(project.stylePack?.anatomyBias),
    negativeStyleRules: asStringArray(project.stylePack?.negativeConstraints),
  };
}
