import {
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  isPipelineV3PremiumOnlyEnabled,
  type CharacterCanon,
  type PanelBlueprintPremium,
  type ProductionPlan,
  type VisualWorldContract,
} from "@manga-ai-studio/core";

import { toCharacterRowsForDnaHydration } from "@/lib/premium-character-studio-select";

import { asRecord } from "./utils";

interface HydrateBlueprintsInput {
  resolvedProductionPlan: ProductionPlan;
  studioSnapshotForContract: {
    data: { characterCanons?: CharacterCanon[] };
  };
  projectCharacters: Parameters<typeof toCharacterRowsForDnaHydration>[0];
  visualWorldContract: VisualWorldContract | null | undefined;
  secondaryHeroCharacterId: string | null;
  premiumMeta: Record<string, unknown>;
}

/**
 * P0 — Alignement estimate/launch : ré-hydrate `characterVisualDna` (et le reste
 * des DNA visuelles) sur le plan résolu, puisque la réconciliation client peut
 * livrer des blueprints sans DNA complet.
 */
export function hydrateResolvedProductionPlan(
  input: HydrateBlueprintsInput,
): ProductionPlan {
  const {
    resolvedProductionPlan,
    studioSnapshotForContract,
    projectCharacters,
    visualWorldContract,
    secondaryHeroCharacterId,
    premiumMeta,
  } = input;

  const planRecord = asRecord(resolvedProductionPlan);
  const rawBps = Array.isArray(planRecord.panelBlueprints)
    ? (planRecord.panelBlueprints as PanelBlueprintPremium[])
    : [];

  if (rawBps.length === 0) return resolvedProductionPlan;

  const canons = studioSnapshotForContract.data.characterCanons ?? [];
  const characterCanonsById: Record<string, CharacterCanon> = {};
  for (const c of canons) characterCanonsById[c.characterId] = c;

  let bps = hydrateBlueprintsWithCharacterDna({
    blueprints: rawBps,
    characters: toCharacterRowsForDnaHydration(projectCharacters),
    characterCanonsById:
      Object.keys(characterCanonsById).length > 0 ? characterCanonsById : undefined,
    characterCanons: canons.length > 0 ? canons : null,
    strict: isPipelineV3PremiumOnlyEnabled(),
    ...(secondaryHeroCharacterId
      ? { coProtagonistCharacterIds: [secondaryHeroCharacterId] as const }
      : {}),
  });

  if (visualWorldContract) {
    const strictVw = isPipelineV3PremiumOnlyEnabled();
    bps = hydrateBlueprintsWithEnvironmentDna({
      blueprints: bps,
      visualWorld: visualWorldContract,
      strict: strictVw,
    });
    bps = hydrateBlueprintsWithPropDna({
      blueprints: bps,
      visualWorld: visualWorldContract,
      strict: strictVw,
    });
    bps = hydrateBlueprintsWithNpcDna({
      blueprints: bps,
      visualWorld: visualWorldContract,
      strict: strictVw,
    });
  }

  premiumMeta.panelBlueprintsCount = bps.length;

  return {
    ...planRecord,
    panelBlueprints: bps,
  } as ProductionPlan;
}
