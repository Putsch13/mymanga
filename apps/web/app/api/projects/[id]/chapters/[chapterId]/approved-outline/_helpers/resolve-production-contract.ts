import {
  productionOutlineSchema,
  productionPlanSchema,
  type ApprovedChapterOutline,
  type ProductionOutline,
  type ProductionPlan,
} from "@manga-ai-studio/core";

import { reconcileIncomingPremiumContract } from "@/lib/premium-chapter-contract";

type RebuiltContract = Awaited<
  ReturnType<
    typeof import("@/lib/premium-chapter-contract").buildPremiumChapterContractFromApprovedOutline
  >
>;

export interface ResolvedProductionContract {
  productionOutline: ProductionOutline;
  productionPlan: ProductionPlan;
  premiumMeta: Record<string, unknown>;
}

interface BuildPremiumMetaArgs {
  source: string;
  premiumReadinessScore: number | null | undefined;
  panelBlueprintsCount: number;
  heroCenterRatio: unknown;
  focusDistribution: unknown;
  propCoverage: unknown;
  enemyCoverage: unknown;
  npcCoverage: unknown;
  cutawayCoverage: unknown;
  dialogueAnchorCoverage: unknown;
  heroPremiumMeta: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

function buildPremiumMeta(args: BuildPremiumMetaArgs): Record<string, unknown> {
  return {
    source: args.source,
    premiumReadinessScore: args.premiumReadinessScore,
    panelBlueprintsCount: args.panelBlueprintsCount,
    heroCenterRatio: args.heroCenterRatio,
    focusDistribution: args.focusDistribution,
    propCoverage: args.propCoverage,
    enemyCoverage: args.enemyCoverage,
    npcCoverage: args.npcCoverage,
    cutawayCoverage: args.cutawayCoverage,
    dialogueAnchorCoverage: args.dialogueAnchorCoverage,
    ...args.extras,
    ...args.heroPremiumMeta,
  };
}

interface ResolveContractInput {
  rebuiltContract: RebuiltContract;
  approvedOutline: ApprovedChapterOutline;
  providedProductionOutline: unknown;
  providedProductionPlan: unknown;
  heroPremiumMeta: Record<string, unknown>;
  chapterId: string;
}

export function resolveProductionContract(
  input: ResolveContractInput,
): ResolvedProductionContract {
  const {
    rebuiltContract,
    approvedOutline,
    providedProductionOutline,
    providedProductionPlan,
    heroPremiumMeta,
    chapterId,
  } = input;

  if (providedProductionOutline && providedProductionPlan) {
    const parsedOutline = productionOutlineSchema.safeParse(
      providedProductionOutline,
    );
    const parsedPlan = productionPlanSchema.safeParse(providedProductionPlan);

    if (parsedOutline.success && parsedPlan.success) {
      const reconciled = reconcileIncomingPremiumContract({
        approvedOutline,
        incomingProductionOutline: parsedOutline.data,
        incomingProductionPlan: parsedPlan.data,
        rebuiltContract,
      });
      const reconciledPlan = reconciled.productionPlan;
      const panelBlueprintsCount = Array.isArray(reconciledPlan.panelBlueprints)
        ? reconciledPlan.panelBlueprints.length
        : 0;

      console.info(
        `[approved-outline] reconciled chapterId=${chapterId} `
        + `incomingBeats=${parsedOutline.data.beats.length} `
        + `rebuiltBeats=${rebuiltContract.productionOutline.beats.length} `
        + `panelBlueprintsCount=${panelBlueprintsCount} `
        + `premiumReadinessScore=${reconciledPlan.premiumReadinessScore ?? "n/a"}`,
      );

      return {
        productionOutline: reconciled.productionOutline,
        productionPlan: reconciled.productionPlan,
        premiumMeta: buildPremiumMeta({
          source: reconciled.productionOutline.source,
          premiumReadinessScore: reconciledPlan.premiumReadinessScore,
          panelBlueprintsCount,
          heroCenterRatio: reconciledPlan.heroCenterRatio,
          focusDistribution: reconciledPlan.focusDistribution,
          propCoverage: reconciledPlan.propCoverage,
          enemyCoverage: reconciledPlan.enemyCoverage,
          npcCoverage: reconciledPlan.npcCoverage,
          cutawayCoverage: reconciledPlan.cutawayCoverage,
          dialogueAnchorCoverage: reconciledPlan.dialogueAnchorCoverage,
          heroPremiumMeta,
          extras: { reconciled: true },
        }),
      };
    }

    return {
      productionOutline: rebuiltContract.productionOutline,
      productionPlan: rebuiltContract.productionPlan,
      premiumMeta: buildPremiumMeta({
        source: rebuiltContract.productionOutline.source,
        premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
        panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
        heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
        focusDistribution: rebuiltContract.coverage.focusDistribution,
        propCoverage: rebuiltContract.coverage.propCoverage,
        enemyCoverage: rebuiltContract.coverage.enemyCoverage,
        npcCoverage: rebuiltContract.coverage.npcCoverage,
        cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
        dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
        heroPremiumMeta,
        extras: { fallback: "server_rebuilt_invalid_client" },
      }),
    };
  }

  return {
    productionOutline: rebuiltContract.productionOutline,
    productionPlan: rebuiltContract.productionPlan,
    premiumMeta: buildPremiumMeta({
      source: rebuiltContract.productionOutline.source,
      premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
      panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
      heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
      focusDistribution: rebuiltContract.coverage.focusDistribution,
      propCoverage: rebuiltContract.coverage.propCoverage,
      enemyCoverage: rebuiltContract.coverage.enemyCoverage,
      npcCoverage: rebuiltContract.coverage.npcCoverage,
      cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
      dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
      heroPremiumMeta,
    }),
  };
}
