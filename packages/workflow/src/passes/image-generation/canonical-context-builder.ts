/**
 * P5.2 — Construction du contexte canonique partagé pour `runImageGenerationPass`.
 *
 * Avant l'extraction, ces ~70 lignes d'init vivaient au début du pass.
 * Ils construisent les `canonicalUniverse`, `canonicalMangaStyle`,
 * `canonicalVisualClassification`, `canonicalContinuity` qui sont ensuite
 * réutilisés pour chaque image (packet builder, drift detection, etc.).
 *
 * Pure : aucune I/O, aucun side-effect.
 */
import { resolveCanonicalStyleContract } from "../../style-contract-resolver";
import type {
  ContentRating,
  ContinuityContext,
  MangaStyleProfileRef,
  UniverseProfileRef,
  VisualClassification,
} from "@manga-ai-studio/core";

export interface BuildCanonicalContextInput {
  project: { id?: string; name?: string; primaryGenre?: string; stylePresetSlug?: string | null } | null;
  projectId: string;
  stylePacks: Array<{ name?: string }>;
  intensityLayer: string;
}

export interface CanonicalContext {
  canonicalUniverse: UniverseProfileRef;
  canonicalStyleContract: ReturnType<typeof resolveCanonicalStyleContract>;
  canonicalMangaStyle: MangaStyleProfileRef;
  canonicalContentRating: ContentRating;
  canonicalVisualClassification: VisualClassification;
  canonicalContinuity: ContinuityContext;
}

export function buildCanonicalContextForImagePass(
  input: BuildCanonicalContextInput,
): CanonicalContext {
  const { project, projectId, stylePacks, intensityLayer } = input;

  const canonicalUniverse: UniverseProfileRef = {
    universeId: (project?.id as string) ?? projectId,
    universeName: (project?.name as string) ?? "Unknown",
    tone: (project?.primaryGenre as string) ?? "adventure",
    era: null,
    magicLevel: null,
  };

  const canonicalStyleContract = resolveCanonicalStyleContract({
    stylePack: stylePacks[0] ?? null,
    presetSlug: (project?.stylePresetSlug as string | undefined) ?? null,
  });

  const canonicalMangaStyle: MangaStyleProfileRef = {
    styleId: canonicalStyleContract.styleId,
    styleName: canonicalStyleContract.styleName,
    medium: "manga",
    inkingStyle:
      canonicalStyleContract.lineWeight === "heavy"
        ? "heavy bold manga linework"
        : canonicalStyleContract.lineWeight === "fine"
          ? "fine precise manga linework"
          : "clean manga linework",
    shadingStyle:
      canonicalStyleContract.shadingMode === "ink_bw"
        ? "ink black-and-white screen tones"
        : canonicalStyleContract.shadingMode === "cel_shading"
          ? "cel shaded manga rendering"
          : canonicalStyleContract.shadingMode === "painterly"
            ? "painterly ink washes"
            : "cross-hatching manga rendering",
    compositionStyle: "dynamic manga panel layout",
    referenceMangaTitle: canonicalStyleContract.referenceMangaTitle,
  };

  const canonicalContentRating: ContentRating = (() => {
    const il = (intensityLayer ?? "").toLowerCase();
    if (il.includes("explicit")) return "explicit_adult";
    if (il.includes("mature") || il.includes("adult")) return "mature";
    if (il.includes("teen")) return "teen";
    return "teen";
  })();

  const canonicalVisualClassification: VisualClassification = {
    rating: canonicalContentRating,
    audience: canonicalContentRating === "teen" ? "teen 13+" : canonicalContentRating,
    violenceLevel:
      canonicalContentRating === "mature" || canonicalContentRating === "explicit_adult"
        ? "moderate"
        : "mild",
    sensualityLevel: canonicalContentRating === "explicit_adult" ? "explicit" : "none",
    allowedTokens: [],
    forbiddenTokens: [],
  };

  const canonicalContinuity: ContinuityContext = {
    anchors: [],
    recentBeatsSummary: "",
    heroKnownInjuries: [],
    heroKnownOutfit: null,
    activeInventory: [],
  };

  return {
    canonicalUniverse,
    canonicalStyleContract,
    canonicalMangaStyle,
    canonicalContentRating,
    canonicalVisualClassification,
    canonicalContinuity,
  };
}
