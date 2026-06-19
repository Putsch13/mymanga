/**
 * Génère dynamiquement les `PanelBlueprintPremium[]` à partir des beats du
 * `revisedBundle.outline.beats` quand le studio n'en a pas fourni.
 *
 * Pipeline par beat :
 *   1. heuristic narrative facts
 *   2. semantic enrichment
 *   3. LLM enrichment (best-effort)
 *   4. props (alignés VisualWorld + premium strict sourcing)
 *   5. blueprints
 *   6. persistance des props "actionables" sur le carrier (CharacterPropInventory)
 *
 * Extrait depuis `narrative-pass.ts` pour réduire la surface du gros legacy.
 */

import { isHeroRole, type PanelBlueprintPremium } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { isPipelineV3PremiumOnlyEnabled } from "../../pipeline-feature-flags";

import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../../lib/pipeline-logger";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRecord = any;

const KNOWN_UNIVERSE_TYPES = [
  "ninja",
  "cyberpunk",
  "post_apo",
  "school_life",
  "mecha",
  "fantasy",
  "military",
  "medical",
  "urban",
  "generic",
] as const;
type UniverseType = (typeof KNOWN_UNIVERSE_TYPES)[number];

export type DynamicBlueprintSource = "dynamic_llm" | "dynamic_heuristic";

export interface DynamicBlueprintGeneratorInput {
  chapterNumber: number;
  chapterId: string;
  projectId: string;
  beats: LooseRecord[];
  rawCharacters: LooseRecord[];
  composedVisualWorldContract: LooseRecord | null;
  project: { primaryGenre: string | null; tone: string | null };
}

export interface DynamicBlueprintGeneratorResult {
  blueprints: PanelBlueprintPremium[];
  blueprintSource: DynamicBlueprintSource | null;
  beatInferredPropNamesByBeatId: Map<string, string[]>;
  orphanedBeatIds: string[];
}

function isAntagonistRole(role: string | null | undefined): boolean {
  return role === "antagonist" || role === "villain" || role === "rival";
}

