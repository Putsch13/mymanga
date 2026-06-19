/**
 * Hydratation optionnelle des blueprints (DNA personnage / décor / NPC / props)
 * et garde-fou QA structurelle après merge canonique.
 *
 * Auparavant : fonctions privées dans `premium-chapter-contract-builder.ts`.
 */
import {
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  isPipelineV3PremiumOnlyEnabled,
  runStructuralQaOnPremiumBlueprints,
  syncBlueprintTextContractFromTextFragments,
} from "@manga-ai-studio/core";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type { BuildPremiumChapterContractInput } from "./types";

export function applyOptionalCharacterDnaHydration(
  blueprints: PanelBlueprintPremium[],
  input: BuildPremiumChapterContractInput,
): PanelBlueprintPremium[] {
  const h = input.characterDnaHydration;
  if (!h?.characters?.length) return blueprints;
  const strict = h.strict === true || isPipelineV3PremiumOnlyEnabled();
  return hydrateBlueprintsWithCharacterDna({
    blueprints,
    characters: h.characters,
    characterCanonsById: h.characterCanonsById ?? undefined,
    characterCanons: h.characterCanons ?? undefined,
    strict,
    coProtagonistCharacterIds: h.coProtagonistCharacterIds ?? undefined,
  });
}

export function applyOptionalEnvironmentDnaHydration(
  blueprints: PanelBlueprintPremium[],
  input: BuildPremiumChapterContractInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorldContract) return blueprints;
  const strict = isPipelineV3PremiumOnlyEnabled();
  return hydrateBlueprintsWithEnvironmentDna({
    blueprints,
    visualWorld: input.visualWorldContract,
    strict,
  });
}

export function applyOptionalVisualWorldNpcPropHydration(
  blueprints: PanelBlueprintPremium[],
  input: BuildPremiumChapterContractInput,
): PanelBlueprintPremium[] {
  if (!input.visualWorldContract) return blueprints;
  const strict = isPipelineV3PremiumOnlyEnabled();
  let out = hydrateBlueprintsWithPropDna({
    blueprints,
    visualWorld: input.visualWorldContract,
    strict,
  });
  out = hydrateBlueprintsWithNpcDna({
    blueprints: out,
    visualWorld: input.visualWorldContract,
    strict,
  });
  return out;
}

/** PR5 — après merge / hydratations, recaler `textContract` sur les fragments persistés. */
export function resyncBlueprintPanelTextContracts(blueprints: PanelBlueprintPremium[]): void {
  for (const bp of blueprints) {
    syncBlueprintTextContractFromTextFragments(bp);
  }
}

/** Garde-fou : tout contrat premium doit passer la QA structurelle finale. */
export function assertFinalStructuralQaAfterMerge(input: {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string;
  format: "manga" | "webtoon" | "simple";
  productionOutline: unknown;
  blueprints: PanelBlueprintPremium[];
  knownNpcGroups?: readonly { id: string; label?: string | null }[];
  knownCharacters?: readonly { id: string; name?: string | null; displayName?: string | null }[];
}): void {
  const { qa } = runStructuralQaOnPremiumBlueprints(input);
  if (!qa.valid) {
    throw new Error(`premium_contract_final_structural_qa_failed: ${qa.errors.join(" | ")}`);
  }
}
