/**
 * Merge / validate / assert / resolve du contrat premium chapitre.
 * Extrait de `apps/web/lib/premium-chapter-contract.ts` (audit-v9).
 */

import {
  buildApprovedOutlineFromProductionOutline,
  productionPlanSchema,
  type ApprovedChapterOutline,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import {
  PREMIUM_PRODUCTION_PLAN_KEYS,
  type PremiumChapterContractResult,
  type PremiumContractAssertionResult,
  type PremiumContractValidationResult,
} from "./types";

/**
 * Injecte le contrat premium dans un snapshot studio existant.
 * Préserve tout ce qui existe déjà si non contradictoire.
 */
export function mergePremiumContractIntoSnapshot(
  snapshot: ChapterStudioSnapshot,
  premiumContract: PremiumChapterContractResult,
): ChapterStudioSnapshot {
  const existingData = snapshot.data;

  return {
    ...snapshot,
    data: {
      ...existingData,
      productionOutline: premiumContract.productionOutline,
      productionPlan: (() => {
        const mergedPlanRaw = {
          ...existingData.productionPlan,
          ...premiumContract.productionPlan,
          panelBlueprints:
            premiumContract.panelBlueprints.length > 0
              ? premiumContract.panelBlueprints
              : existingData.productionPlan?.panelBlueprints,
          focusDistribution:
            premiumContract.coverage.focusDistribution ?? existingData.productionPlan?.focusDistribution,
          propCoverage: premiumContract.coverage.propCoverage ?? existingData.productionPlan?.propCoverage,
          enemyCoverage: premiumContract.coverage.enemyCoverage ?? existingData.productionPlan?.enemyCoverage,
          npcCoverage: premiumContract.coverage.npcCoverage ?? existingData.productionPlan?.npcCoverage,
          cutawayCoverage: premiumContract.coverage.cutawayCoverage ?? existingData.productionPlan?.cutawayCoverage,
          dialogueAnchorCoverage:
            premiumContract.coverage.dialogueAnchorCoverage ?? existingData.productionPlan?.dialogueAnchorCoverage,
          heroCenterRatio: premiumContract.coverage.heroCenterRatio ?? existingData.productionPlan?.heroCenterRatio,
          premiumReadinessScore:
            premiumContract.coverage.premiumReadinessScore ?? existingData.productionPlan?.premiumReadinessScore,
        };
        const merged = productionPlanSchema.safeParse(mergedPlanRaw);
        if (!merged.success) {
          console.warn(
            `[mergePremiumContractIntoSnapshot] production_plan_parse_failed: ${merged.error.message} — fallback server plan`,
          );
          return premiumContract.productionPlan;
        }
        return merged.data;
      })(),
      // Préserver les champs enrichis premium existants
      characterSelection: existingData.characterSelection,
      narrativeContract: existingData.narrativeContract,
      projectCanon: existingData.projectCanon,
      characterCanons: existingData.characterCanons,
      locationCanons: existingData.locationCanons,
      visualWorldContract: premiumContract.visualWorldContract ?? existingData.visualWorldContract,
    },
  };
}

/**
 * Résout l'approvedOutline depuis le snapshot ou l'outline record.
 * Ne fait jamais appel à un builder legacy.
 */
export function resolveApprovedOutlineFromSnapshot(
  snapshot: ChapterStudioSnapshot,
  outlineRecord: Record<string, unknown>,
): ApprovedChapterOutline | null {
  // Priorité 1 : approvedOutline persisté dans outline.approvedOutline
  if (outlineRecord.approvedOutline && typeof outlineRecord.approvedOutline === "object") {
    const ao = outlineRecord.approvedOutline as Record<string, unknown>;
    if (Array.isArray(ao.beats) && ao.beats.length > 0) {
      return outlineRecord.approvedOutline as ApprovedChapterOutline;
    }
  }

  // Priorité 2 : reconstruire depuis productionOutline premium
  const premiumOutline = snapshot.data.productionOutline;
  if (
    premiumOutline &&
    premiumOutline.source !== "legacy_adapted" &&
    Array.isArray(premiumOutline.beats) &&
    premiumOutline.beats.length > 0
  ) {
    return buildApprovedOutlineFromProductionOutline(snapshot);
  }

  return null;
}

/**
 * Vérifie que le snapshot contient un contrat premium complet avant génération.
 * Délègue à validatePremiumContract pour les vérifications structurées.
 * Retourne { ok: false, missing, message } si incomplet.
 */
export function assertPremiumContract(
  snapshot: ChapterStudioSnapshot,
  outlineRecord: Record<string, unknown>,
): PremiumContractAssertionResult {
  const validation = validatePremiumContract(snapshot, outlineRecord);

  if (!validation.ok) {
    return {
      ok: false,
      missing: validation.errors,
      message: "Le chapitre n'a pas encore un contrat premium complet. Retourne dans le studio et régénère le plan.",
    };
  }

  // Avertissements non bloquants (loggés mais ne bloquent pas le lancement)
  if (validation.warnings.length > 0) {
    console.warn(`[assertPremiumContract] warnings: ${validation.warnings.join("; ")}`);
  }

  return { ok: true, missing: [], message: "Contrat premium valide." };
}

/**
 * Fusionne deux productionPlan en préservant tous les champs premium de l'existant.
 * L'incoming gagne sur les champs non-premium ; l'existant gagne sur les champs premium si l'incoming est absent/vide.
 */
export function mergePremiumProductionPlan(
  existingPlan: Record<string, unknown> | null | undefined,
  incomingPlan: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!incomingPlan && !existingPlan) return {};
  if (!incomingPlan) return existingPlan ?? {};
  if (!existingPlan) return incomingPlan;

  const merged: Record<string, unknown> = { ...existingPlan, ...incomingPlan };

  for (const key of PREMIUM_PRODUCTION_PLAN_KEYS) {
    const incoming = incomingPlan[key];
    const existing = existingPlan[key];

    if (key === "panelBlueprints" || key === "objectStateTimeline") {
      const incomingArr = Array.isArray(incoming) ? incoming : null;
      const existingArr = Array.isArray(existing) ? existing : null;
      if (!incomingArr || incomingArr.length === 0) {
        merged[key] = existingArr ?? incomingArr ?? undefined;
      } else {
        merged[key] = incomingArr;
      }
    } else if (key === "focusDistribution" || key === "shotDistribution") {
      const incomingObj = incoming && typeof incoming === "object" && !Array.isArray(incoming)
        ? (incoming as Record<string, unknown>) : null;
      const existingObj = existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, unknown>) : null;
      if (!incomingObj || Object.keys(incomingObj).length === 0) {
        merged[key] = existingObj ?? undefined;
      } else {
        merged[key] = { ...(existingObj ?? {}), ...incomingObj };
      }
    } else if (key === "premiumReadinessScore" || key === "heroCenterRatio") {
      if (typeof incoming !== "number" || incoming === 0) {
        if (typeof existing === "number" && existing > 0) {
          merged[key] = existing;
        }
      }
    } else {
      if (incoming === undefined || incoming === null) {
        merged[key] = existing ?? undefined;
      }
    }
  }

  return merged;
}

