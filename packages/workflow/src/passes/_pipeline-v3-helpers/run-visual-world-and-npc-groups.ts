/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(Sprint 4): typer via VisualWorldDiscoveryPassResult après extraction. */
/**
 * Exécute la `runVisualWorldDiscoveryPass` et fusionne les NPC groups
 * (visualWorld + blueprints + regex legacy) en respectant la stratégie
 * premium v3.
 *
 * Extrait depuis `run-premium-v3-pipeline.ts` pour soulager l'orchestrateur.
 *
 * Sortie :
 *   - `visualDiscoveryResult` : résultat brut de la discovery pass.
 *   - `effectiveVisualWorld`  : visualWorld persisté studio prioritaire,
 *     sinon visualWorld découvert (P0.11).
 *   - `mergedNpcGroups[+Map]` : NPC groups dédupliqués (premier hit gagne).
 *   - `visualWorldDiscoveryAudit` : champs nécessaires pour l'audit `Job.output`.
 */

import {
  parseVisualWorldContract,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import {
  runVisualWorldDiscoveryPass,
  formatVisualWorldDiscoveryLog,
  type VisualWorldDiscoveryPassResult,
} from "../visual-world-discovery-pass";
import {
  mergeNpcGroupsFromBlueprintsAndStoryTextRegex,
  type LegacyNpcGroupForCast,
} from "../merge-npc-groups-legacy-regex";
import {
  extractNpcGroupsFromBlueprints,
  mergeDiscoveryContractNpcGroupsIntoMap,
  npcGroupsFromVisualWorldForCast,
} from "./pipeline-input-helpers";
import { v3PipelineLocationsToKnownLocations } from "../../load-locations-for-v3-story-pass";
import type { PremiumV3PipelineLocation } from "../../load-locations-for-v3-story-pass";
import type { RunPremiumV3PipelineInput } from "../../run-premium-v3-pipeline";

export interface RunVisualWorldAndNpcGroupsInput {
  input: RunPremiumV3PipelineInput;
  resolvedProductionOutline:
    | {
        beats?: Array<{
          beatId?: string;
          summary?: string;
          whyThisBeatExists?: string;
          dramaticChange?: string;
          involvedCharacters?: string[];
        }>;
      }
    | null;
  resolvedLocations: PremiumV3PipelineLocation[];
  styleBibleJson: string;
}

export interface RunVisualWorldAndNpcGroupsResult {
  visualDiscoveryResult: VisualWorldDiscoveryPassResult;
  effectiveVisualWorld: VisualWorldContract | null;
  persistedVisualWorld: VisualWorldContract | null;
  mergedNpcGroups: LegacyNpcGroupForCast[];
  mergedNpcGroupsMap: Map<string, LegacyNpcGroupForCast>;
  visualWorldDiscoveryAudit: Pick<
    VisualWorldDiscoveryPassResult,
    "discoverySource" | "visualWorldComposeMeta"
  >;
}

export async function runVisualWorldAndNpcGroups(
  args: RunVisualWorldAndNpcGroupsInput,
): Promise<RunVisualWorldAndNpcGroupsResult> {
  const { input, resolvedProductionOutline, resolvedLocations, styleBibleJson } = args;

  const discoveryInput = {
    chapterId: input.chapterId,
    beats:
      resolvedProductionOutline?.beats?.map((b) => ({
        beatId: b.beatId ?? "",
        summary: b.summary,
        whyThisBeatExists: b.whyThisBeatExists,
      })) ?? [],
    chapterSummary: input.chapterSummary,
    userIntent: input.chapterUserIntent,
    knownCharacters: input.rawCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      roleType: c.roleType,
      description: c.canonSignatureText,
    })),
    knownLocations: v3PipelineLocationsToKnownLocations(resolvedLocations),
    premiumV3OnlyEnabled: Boolean(input.premiumV3OnlyEnabled),
    projectGenre:
      typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null,
    projectTone: typeof input.project?.tone === "string" ? input.project.tone : null,
    styleBibleJson,
    composerBeats: resolvedProductionOutline?.beats?.map((b) => ({
      beatId: b.beatId ?? "",
      summary: b.summary ?? "",
      whyThisBeatExists: b.whyThisBeatExists ?? "",
      dramaticChange: b.dramaticChange ?? "",
      involvedCharacterIds: b.involvedCharacters ?? [],
    })),
  };
  const visualDiscoveryResult = await runVisualWorldDiscoveryPass(discoveryInput as any);

  const visualWorldDiscoveryAudit = {
    discoverySource: visualDiscoveryResult.discoverySource,
    visualWorldComposeMeta: visualDiscoveryResult.visualWorldComposeMeta,
  };
  console.info(formatVisualWorldDiscoveryLog(visualDiscoveryResult));
  if (visualDiscoveryResult.visualWorldComposeMeta?.path === "regex_after_compose_error") {
    console.warn(
      `[pipeline:v3:visual-world-compose_fallback] chapterId=${input.chapterId} ` +
        `summary=${visualDiscoveryResult.visualWorldComposeMeta.composeErrorSummary ?? "unknown"}`,
    );
  }

  let persistedVisualWorld: VisualWorldContract | null = null;
  if (input.persistedVisualWorldContract && typeof input.persistedVisualWorldContract === "object") {
    try {
      persistedVisualWorld = parseVisualWorldContract(input.persistedVisualWorldContract);
    } catch (e) {
      console.warn(
        `[pipeline:v3:visual-world] snapshot studio invalide, fallback découverte — ${String(e)}`,
      );
    }
  }
  /** Studio persisté prime sur la découverte (P0.11). */
  const effectiveVisualWorld = persistedVisualWorld ?? visualDiscoveryResult.visualWorldContract;

  const npcGroupsFromBlueprints = extractNpcGroupsFromBlueprints(input.panelBlueprints);
  // Premium NPC groups must come from VisualWorldContract or canonicalized
  // blueprints. Do not reintroduce regex NPC discovery here — legacy merge
  // lives in `merge-npc-groups-legacy-regex.ts` (non-premium path only).
  if (npcGroupsFromBlueprints.length > 0) {
    console.info(
      `[pipeline:v3:npc-groups] extracted ${npcGroupsFromBlueprints.length} groups from blueprints: ` +
        npcGroupsFromBlueprints.map((g) => g.label).join(", "),
    );
  }

  const premium = Boolean(input.premiumV3OnlyEnabled);
  const vw = effectiveVisualWorld;
  const useVisualWorldNpcPrimary =
    premium &&
    vw !== null &&
    (visualDiscoveryResult.discoverySource === "ai_composed" || persistedVisualWorld !== null);

  let mergedNpcGroups: LegacyNpcGroupForCast[];
  let mergedNpcGroupsMap: Map<string, LegacyNpcGroupForCast>;

  if (useVisualWorldNpcPrimary) {
    mergedNpcGroupsMap = new Map(
      npcGroupsFromVisualWorldForCast(vw).map((g) => [g.label.toLowerCase(), g] as const),
    );
    for (const g of npcGroupsFromBlueprints) {
      if (!mergedNpcGroupsMap.has(g.label.toLowerCase())) {
        mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
      }
    }
    mergedNpcGroups = Array.from(mergedNpcGroupsMap.values());
    console.info(
      `[pipeline:v3:npc-contract] source=visual_world+blueprints groups=${mergedNpcGroups.length} ` +
        `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
    );
  } else if (premium) {
    mergedNpcGroups = [...npcGroupsFromBlueprints];
    mergedNpcGroupsMap = new Map(mergedNpcGroups.map((g) => [g.label.toLowerCase(), g] as const));
    if (mergedNpcGroups.length > 0) {
      console.info(
        `[pipeline:v3:npc-contract] source=blueprints_only_premium_no_regex groups=${mergedNpcGroups.length} ` +
          `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
      );
    }
  } else {
    const beatTexts =
      input.panelBlueprints?.map((bp) => bp.purpose ?? bp.sceneContextLabel) ?? [];
    const { merged, map } = mergeNpcGroupsFromBlueprintsAndStoryTextRegex({
      npcGroupsFromBlueprints,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.chapterUserIntent,
      beatTexts,
    });
    mergedNpcGroups = merged;
    mergedNpcGroupsMap = map;
    if (mergedNpcGroups.length > 0) {
      console.info(
        `[pipeline:v3:npc-contract] source=blueprints+text_regex groups=${mergedNpcGroups.length} ` +
          `labels=${mergedNpcGroups.map((g) => g.label).join(",")}`,
      );
    }
  }

  const npcMapSizeBeforeDiscovery = mergedNpcGroupsMap.size;
  mergeDiscoveryContractNpcGroupsIntoMap(mergedNpcGroupsMap, visualDiscoveryResult.contract);
  mergedNpcGroups = Array.from(mergedNpcGroupsMap.values());
  if (mergedNpcGroupsMap.size > npcMapSizeBeforeDiscovery) {
    console.info(
      `[pipeline:v3:npc-discovery] discovery_contract_added=${
        mergedNpcGroupsMap.size - npcMapSizeBeforeDiscovery
      } total=${mergedNpcGroups.length}`,
    );
  }

  return {
    visualDiscoveryResult,
    effectiveVisualWorld,
    persistedVisualWorld,
    mergedNpcGroups,
    mergedNpcGroupsMap,
    visualWorldDiscoveryAudit,
  };
}