export async function generateDynamicPanelBlueprints(
  input: DynamicBlueprintGeneratorInput,
): Promise<DynamicBlueprintGeneratorResult> {
  const { chapterNumber, chapterId, projectId, beats, rawCharacters, composedVisualWorldContract, project } = input;

  const beatInferredPropNamesByBeatId = new Map<string, string[]>();
  const orphanedBeatIds: string[] = [];
  const result: DynamicBlueprintGeneratorResult = {
    blueprints: [],
    blueprintSource: null,
    beatInferredPropNamesByBeatId,
    orphanedBeatIds,
  };

  if (beats.length === 0) return result;

  logPipelineInfo("pipeline.b3_1_generating_panel_blueprints_dynamically_for_beats", { message: `b3-1 generating panel blueprints dynamically for ${beats.length} beats` });

  const {
    buildPanelBlueprintsFromBeat,
    inferNarrativeFactsFromBeat,
    inferRequiredPropsFromBeat,
    indexVisualWorldPropsByBeat,
  } = await import("@manga-ai-studio/ai");

  const heroCharacterId = rawCharacters.find((c: LooseRecord) => isHeroRole(c.roleType))?.id ?? null;
  const rawGenre = project.primaryGenre ?? "";
  const universeType: UniverseType | undefined = (KNOWN_UNIVERSE_TYPES as readonly string[]).includes(rawGenre)
    ? (rawGenre as UniverseType)
    : undefined;

  const antagonists = rawCharacters.filter((c: LooseRecord) => isAntagonistRole(c.roleType));
  const blueprintContext = {
    // BUG-06 fix : `heroCharacterId` est réintroduit dans le blueprintContext.
    // L'intention I05 originelle (« builder must not know the hero ») tombait
    // en contradiction silencieuse : le fallback `mayShowCharacterIds` pushait
    // quand même le héros via `beat.involvedCharacters[0]`. On le passe
    // explicitement, charge au builder de ne PAS le « must-show » en dehors
    // du focus === "hero".
    heroCharacterId,
    chapterNumber,
    projectGenre: project.primaryGenre ?? undefined,
    projectTone: project.tone ?? undefined,
    antagonistNames: antagonists.map((c: LooseRecord) => c.name),
    antagonistIds: antagonists.map((c: LooseRecord) => c.id),
  };
  const narrativeCtx = {
    projectGenre: project.primaryGenre ?? null,
    projectTone: project.tone ?? null,
    heroCharacterId,
    universeType,
    antagonistIds: antagonists.map((c: LooseRecord) => c.id),
    antagonistNames: antagonists.map((c: LooseRecord) => c.name),
  };

  const visualWorldPropsForBeat = indexVisualWorldPropsByBeat(composedVisualWorldContract ?? undefined);

  let pageCounter = 1;
  let panelCounter = 1;
  let usedLlmEnrichment = false;
  const allDynamicBlueprints: PanelBlueprintPremium[] = [];

  for (const beat of beats) {
    try {
      const productionBeat = {
        beatId: beat.id,
        summary: beat.summary,
        narrativeFunction: beat.pageRole ?? beat.purpose,
        whyThisBeatExists: beat.summary,
        dramaticChange: beat.turn ?? beat.purpose,
        involvedCharacters: beat.characters,
        activeCanonConstraints: [] as string[],
        environmentContext: [beat.location],
        visualPriority: "high" as const,
        estimatedPanels: 4,
        criticality:
          beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
            ? ("critical" as const)
            : ("medium" as const),
        continuityDependencies: [] as string[],
        infoGained: null,
        emotionProduced: null,
        indispensabilityScore: 72,
        redundancyRisk: 18,
      };

      // Step 1: heuristic facts
      const facts = inferNarrativeFactsFromBeat(productionBeat, narrativeCtx);

      // Step 2: semantic enrichment
      const { inferAdditionalFactsFromSemantics, mergeNarrativeFacts } = await import("@manga-ai-studio/ai");
      const semanticFacts = inferAdditionalFactsFromSemantics(productionBeat, facts);
      const factsWithSemantics =
        semanticFacts.length > 0 ? mergeNarrativeFacts(facts, semanticFacts) : facts;
      if (semanticFacts.length > 0) {
        // FIXME(logger): migrate to logPipeline*
        console.log(
          `[pipeline:semantic-facts] beat=${productionBeat.beatId} +${semanticFacts.length} facts from semantics`,
        );
      }

      // Step 3: LLM enrichment — systématique, pas conditionnel
      let finalFacts = factsWithSemantics;
      try {
        const { enrichNarrativeFactsWithLLM } = await import("@manga-ai-studio/ai");
        const llmFacts = await enrichNarrativeFactsWithLLM(productionBeat, factsWithSemantics, {
          ...narrativeCtx,
          universeType,
        });
        if (llmFacts && llmFacts.length > 0) {
          finalFacts = mergeNarrativeFacts(factsWithSemantics, llmFacts);
          usedLlmEnrichment = true;
          // FIXME(logger): migrate to logPipeline*
          console.log(
            `[pipeline:llm-facts] beat=${productionBeat.beatId} +${llmFacts.length} facts from LLM`,
          );
        }
      } catch {
        // FIXME(logger): migrate to logPipeline*
        console.warn(
          `[pipeline:llm-facts] LLM enrichment failed for beat=${productionBeat.beatId}, using heuristic facts`,
        );
      }

      // Step 4: props — aligné estimate / premium-contract-builder.
      const props = inferRequiredPropsFromBeat(productionBeat, finalFacts, {
        universeType,
        projectGenre: project.primaryGenre ?? undefined,
        projectTone: project.tone ?? undefined,
        suppressUniverseTemplateProps: isPipelineV3PremiumOnlyEnabled(),
        visualWorldContractActive: Boolean(composedVisualWorldContract),
        premiumStrictChapterSourcing: isPipelineV3PremiumOnlyEnabled(),
        premiumOnly: isPipelineV3PremiumOnlyEnabled(),
        visualWorldContract: composedVisualWorldContract,
        ...(visualWorldPropsForBeat ? { visualWorldPropsForBeat, heroCharacterId } : {}),
      });
      beatInferredPropNamesByBeatId.set(
        beat.id,
        [...new Set(props.map((p: { canonicalName: string }) => p.canonicalName))].slice(0, 16),
      );

      // Step 5: blueprints
      const beatBlueprints = buildPanelBlueprintsFromBeat(
        productionBeat,
        finalFacts,
        props,
        blueprintContext,
        pageCounter,
        panelCounter,
      );
      allDynamicBlueprints.push(...beatBlueprints);
      pageCounter += Math.ceil(beatBlueprints.length / 3);
      panelCounter += beatBlueprints.length;

      // Step 6: persist actionable / payoff / threat props on the carrier.
      await persistActionableProps({
        props,
        productionBeat,
        rawCharacters,
        chapterId,
        projectId,
      });
    } catch (beatErr) {
      const msg = beatErr instanceof Error ? beatErr.message : "beat_blueprint_error";
      logPipelineWarn("pipeline.blueprint_generation_failed_for", { message: `blueprint generation failed for beat=${beat.id}: ${msg}` });
      orphanedBeatIds.push(beat.id);
    }
  }

  if (allDynamicBlueprints.length === 0) return result;

  // BUG-05 fix : renumérotation groupée par beatId pour que `findPanelBlueprint`
  // (strat 1 — pageNumber === sceneIndex + 1) reste cohérent.
  const orderedBeatIds: string[] = [];
  const beatPanelCounters = new Map<string, number>();
  allDynamicBlueprints.forEach((bp, idx) => {
    const key = bp.beatId ?? `__unknown_${idx}`;
    if (!beatPanelCounters.has(key)) {
      beatPanelCounters.set(key, 0);
      orderedBeatIds.push(key);
    }
    const nextPanel = (beatPanelCounters.get(key) ?? 0) + 1;
    beatPanelCounters.set(key, nextPanel);
    bp.pageNumber = orderedBeatIds.indexOf(key) + 1;
    bp.panelNumber = nextPanel;
    bp.panelIndex = idx;
  });

  result.blueprints = allDynamicBlueprints;
  result.blueprintSource = usedLlmEnrichment ? "dynamic_llm" : "dynamic_heuristic";

  // FIXME(logger): migrate to logPipeline*

  console.log(
    `[pipeline] b3-1 generated ${result.blueprints.length} blueprints dynamically (source=${result.blueprintSource})`,
  );
  if (orphanedBeatIds.length > 0) {
    // FIXME(logger): migrate to logPipeline*
    console.warn(
      `[pipeline] partial_success: ${orphanedBeatIds.length} beats orphaned: ${orphanedBeatIds.join(", ")}`,
    );
  }

  return result;
}

