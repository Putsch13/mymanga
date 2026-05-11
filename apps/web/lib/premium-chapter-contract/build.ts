/**
 * Construction async du contrat premium depuis un approvedOutline.
 * Extrait de `apps/web/lib/premium-chapter-contract.ts` (audit-v9).
 */

import {
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
  productionOutlineSchema,
  productionPlanSchema,
  type CharacterCanon,
  type CharacterRowForDnaHydration,
  type ProductionOutline,
  type ProductionPlan,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import {
  buildPremiumChapterContractAsync,
  composeVisualWorldContract,
  toComposeVisualWorldKnownLocation,
  type PremiumReadinessCastContext,
} from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import {
  premiumCharacterStudioSelect,
  toCharacterRowsForDnaHydration,
} from "../premium-character-studio-select";
import { readProjectWorldEntities } from "../world-entities/upsert-world-entities";
import type {
  BuildPremiumContractInput,
  PremiumChapterContractResult,
  PremiumContractCoverage,
} from "./types";

/**
 * Reconstruit le contrat premium complet depuis un approvedOutline.
 * Utilise l'enrichissement LLM si disponible.
 */
export async function buildPremiumChapterContractFromApprovedOutline(
  input: BuildPremiumContractInput,
): Promise<PremiumChapterContractResult> {
  let characterDnaHydration:
    | {
        characters: CharacterRowForDnaHydration[];
        characterCanonsById: Record<string, CharacterCanon> | null;
        characterCanons?: readonly CharacterCanon[] | null;
        strict?: boolean;
        coProtagonistCharacterIds?: readonly string[] | null;
      }
    | undefined;

  if (input.projectId) {
    const rows = await prisma.character.findMany({
      where: { projectId: input.projectId },
      select: premiumCharacterStudioSelect,
    });
    const canons = input.studioSnapshot?.data?.characterCanons ?? [];
    const characterCanonsById: Record<string, CharacterCanon> = {};
    for (const c of canons) {
      characterCanonsById[c.characterId] = c;
    }
    if (rows.length > 0) {
      const sel = input.studioSnapshot?.data?.characterSelection;
      const secFromInput = input.secondaryHeroCharacterId?.trim();
      const secFromSnap = sel?.secondaryHeroCharacterId?.trim();
      const deutFromSnap = sel?.deuteragonistCharacterId?.trim();
      const coProtagonistCharacterIds = [...new Set(
        [secFromInput, secFromSnap, deutFromSnap].filter((x): x is string => Boolean(x)),
      )];
      characterDnaHydration = {
        characters: toCharacterRowsForDnaHydration(rows),
        characterCanonsById: Object.keys(characterCanonsById).length > 0 ? characterCanonsById : null,
        characterCanons: canons.length > 0 ? canons : null,
        strict: isPipelineV3PremiumOnlyEnabled(),
        ...(coProtagonistCharacterIds.length > 0
          ? { coProtagonistCharacterIds: coProtagonistCharacterIds as readonly string[] }
          : {}),
      };
    }
  }

  let visualWorldContract: VisualWorldContract | undefined;
  const projectWorldEntities = input.projectId
    ? await readProjectWorldEntities(input.projectId)
    : { npcGroups: [], worldProps: [] };

  if (
    isPremiumStrictMode()
    && process.env.OPENAI_API_KEY
    && input.chapterId
    && input.projectId
  ) {
    try {
      const [charactersForWorld, locationsForWorld] = await Promise.all([
        prisma.character.findMany({
          where: { projectId: input.projectId },
          select: { id: true, name: true, roleType: true, appearance: true },
        }),
        prisma.location.findMany({
          where: { projectId: input.projectId },
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            visualBrief: true,
            establishedVisualBrief: true,
            canonImageUrl: true,
            canonLocked: true,
            metadata: true,
            visualRefs: true,
          },
        }),
      ]);

      const nameToId = new Map(
        charactersForWorld.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
      );

      visualWorldContract = await composeVisualWorldContract({
        chapterId: input.chapterId,
        chapterSummary: input.chapterSummary ?? null,
        chapterUserIntent: input.userIntent ?? null,
        projectGenre: input.projectGenre ?? null,
        projectTone: input.projectTone ?? null,
        styleBibleJson: null,
        beats: input.approvedOutline.beats.map((b) => ({
          beatId: b.id,
          summary: b.summary,
          whyThisBeatExists: b.pageRole ?? null,
          dramaticChange: b.turn ?? null,
          involvedCharacterIds: (b.characters ?? [])
            .map((name) => nameToId.get(name.trim().toLowerCase()))
            .filter((x): x is string => Boolean(x)),
        })),
        knownCharacters: charactersForWorld.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType ?? null,
          description: c.appearance ?? null,
        })),
        knownLocations: locationsForWorld.map((loc) => toComposeVisualWorldKnownLocation(loc)),
        knownNpcGroups: projectWorldEntities.npcGroups.map((g) => ({
          id: g.id,
          label: g.label,
          description: g.description,
          visualProfile: g.visualProfile,
          outfit: g.outfit,
          silhouette: g.silhouette,
          userEdited: g.userEdited,
        })),
        knownWorldProps: projectWorldEntities.worldProps.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.description,
          visualDescription: p.visualDescription,
          kind: p.kind,
          userEdited: p.userEdited,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isPremiumStrictMode()) {
        throw new Error(`premium_visual_world_compose_failed:${message}`);
      }
      console.warn("[premium-contract] visual_world_compose_failed", error);
    }
  }

  const selForReadiness = input.studioSnapshot?.data?.characterSelection;
  const premiumReadinessCast: PremiumReadinessCastContext | undefined =
    selForReadiness != null || input.heroCharacterId != null || input.secondaryHeroCharacterId != null
      ? {
          heroCharacterId: input.heroCharacterId ?? selForReadiness?.heroCharacterId?.trim() ?? null,
          secondaryHeroCharacterId:
            input.secondaryHeroCharacterId?.trim()
            || selForReadiness?.secondaryHeroCharacterId?.trim()
            || null,
          deuteragonistCharacterId: selForReadiness?.deuteragonistCharacterId?.trim() || null,
        }
      : undefined;

  const raw = await buildPremiumChapterContractAsync({
    approvedOutline: input.approvedOutline,
    heroCharacterId: input.heroCharacterId ?? null,
    projectGenre: input.projectGenre ?? null,
    projectTone: input.projectTone ?? null,
    chapterId: input.chapterId,
    projectId: input.projectId,
    chapterNumber: typeof input.chapterNumber === "number" ? input.chapterNumber : undefined,
    chapterTitle: input.chapterTitle ?? undefined,
    projectFormat: input.projectFormat === "webtoon" || input.projectFormat === "manga"
      ? input.projectFormat
      : undefined,
    // P2.1 — on transmet le vrai minimum du chapitre pour éviter que le
    // builder cape silencieusement à 75 quand le chapitre exige plus.
    minimumPanels: typeof input.minimumPanels === "number" && input.minimumPanels > 0
      ? input.minimumPanels
      : undefined,
    characterDnaHydration,
    visualWorldContract: visualWorldContract ?? undefined,
    premiumReadinessCast,
    knownNpcGroups: projectWorldEntities.npcGroups.map((g) => ({
      id: g.id,
      label: g.label,
    })),
    knownCharacters: (characterDnaHydration?.characters ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      displayName: null as string | null,
    })),
  });

  const outlineResult = productionOutlineSchema.safeParse(raw.productionOutline);
  if (!outlineResult.success) {
    throw new Error(`premium_contract_invalid_production_outline: ${outlineResult.error.message}`);
  }
  const planResult = productionPlanSchema.safeParse(raw.productionPlan);
  if (!planResult.success) {
    throw new Error(`premium_contract_invalid_production_plan: ${planResult.error.message}`);
  }
  const productionOutline: ProductionOutline = outlineResult.data;
  const productionPlan: ProductionPlan = planResult.data;
  const panelBlueprints = Array.isArray(productionPlan.panelBlueprints) ? productionPlan.panelBlueprints : [];

  const coverage: PremiumContractCoverage = {
    focusDistribution: productionPlan.focusDistribution,
    propCoverage: productionPlan.propCoverage,
    enemyCoverage: productionPlan.enemyCoverage,
    npcCoverage: productionPlan.npcCoverage,
    cutawayCoverage: productionPlan.cutawayCoverage,
    dialogueAnchorCoverage: productionPlan.dialogueAnchorCoverage,
    heroCenterRatio: productionPlan.heroCenterRatio,
    premiumReadinessScore: productionPlan.premiumReadinessScore,
  };

  return {
    productionOutline,
    productionPlan,
    readinessReport: null,
    panelBlueprints,
    coverage,
    visualWorldContract,
  };
}
