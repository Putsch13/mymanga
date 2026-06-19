/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Construit la triade `castContract` + `canonResolverResult` (+ enrichies
 * locations) + `storyContract` et exécute la `StoryContractCompletenessQA`.
 *
 * Extrait depuis `run-premium-v3-pipeline.ts` pour réduire la taille de
 * l'orchestrateur. Aucun changement de comportement : les mêmes asserts /
 * logs sont rejoués dans le même ordre.
 */

import {
  assertValidChapterCastContract,
  assertValidChapterStoryContract,
  buildChapterCastContract,
  buildChapterStoryContract,
  formatCastContractLog,
  formatStoryContractLog,
  type ChapterCastContract,
  type ChapterStoryContract,
} from "@manga-ai-studio/core";
import {
  runCanonResolverPass,
  formatCanonResolverLog,
} from "../canon-resolver-pass";
import {
  runStoryContractCompletenessQa,
  formatStoryContractCompletenessLog,
} from "../story-contract-completeness-qa";
import type { LegacyNpcGroupForCast } from "../merge-npc-groups-legacy-regex";
import {
  type PremiumV3PipelineLocation,
  v3PipelineLocationToResolverUserLocation,
} from "../../load-locations-for-v3-story-pass";
import type {
  PremiumV3PipelineCharacter,
  RunPremiumV3PipelineInput,
} from "../../run-premium-v3-pipeline";

export interface BuildCastStoryContractsInput {
  input: RunPremiumV3PipelineInput;
  rawCharacters: PremiumV3PipelineCharacter[];
  resolvedLocations: PremiumV3PipelineLocation[];
  resolvedBeatIds: string[];
  mergedNpcGroups: LegacyNpcGroupForCast[];
  visualDiscoveryContract: any;
}

export interface BuildCastStoryContractsResult {
  castContract: ChapterCastContract;
  storyContract: ChapterStoryContract;
  enrichedLocations: PremiumV3PipelineLocation[];
  canonResolverResult: ReturnType<typeof runCanonResolverPass>;
}

export function buildCastStoryContracts(
  args: BuildCastStoryContractsInput,
): BuildCastStoryContractsResult {
  const {
    input,
    rawCharacters,
    resolvedLocations,
    resolvedBeatIds,
    mergedNpcGroups,
    visualDiscoveryContract,
  } = args;

  const castContract: ChapterCastContract = buildChapterCastContract({
    chapterId: input.chapterId,
    heroCharacterId: input.heroCharacterId ?? null,
    secondaryHeroCharacterId: input.secondaryHeroCharacterId ?? null,
    focusCharacterIds: input.focusCharacterIds,
    characters: rawCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType ?? null,
    })),
    npcGroups: mergedNpcGroups,
  });
  assertValidChapterCastContract(castContract);
  console.info(formatCastContractLog(castContract));

  // P1.5 — Canon Resolver : résolution canonique des entités détectées.
  const canonResolverResult = runCanonResolverPass({
    discoveryContract: visualDiscoveryContract,
    userCharacters: rawCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType,
      description: c.canonSignatureText,
    })),
    userLocations: resolvedLocations.map((loc) => v3PipelineLocationToResolverUserLocation(loc)),
    strictMode: input.premiumV3OnlyEnabled,
  });
  console.info(formatCanonResolverLog(canonResolverResult));

  // Enrichir les lieux avec ceux détectés automatiquement.
  const enrichedLocations: PremiumV3PipelineLocation[] = [...resolvedLocations];
  for (const tempLoc of canonResolverResult.contract.temporaryLocations) {
    const exists = enrichedLocations.some(
      (l) => l.id === tempLoc.id || l.name?.toLowerCase() === tempLoc.label.toLowerCase(),
    );
    if (!exists) {
      enrichedLocations.push({
        id: tempLoc.id,
        name: tempLoc.label,
        visualDNA: { description: tempLoc.visualDescription },
      } as PremiumV3PipelineLocation);
    }
  }

  const storyContract: ChapterStoryContract = buildChapterStoryContract({
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    chapterSummary: input.chapterSummary,
    chapterUserIntent: input.chapterUserIntent,
    heroCharacterId: castContract.heroCharacterId,
    characters: rawCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType ?? null,
    })),
    locations: enrichedLocations.map((loc) => ({
      id: loc.id,
      name: loc.name ?? loc.id,
      visualDescription:
        typeof loc.visualDNA?.description === "string" ? loc.visualDNA.description : "",
    })),
    npcGroups: mergedNpcGroups,
    beatIds: resolvedBeatIds,
    tone: "neutral",
  });
  assertValidChapterStoryContract(storyContract);
  console.info(formatStoryContractLog(storyContract));

  // P6.17 — StoryContractCompletenessQA : vérifier la complétude du contrat.
  const storyContractQaResult = runStoryContractCompletenessQa({
    storyContract,
    castContract,
    beatIds: resolvedBeatIds,
    strictMode: input.premiumV3OnlyEnabled,
  });
  console.info(formatStoryContractCompletenessLog(storyContractQaResult));
  if (!storyContractQaResult.ok && input.premiumV3OnlyEnabled) {
    throw new Error(
      `story_contract_incomplete: ${storyContractQaResult.issues.map((i) => i.code).join(", ")}`,
    );
  }

  return { castContract, storyContract, enrichedLocations, canonResolverResult };
}
