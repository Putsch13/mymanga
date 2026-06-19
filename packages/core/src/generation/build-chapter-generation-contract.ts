/**
 * Construction d'un ChapterGenerationContract à partir du plan premium persisté
 * (outline + panelBlueprints enrichis). Alimente la validation contractuelle
 * avant render / Vision QA — ne remplace pas le storyboard mais verrouille la trace.
 *
 * Façade — l'implémentation est découpée dans `_build-chapter-generation-contract/*`.
 */

import {
  computeContractHash,
  type ChapterGenerationContract,
  type ContractCoverageRequirement,
} from "./chapter-generation-contract";
import {
  buildContractBeats,
  buildContractCharacters,
  buildContractLocations,
  buildContractProps,
  buildVisualWorldEntities,
} from "./_build-chapter-generation-contract/entities";
import { buildPanelContracts } from "./_build-chapter-generation-contract/panels";
import { deriveContractSourceHashes } from "./_build-chapter-generation-contract/source-hashes";
import type { BuildChapterGenerationContractInput } from "./_build-chapter-generation-contract/types";

export type {
  BuildChapterGenerationContractInput,
  BuildChapterGenerationContractOutlineBeat,
  PipelineCharacterLike,
  PipelineLocationLike,
} from "./_build-chapter-generation-contract/types";

export function buildChapterGenerationContractFromPremiumPlan(
  input: BuildChapterGenerationContractInput,
): ChapterGenerationContract {
  const vw = input.visualWorld ?? null;

  const contractChars = buildContractCharacters(
    input.characters,
    input.heroCharacterId,
    input.focusCharacterIds,
  );
  const contractLocs = buildContractLocations(input.locations);
  const beats = buildContractBeats(input.outlineBeats, vw);
  const props = buildContractProps(input.panelBlueprints);
  const { npcGroups, creatures, vehicles, factions } = buildVisualWorldEntities(vw);
  const panels = buildPanelContracts(
    input.panelBlueprints,
    input.characters,
    input.heroCharacterId,
    input.focusCharacterIds,
    vw,
  );

  const requiredCoverage: ContractCoverageRequirement[] = [];
  const forbiddenOutOfContractTerms: string[] = [];

  const base: Omit<ChapterGenerationContract, "contractHash" | "createdAt"> = {
    contractVersion: "v1",
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    source: deriveContractSourceHashes(input),
    characters: contractChars,
    locations: contractLocs,
    props,
    npcGroups,
    creatures,
    vehicles,
    factions,
    beats,
    panels,
    forbiddenOutOfContractTerms,
    requiredCoverage,
  };

  const contractHash = computeContractHash(base);
  return {
    ...base,
    contractHash,
    createdAt: new Date().toISOString(),
  };
}
