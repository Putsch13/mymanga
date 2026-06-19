/**
 * P5.2 — Construit le `productionPlan` final renvoyé dans la réponse estimate.
 *
 * Combine :
 *   - `buildProductionPlanFromOutline` (defaults + minimumImages chapitre).
 *   - couvertures (props / enemy / npc / cutaway / dialogue).
 *   - `focusBudget` complet (heroCenterRatio + violations).
 *   - shotPlan narratif lisible (`buildChapterShotPlan`).
 *   - cutaway QA (`runCutawayQa`).
 *   - score `computePremiumReadinessScore`.
 */
import {
  buildChapterShotPlan,
  computeChapterFocusBudget,
  computePremiumReadinessScore,
  runCutawayQa,
  type PremiumReadinessCastContext,
} from "@manga-ai-studio/ai";
import {
  buildProductionPlanFromOutline,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";

type ProductionOutlineLike = Parameters<typeof buildProductionPlanFromOutline>[0];

export function buildEstimateProductionPlan(args: {
  productionOutline: ProductionOutlineLike;
  allBlueprints: PanelBlueprintPremium[];
  enrichedBeats: ReadonlyArray<{
    beatId: string;
    narrativeFacts?: ReadonlyArray<{ type: string }>;
  }>;
  chapterMinimumImages: number;
  premiumReadinessCast: PremiumReadinessCastContext | undefined;
  projectTitle: string | null;
  chapterTitle: string | null;
}) {
  const {
    productionOutline,
    allBlueprints,
    enrichedBeats,
    chapterMinimumImages,
    premiumReadinessCast,
    projectTitle,
    chapterTitle,
  } = args;

  const focusBudget = computeChapterFocusBudget(allBlueprints);
  const premiumReadinessScore = computePremiumReadinessScore(allBlueprints, premiumReadinessCast);

  return {
    // P2.1bis — propage `minimumImages` du chapitre dans le productionPlan
    // construit, sinon `buildProductionPlanFromOutline` retombe sur son défaut
    // interne (75) et le snapshot peut diverger de la colonne Chapter.minimumImages.
    ...buildProductionPlanFromOutline(productionOutline, { minimumImages: chapterMinimumImages }),
    panelBlueprints: allBlueprints,
    focusDistribution: focusBudget.focusDistribution,
    shotDistribution: focusBudget.shotDistribution,
    propCoverage: {
      covered: allBlueprints.flatMap((bp) => bp.requiredProps.map((p) => p.canonicalName)),
      missing: focusBudget.violations
        .filter((v) => v.type === "missing_prop_insert")
        .map((v) => v.message),
    },
    enemyCoverage: {
      panelCount: focusBudget.enemyFocusPanels,
      beatsCovered: enrichedBeats
        .filter((b) => b.narrativeFacts?.some((f) => f.type === "enemy_presence"))
        .map((b) => b.beatId),
    },
    npcCoverage: {
      panelCount: focusBudget.npcPanels,
      avgNpcCount:
        allBlueprints.length > 0
          ? allBlueprints.reduce((sum, bp) => sum + bp.requiredNpcCount, 0) / allBlueprints.length
          : 0,
    },
    cutawayCoverage: {
      count: focusBudget.cutawayCount,
      ratio: focusBudget.cutawayRatio,
    },
    dialogueAnchorCoverage: {
      anchored: allBlueprints.filter(
        (bp) => bp.dialogueCarrier === "speaker_visible" && bp.speakerAnchorCharacterId,
      ).length,
      floating: allBlueprints.filter(
        (bp) => bp.dialogueCarrier === "speaker_visible" && !bp.speakerAnchorCharacterId,
      ).length,
    },
    heroCenterRatio: focusBudget.heroCenterRatio,
    premiumReadinessScore,
    // P1.1 : on persiste l'intégralité du focusBudget (compteurs + violations)
    // pour que launch/route.ts puisse bloquer les chapitres trop héros-centrés
    // ou sans plan de coupe contractuel.
    focusBudget,
    // Sprint B — Shot plan narratif lisible avant génération.
    shotPlan: buildChapterShotPlan({
      projectTitle,
      chapterTitle,
      blueprints: allBlueprints,
    }),
    cutawayQa: runCutawayQa(allBlueprints),
  };
}