async function persistActionableProps(args: {
  props: LooseRecord[];
  productionBeat: LooseRecord;
  rawCharacters: LooseRecord[];
  chapterId: string;
  projectId: string;
}): Promise<void> {
  const { props, productionBeat, rawCharacters, chapterId, projectId } = args;

  const propsToSave = props.filter(
    (p: { mustBeVisible?: boolean; narrativeRole?: string | null }) =>
      p.mustBeVisible !== false &&
      (p.narrativeRole === "action_tool" ||
        p.narrativeRole === "payoff" ||
        p.narrativeRole === "threat"),
  );
  if (propsToSave.length === 0) return;

  const firstInvolved = productionBeat.involvedCharacters?.[0];
  const carrierCharId = firstInvolved
    ? rawCharacters.find((rc: LooseRecord) => rc.name === firstInvolved)?.id ?? null
    : null;
  if (!carrierCharId) {
    if (firstInvolved) {
      // FIXME(logger): migrate to logPipeline*
      console.warn(
        `[pipeline] prop carrier "${firstInvolved}" not found in rawCharacters — props not persisted`,
      );
    }
    return;
  }

  await Promise.allSettled(
    propsToSave.map(
      (prop: { canonicalName: string; category?: string; narrativeRole?: string | null }) =>
        prisma.characterPropInventory.upsert({
          where: {
            characterId_propCanonicalName: {
              characterId: carrierCharId,
              propCanonicalName: prop.canonicalName,
            },
          },
          create: {
            characterId: carrierCharId,
            projectId,
            propCanonicalName: prop.canonicalName,
            propCategory: prop.category ?? "unknown",
            propNarrativeRole: prop.narrativeRole ?? null,
            acquiredAtChapterId: chapterId,
            isActive: true,
          },
          update: { isActive: true },
        }),
    ),
  );
}