/**
 * Fusionne deux studio data en préservant tous les champs premium existants.
 */
export function mergePremiumStudioDraft(
  existingDraft: Record<string, unknown> | null | undefined,
  incomingDraft: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!incomingDraft && !existingDraft) return {};
  if (!incomingDraft) return existingDraft ?? {};
  if (!existingDraft) return incomingDraft;

  const existingPP = existingDraft.productionPlan as Record<string, unknown> | null | undefined;
  const incomingPP = incomingDraft.productionPlan as Record<string, unknown> | null | undefined;

  return {
    ...existingDraft,
    ...incomingDraft,
    productionPlan: incomingPP
      ? mergePremiumProductionPlan(existingPP, incomingPP)
      : existingPP ?? undefined,
  };
}

/**
 * Valide le contrat premium de façon structurée (pour logs/UI/tests).
 * Retourne errors + warnings sans lever d'exception.
 */
export function validatePremiumContract(
  snapshot: ChapterStudioSnapshot,
  outlineRecord: Record<string, unknown>,
): PremiumContractValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ao = outlineRecord.approvedOutline as Record<string, unknown> | undefined;
  const po = snapshot.data.productionOutline;
  const pp = snapshot.data.productionPlan;

  // Beats
  if (!ao || !Array.isArray(ao.beats) || ao.beats.length === 0) {
    errors.push("approvedOutline.beats manquant ou vide");
  }
  if (!po || !Array.isArray(po.beats) || po.beats.length === 0) {
    errors.push("productionOutline.beats manquant ou vide");
  }
  if (ao && po && Array.isArray(ao.beats) && Array.isArray(po.beats) && po.beats.length < ao.beats.length) {
    warnings.push(`productionOutline a moins de beats que l'approvedOutline (${po.beats.length} < ${ao.beats.length})`);
  }

  if (!pp) {
    errors.push("productionPlan manquant");
    return { ok: false, errors, warnings };
  }

  if (!Array.isArray(pp.pages) || pp.pages.length === 0) errors.push("productionPlan.pages vide");
  if (typeof pp.minimumImages !== "number" || pp.minimumImages <= 0) errors.push("productionPlan.minimumImages invalide");
  if (typeof pp.estimatedImages !== "number" || pp.estimatedImages <= 0) errors.push("productionPlan.estimatedImages invalide");
  if (typeof pp.targetImages !== "number" || pp.targetImages <= 0) errors.push("productionPlan.targetImages invalide");
  if (typeof pp.estimatedImages === "number" && typeof pp.minimumImages === "number" && pp.estimatedImages < pp.minimumImages) {
    warnings.push("productionPlan.estimatedImages < minimumImages (avertissement seulement)");
  }
  if (typeof pp.targetImages === "number" && typeof pp.minimumImages === "number" && pp.targetImages < pp.minimumImages) {
    warnings.push("productionPlan.targetImages < minimumImages (avertissement seulement)");
  }

  if (!Array.isArray(pp.panelBlueprints) || pp.panelBlueprints.length === 0) {
    errors.push("productionPlan.panelBlueprints absent ou vide");
  } else if (
    typeof pp.minimumImages === "number"
    && pp.minimumImages > 0
    && pp.panelBlueprints.length < pp.minimumImages
  ) {
    warnings.push(
      `productionPlan.panelBlueprints.length=${pp.panelBlueprints.length} < minimumImages=${pp.minimumImages} (la génération produira moins de cases que promis)`,
    );
  }
  if (!pp.focusDistribution || Object.keys(pp.focusDistribution as object).length === 0) {
    errors.push("productionPlan.focusDistribution absent");
  }
  if (!pp.dialogueAnchorCoverage) errors.push("productionPlan.dialogueAnchorCoverage absent");
  if (!pp.propCoverage) errors.push("productionPlan.propCoverage absent");
  if (!pp.enemyCoverage) errors.push("productionPlan.enemyCoverage absent");
  if (!pp.npcCoverage) errors.push("productionPlan.npcCoverage absent");
  if (!pp.cutawayCoverage) errors.push("productionPlan.cutawayCoverage absent");
  if (typeof pp.heroCenterRatio !== "number") errors.push("productionPlan.heroCenterRatio absent");
  if (typeof pp.premiumReadinessScore !== "number") errors.push("productionPlan.premiumReadinessScore absent");

  if (typeof pp.heroCenterRatio === "number" && pp.heroCenterRatio > 0.8) {
    const hasTag = Array.isArray(pp.pages) && pp.pages.some(
      (p: Record<string, unknown>) => typeof p === "object" && String(p.tag ?? "").includes("hero_centric_scene"),
    );
    if (!hasTag) warnings.push(`heroCenterRatio trop élevé (${pp.heroCenterRatio.toFixed(2)} > 0.8) sans tag hero_centric_scene`);
  }

  const dac = pp.dialogueAnchorCoverage as Record<string, unknown> | null | undefined;
  if (dac && typeof dac.anchored === "number" && dac.anchored === 0) {
    const hasDialogueBeats = Array.isArray(po?.beats) && po.beats.some(
      (b: Record<string, unknown>) => typeof b === "object" && (b.hasDialogue === true || (typeof b.dialogueCount === "number" && b.dialogueCount > 0)),
    );
    if (hasDialogueBeats) warnings.push("dialogueAnchorCoverage.anchored = 0 alors que des beats dialogue existent");
  }

  const pc = pp.propCoverage as Record<string, unknown> | null | undefined;
  if (pc && Array.isArray(pc.covered) && pc.covered.length === 0 && Array.isArray(pc.missing) && pc.missing.length === 0) {
    const hasProps = Array.isArray(po?.beats) && po.beats.some(
      (b: Record<string, unknown>) => typeof b === "object" && Array.isArray(b.requiredProps) && b.requiredProps.length > 0,
    );
    if (hasProps) warnings.push("propCoverage vide alors que des beats ont des requiredProps");
  }

  const ec = pp.enemyCoverage as Record<string, unknown> | null | undefined;
  if (ec && Array.isArray(ec.beatsCovered) && ec.beatsCovered.length === 0 && typeof ec.panelCount === "number" && ec.panelCount === 0) {
    // pas d'erreur bloquante : absence d'ennemi peut être intentionnelle
  }

  const nc = pp.npcCoverage as Record<string, unknown> | null | undefined;
  if (nc && typeof nc.panelCount === "number" && nc.panelCount === 0 && typeof nc.avgNpcCount === "number" && nc.avgNpcCount === 0) {
    // pas d'erreur bloquante : absence de NPC peut être normale
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
