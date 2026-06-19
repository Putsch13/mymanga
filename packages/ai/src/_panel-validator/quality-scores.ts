/**
 * Calcul des scores qualité heuristiques (avant blending Vision QA).
 *
 * Les scores sont calculés à partir du prompt généré, du `panelContract`,
 * du `sceneBlueprint` et du `stylePack`. Aucun appel I/O n'est effectué ici.
 */
import { runPropertyValidators } from "@manga-ai-studio/world";
import type { GeneratedPanelData } from "./types";
import { clamp01, includesAll } from "./utils";

export interface ComputeQualityScoresResult {
  propertyChecks: ReturnType<typeof runPropertyValidators>;
  qualityScores: {
    characterConsistencyScore: number;
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    interactionScore: number;
    shotComplianceScore: number;
    styleConsistencyScore: number;
    releaseScore: number;
  };
}

export function computeQualityScores(
  panel: GeneratedPanelData,
  characterScore: number,
): ComputeQualityScoresResult {
  const prompt = panel.metadata?.prompt?.toLowerCase() ?? "";
  const blueprint = panel.metadata?.sceneBlueprint;
  const contract = panel.metadata?.panelContract;
  const stylePack = panel.metadata?.stylePack;
  const propertyChecks = blueprint ? runPropertyValidators(blueprint) : [];

  const backgroundNeedles = [
    ...(blueprint?.environment.mustShowLocationSignals ?? []),
    ...(blueprint?.environment.backgroundElements ?? []),
    ...(contract?.backgroundExtras ?? []),
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase())
    .slice(0, 8);

  const interactionNeedles = [
    blueprint?.composition.interactionBeat,
    ...(blueprint?.procedural.selectedLocations.primary.flatMap(
      (item) => item.interactionHooks,
    ) ?? []),
    ...(blueprint?.procedural.selectedCreatures.primary.flatMap(
      (item) => item.interactionHooks,
    ) ?? []),
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase())
    .slice(0, 6);

  const styleNeedles = [
    stylePack?.renderFamily,
    stylePack?.lineWeight,
    stylePack?.shadingMode,
    stylePack?.contrastProfile,
    stylePack?.anatomyBias,
    stylePack?.backgroundDensity,
    stylePack?.cameraLanguage,
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase());

  const shotType = contract?.shotType ?? blueprint?.composition.shotType ?? "";

  const backgroundPresenceScore = clamp01(
    shotType === "wide"
      ? includesAll(
          prompt,
          backgroundNeedles.length > 0
            ? backgroundNeedles.slice(0, 3)
            : ["environment"],
        )
      : 0.7 + includesAll(prompt, backgroundNeedles.slice(0, 2)) * 0.3,
  );

  const environmentReadabilityScore = clamp01(
    0.4 +
      includesAll(prompt, backgroundNeedles) * 0.4 +
      ((blueprint?.environment.mustShowLocationSignals.length ?? 0) >= 2 ? 0.2 : 0),
  );

  const interactionScore = clamp01(0.35 + includesAll(prompt, interactionNeedles) * 0.65);

  const shotComplianceScore = clamp01(
    shotType === "wide"
      ? prompt.includes("full environment visible") || prompt.includes("wide shot")
        ? 1
        : 0.45
      : shotType === "medium"
        ? prompt.includes("character and environment both readable")
          ? 1
          : 0.55
        : shotType.includes("close")
          ? prompt.includes("environmental cues")
            ? 1
            : 0.6
          : shotType === "over_shoulder"
            ? prompt.includes("spatial relation")
              ? 1
              : 0.55
            : 0.7,
  );

  const styleConsistencyScore = clamp01(0.45 + includesAll(prompt, styleNeedles) * 0.55);

  const releaseScore = clamp01(
    characterScore * 0.25 +
      backgroundPresenceScore * 0.2 +
      environmentReadabilityScore * 0.15 +
      interactionScore * 0.15 +
      shotComplianceScore * 0.1 +
      styleConsistencyScore * 0.15,
  );

  return {
    propertyChecks,
    qualityScores: {
      characterConsistencyScore: characterScore,
      backgroundPresenceScore,
      environmentReadabilityScore,
      interactionScore,
      shotComplianceScore,
      styleConsistencyScore,
      releaseScore,
    },
  };
}
