/**
 * P5.2 — Hydratation DNA + provenance des blueprints estimate.
 *
 * Applique successivement (sur la même liste mutable) :
 *   1. `hydrateBlueprintsWithCharacterDna` (strict en premium-only).
 *   2. `hydrateBlueprintsWithEnvironmentDna` (jamais strict ici : on tolère
 *       les locations manquantes au stade estimate).
 *   3. `hydrateBlueprintsWithPropDna` + `hydrateBlueprintsWithNpcDna` si
 *       VisualWorld présent (strict en premium-only).
 *   4. `hydratePanelProvenanceOnBlueprints` avec le narrative digest courant.
 *
 * Log un warning par blueprint dont les `requiredProps` ou `requiredNpcCount`
 * n'ont pas pu être hydratés (DNA manquante).
 */
import {
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  hydratePanelProvenanceOnBlueprints,
  isPipelineV3PremiumOnlyEnabled,
  type CharacterCanon,
  type PanelBlueprintPremium,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import {
  toCharacterRowsForDnaHydration,
  type PremiumCharacterStudioRow,
} from "@/lib/premium-character-studio-select";

export function hydrateEstimateBlueprints(args: {
  blueprints: PanelBlueprintPremium[];
  characterRowsForHydration: PremiumCharacterStudioRow[];
  characterCanonsById: Record<string, CharacterCanon> | undefined;
  coProtagonistCharacterIdsForHydration: readonly string[] | undefined;
  visualWorldContract: VisualWorldContract | null;
  narrativeMemoryDigest: string;
}): PanelBlueprintPremium[] {
  const {
    blueprints,
    characterRowsForHydration,
    characterCanonsById,
    coProtagonistCharacterIdsForHydration,
    visualWorldContract,
    narrativeMemoryDigest,
  } = args;

  let allBlueprints = hydrateBlueprintsWithCharacterDna({
    blueprints,
    characters: toCharacterRowsForDnaHydration(characterRowsForHydration),
    characterCanonsById: characterCanonsById ?? null,
    strict: isPipelineV3PremiumOnlyEnabled(),
    ...(coProtagonistCharacterIdsForHydration
      ? { coProtagonistCharacterIds: coProtagonistCharacterIdsForHydration }
      : {}),
  });

  allBlueprints = hydrateBlueprintsWithEnvironmentDna({
    blueprints: allBlueprints,
    visualWorld: visualWorldContract ?? null,
    strict: false,
  });

  if (visualWorldContract) {
    const strictVw = isPipelineV3PremiumOnlyEnabled();
    allBlueprints = hydrateBlueprintsWithPropDna({
      blueprints: allBlueprints,
      visualWorld: visualWorldContract,
      strict: strictVw,
    });
    allBlueprints = hydrateBlueprintsWithNpcDna({
      blueprints: allBlueprints,
      visualWorld: visualWorldContract,
      strict: strictVw,
    });
  }

  allBlueprints = hydratePanelProvenanceOnBlueprints(allBlueprints, {
    narrativeMemoryDigest,
  });

  for (const bp of allBlueprints) {
    if (bp.requiredProps.length > 0 && !bp.propVisualDna) {
      console.warn(
        `[estimate] blueprint_not_fully_hydrated panelId=${bp.panelId} requiredProps=${bp.requiredProps.length} propVisualDna=missing`,
      );
    }
    if (bp.requiredNpcCount > 0 && (!bp.npcVisualDna || bp.npcVisualDna.length === 0)) {
      console.warn(
        `[estimate] blueprint_not_fully_hydrated panelId=${bp.panelId} requiredNpcCount=${bp.requiredNpcCount} npcVisualDna=missing`,
      );
    }
  }

  return allBlueprints;
}
