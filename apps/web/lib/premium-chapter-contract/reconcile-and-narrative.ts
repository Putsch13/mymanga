/**
 * Réconciliation client/serveur + cohérence narrative pour le contrat
 * premium chapitre. Extrait de
 * `apps/web/lib/premium-chapter-contract.ts` (audit-v9).
 */

import {
  productionPlanSchema,
  type ApprovedChapterOutline,
  type ChapterStudioSnapshot,
  type ProductionOutline,
  type ProductionPlan,
} from "@manga-ai-studio/core";
import {
  PREMIUM_PRODUCTION_PLAN_KEYS,
  type NarrativeContractConsistencyResult,
  type PremiumChapterContractResult,
} from "./types";

/**
 * Réconcilie un contrat client avec un contrat serveur recalculé.
 * Le serveur gagne toujours sur les champs premium visuels.
 * Le client peut garder des données éditoriales non destructrices.
 */
export function reconcileIncomingPremiumContract(opts: {
  approvedOutline: ApprovedChapterOutline;
  incomingProductionOutline: ProductionOutline | null | undefined;
  incomingProductionPlan: ProductionPlan | null | undefined;
  rebuiltContract: PremiumChapterContractResult;
}): { productionOutline: ProductionOutline; productionPlan: ProductionPlan } {
  const { incomingProductionOutline, incomingProductionPlan, rebuiltContract } = opts;

  const incomingBeatCount = Array.isArray(incomingProductionOutline?.beats)
    ? incomingProductionOutline.beats.length : 0;
  const rebuiltBeatCount = Array.isArray(rebuiltContract.productionOutline.beats)
    ? rebuiltContract.productionOutline.beats.length : 0;
  const approvedBeatCount = opts.approvedOutline.beats.length;

  if (incomingBeatCount !== approvedBeatCount || incomingBeatCount !== rebuiltBeatCount) {
    console.warn(
      `[reconcile] beat_count_divergence incoming=${incomingBeatCount} approved=${approvedBeatCount} rebuilt=${rebuiltBeatCount} — using server contract`,
    );
    return {
      productionOutline: rebuiltContract.productionOutline,
      productionPlan: rebuiltContract.productionPlan,
    };
  }

  const incomingPP = incomingProductionPlan as Record<string, unknown> | null | undefined;
  const rebuiltPP = rebuiltContract.productionPlan as Record<string, unknown>;

  const reconciledPP: Record<string, unknown> = {
    ...(incomingPP ?? {}),
    ...rebuiltPP,
  };

  for (const key of PREMIUM_PRODUCTION_PLAN_KEYS) {
    const serverValue = rebuiltPP[key];
    const isServerValueMeaningful =
      serverValue !== undefined && serverValue !== null &&
      !(Array.isArray(serverValue) && serverValue.length === 0) &&
      !(typeof serverValue === "object" && !Array.isArray(serverValue) && Object.keys(serverValue as object).length === 0);

    if (isServerValueMeaningful) {
      reconciledPP[key] = serverValue;
    }
  }

  const reconciledParsed = productionPlanSchema.safeParse(reconciledPP);
  if (!reconciledParsed.success) {
    console.warn(
      `[reconcileIncomingPremiumContract] production_plan_parse_failed: ${reconciledParsed.error.message} — using server plan`,
    );
    return {
      productionOutline: rebuiltContract.productionOutline,
      productionPlan: rebuiltContract.productionPlan,
    };
  }

  return {
    productionOutline: rebuiltContract.productionOutline,
    productionPlan: reconciledParsed.data,
  };
}

/**
 * Valide la cohérence transverse entre narrativeFacts, requiredProps,
 * panelBlueprints et coverages.
 */
export function validateNarrativeContractConsistency(
  snapshot: ChapterStudioSnapshot,
): NarrativeContractConsistencyResult {
  const issues: string[] = [];
  const pp = snapshot.data.productionPlan;
  const po = snapshot.data.productionOutline;

  if (!pp || !po) return { ok: true, issues: [] };

  const beats = Array.isArray(po.beats) ? po.beats : [];
  const blueprints = Array.isArray(pp.panelBlueprints) ? pp.panelBlueprints : [];

  for (const beat of beats) {
    const b = beat as Record<string, unknown>;

    if (b.prop_usage || (Array.isArray(b.requiredProps) && b.requiredProps.length > 0)) {
      const pc = pp.propCoverage as Record<string, unknown> | null | undefined;
      if (!pc) {
        issues.push(`Beat ${b.beatId ?? "?"}: prop_usage détecté mais propCoverage absent`);
      }
    }

    if (b.enemy_presence || b.hasEnemyPresence) {
      const ec = pp.enemyCoverage as Record<string, unknown> | null | undefined;
      if (!ec || (typeof ec.panelCount === "number" && ec.panelCount === 0)) {
        issues.push(`Beat ${b.beatId ?? "?"}: enemy_presence détecté mais enemyCoverage.panelCount = 0`);
      }
      const beatBlueprints = blueprints.filter(
        (bp: Record<string, unknown>) => bp.beatId === b.beatId,
      );
      const hasEnemyBlueprint = beatBlueprints.some(
        (bp: Record<string, unknown>) => bp.mustShowEnemy === true,
      );
      if (beatBlueprints.length > 0 && !hasEnemyBlueprint) {
        issues.push(`Beat ${b.beatId ?? "?"}: enemy_presence requis mais aucun blueprint mustShowEnemy`);
      }
    }

    if (b.npc_presence || b.hasNpcPresence) {
      const nc = pp.npcCoverage as Record<string, unknown> | null | undefined;
      if (!nc || (typeof nc.panelCount === "number" && nc.panelCount === 0)) {
        issues.push(`Beat ${b.beatId ?? "?"}: npc_presence détecté mais npcCoverage.panelCount = 0`);
      }
    }

    if (b.hasDialogue || (typeof b.dialogueCount === "number" && b.dialogueCount > 0)) {
      const dac = pp.dialogueAnchorCoverage as Record<string, unknown> | null | undefined;
      if (dac && typeof dac.anchored === "number" && dac.anchored === 0 && typeof dac.floating === "number" && dac.floating > 0) {
        issues.push(`Beat ${b.beatId ?? "?"}: dialogue détecté mais tous les dialogues sont flottants`);
      }
    }

    if (b.requiresCutaway || b.cutawayType) {
      const cc = pp.cutawayCoverage as Record<string, unknown> | null | undefined;
      if (!cc || (typeof cc.count === "number" && cc.count === 0)) {
        issues.push(`Beat ${b.beatId ?? "?"}: cutaway requis mais cutawayCoverage.count = 0`);
      }
    }
  }

  for (const bp of blueprints) {
    const b = bp as Record<string, unknown>;
    if (b.speakerAnchorRequired === true && !b.speakerAnchorCharacterId) {
      issues.push(`Blueprint panel ${b.panelNumber ?? b.panelId ?? "?"}: speakerAnchorRequired mais speakerAnchorCharacterId absent`);
    }
  }

  return { ok: issues.length === 0, issues };
}
