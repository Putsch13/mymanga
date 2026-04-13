/**
 * Service partagé pour le contrat premium de chapitre.
 * Centralise toute reconstruction premium et supprime les ponts legacy dispersés.
 */

import {
  buildApprovedOutlineFromProductionOutline,
  buildChapterReadinessReport,
  type ApprovedChapterOutline,
  type ChapterStudioSnapshot,
  type ProductionOutline,
  type ProductionPlan,
} from "@manga-ai-studio/core";
import { buildPremiumChapterContractAsync } from "@manga-ai-studio/ai";


// ─── Types ────────────────────────────────────────────────────────────────────

export interface PremiumContractCoverage {
  focusDistribution?: Record<string, number>;
  propCoverage?: { coveredCount: number; totalCount: number; ratio: number };
  enemyCoverage?: { coveredCount: number; totalCount: number; ratio: number };
  npcCoverage?: { coveredCount: number; totalCount: number; ratio: number };
  cutawayCoverage?: { coveredCount: number; totalCount: number; ratio: number };
  dialogueAnchorCoverage?: { coveredCount: number; totalCount: number; ratio: number };
  heroCenterRatio?: number;
  premiumReadinessScore?: number;
}

export interface PremiumChapterContractResult {
  productionOutline: ProductionOutline;
  productionPlan: ProductionPlan;
  readinessReport: ReturnType<typeof buildChapterReadinessReport> | null;
  panelBlueprints: unknown[];
  coverage: PremiumContractCoverage;
}

export interface BuildPremiumContractInput {
  approvedOutline: ApprovedChapterOutline;
  projectGenre?: string | null;
  projectTone?: string | null;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  cliffhanger?: string | null;
  userIntent?: string | null;
  heroCharacterId?: string | null;
  existingStudioData?: Record<string, unknown> | null;
}

// ─── buildPremiumChapterContractFromApprovedOutline ───────────────────────────

/**
 * Reconstruit le contrat premium complet depuis un approvedOutline.
 * Utilise l'enrichissement LLM si disponible.
 */
export async function buildPremiumChapterContractFromApprovedOutline(
  input: BuildPremiumContractInput,
): Promise<PremiumChapterContractResult> {
  const raw = await buildPremiumChapterContractAsync({
    approvedOutline: input.approvedOutline,
    heroCharacterId: input.heroCharacterId ?? null,
    projectGenre: input.projectGenre ?? null,
    projectTone: input.projectTone ?? null,
  });

  const productionOutline = raw.productionOutline as ProductionOutline;
  const productionPlan = raw.productionPlan as ProductionPlan;
  const panelBlueprints = Array.isArray(productionPlan?.panelBlueprints)
    ? productionPlan.panelBlueprints
    : [];

  const coverage: PremiumContractCoverage = {
    focusDistribution: productionPlan?.focusDistribution as Record<string, number> | undefined,
    propCoverage: productionPlan?.propCoverage as PremiumContractCoverage["propCoverage"],
    enemyCoverage: productionPlan?.enemyCoverage as PremiumContractCoverage["enemyCoverage"],
    npcCoverage: productionPlan?.npcCoverage as PremiumContractCoverage["npcCoverage"],
    cutawayCoverage: productionPlan?.cutawayCoverage as PremiumContractCoverage["cutawayCoverage"],
    dialogueAnchorCoverage: productionPlan?.dialogueAnchorCoverage as PremiumContractCoverage["dialogueAnchorCoverage"],
    heroCenterRatio: typeof productionPlan?.heroCenterRatio === "number" ? productionPlan.heroCenterRatio : undefined,
    premiumReadinessScore: typeof productionPlan?.premiumReadinessScore === "number" ? productionPlan.premiumReadinessScore : undefined,
  };

  return {
    productionOutline,
    productionPlan,
    readinessReport: null,
    panelBlueprints,
    coverage,
  };
}

// ─── mergePremiumContractIntoSnapshot ─────────────────────────────────────────

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
      productionPlan: {
        ...existingData.productionPlan,
        ...premiumContract.productionPlan,
        panelBlueprints: premiumContract.panelBlueprints.length > 0
          ? premiumContract.panelBlueprints as ProductionPlan["panelBlueprints"]
          : existingData.productionPlan?.panelBlueprints,
        focusDistribution: premiumContract.coverage.focusDistribution ?? existingData.productionPlan?.focusDistribution,
        propCoverage: (premiumContract.coverage.propCoverage ?? existingData.productionPlan?.propCoverage) as ProductionPlan["propCoverage"],
        enemyCoverage: (premiumContract.coverage.enemyCoverage ?? existingData.productionPlan?.enemyCoverage) as ProductionPlan["enemyCoverage"],
        npcCoverage: (premiumContract.coverage.npcCoverage ?? existingData.productionPlan?.npcCoverage) as ProductionPlan["npcCoverage"],
        cutawayCoverage: (premiumContract.coverage.cutawayCoverage ?? existingData.productionPlan?.cutawayCoverage) as ProductionPlan["cutawayCoverage"],
        dialogueAnchorCoverage: (premiumContract.coverage.dialogueAnchorCoverage ?? existingData.productionPlan?.dialogueAnchorCoverage) as ProductionPlan["dialogueAnchorCoverage"],
        heroCenterRatio: premiumContract.coverage.heroCenterRatio ?? existingData.productionPlan?.heroCenterRatio,
        premiumReadinessScore: premiumContract.coverage.premiumReadinessScore ?? existingData.productionPlan?.premiumReadinessScore,
      },
      // Préserver les champs enrichis premium existants
      characterSelection: existingData.characterSelection,
      narrativeContract: existingData.narrativeContract,
      projectCanon: existingData.projectCanon,
      characterCanons: existingData.characterCanons,
      locationCanons: existingData.locationCanons,
    },
  };
}

// ─── resolveApprovedOutlineFromSnapshot ───────────────────────────────────────

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

// ─── assertPremiumContract ────────────────────────────────────────────────────

export interface PremiumContractAssertionResult {
  ok: boolean;
  missing: string[];
  message: string;
}

/**
 * Vérifie que le snapshot contient un contrat premium complet avant génération.
 * Retourne { ok: false, missing, message } si incomplet.
 */
export function assertPremiumContract(
  snapshot: ChapterStudioSnapshot,
  outlineRecord: Record<string, unknown>,
): PremiumContractAssertionResult {
  const missing: string[] = [];

  // Vérifier approvedOutline
  const ao = outlineRecord.approvedOutline as Record<string, unknown> | undefined;
  if (!ao || !Array.isArray(ao.beats) || ao.beats.length === 0) {
    missing.push("approvedOutline.beats");
  }

  // Vérifier productionOutline
  const po = snapshot.data.productionOutline;
  if (!po || !Array.isArray(po.beats) || po.beats.length === 0) {
    missing.push("productionOutline.beats");
  }

  // Vérifier productionPlan
  const pp = snapshot.data.productionPlan;
  if (!pp) {
    missing.push("productionPlan");
  } else {
    if (!Array.isArray(pp.pages) || pp.pages.length === 0) {
      missing.push("productionPlan.pages");
    }
    if (typeof pp.minimumImages !== "number" || pp.minimumImages <= 0) {
      missing.push("productionPlan.minimumImages");
    }
    if (typeof pp.estimatedImages !== "number" || pp.estimatedImages <= 0) {
      missing.push("productionPlan.estimatedImages");
    }
    if (typeof pp.targetImages !== "number" || pp.targetImages <= 0) {
      missing.push("productionPlan.targetImages");
    }
  }

  // Vérifier cohérence beats
  if (ao && po && Array.isArray(ao.beats) && Array.isArray(po.beats)) {
    if (ao.beats.length !== po.beats.length) {
      missing.push(`beats_count_mismatch(approvedOutline=${ao.beats.length} vs productionOutline=${po.beats.length})`);
    }
  }

  // Vérifier heroCenterRatio
  if (pp && typeof pp.heroCenterRatio === "number" && pp.heroCenterRatio > 0.7) {
    const hasHeroCentricTag = Array.isArray(pp.pages) && pp.pages.some(
      (p: Record<string, unknown>) => typeof p === "object" && String(p.tag ?? "").includes("hero_centric_scene"),
    );
    if (!hasHeroCentricTag) {
      missing.push(`heroCenterRatio_too_high(${pp.heroCenterRatio.toFixed(2)} > 0.7 without hero_centric_scene tag)`);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: "Le chapitre n'a pas encore un contrat premium complet. Retourne dans le studio et régénère le plan.",
    };
  }

  return { ok: true, missing: [], message: "Contrat premium valide." };
}

// ─── buildGenerationJobInputFromSnapshot ─────────────────────────────────────
// (Utilisé par launch/route.ts et pipeline/route.ts pour garantir zéro divergence)

export interface GenerationJobInputOptions {
  chapterId: string;
  source: string;
  snapshot: ChapterStudioSnapshot;
  approvedOutline: ApprovedChapterOutline;
  selectedPlotLabel?: string | null;
  creativityControls?: Record<string, unknown> | null;
  focusCharacterIds?: string[];
  estimateContext?: Record<string, unknown> | null;
}

export function buildGenerationJobInputFromSnapshot(opts: GenerationJobInputOptions): Record<string, unknown> {
  const { snapshot, approvedOutline } = opts;
  const pp = snapshot.data.productionPlan;
  const po = snapshot.data.productionOutline;
  const panelBlueprints = Array.isArray(pp?.panelBlueprints) ? pp.panelBlueprints : [];

  const input: Record<string, unknown> = {
    source: opts.source,
    chapterId: opts.chapterId,
    focusCharacterIds: opts.focusCharacterIds ?? [],
    selectedPlotLabel: opts.selectedPlotLabel ?? "bold",
    creativityControls: opts.creativityControls ?? undefined,
    approvedOutlineVersion: approvedOutline.approvalVersion,
    // Contrat premium complet
    productionOutline: po && po.source !== "legacy_adapted" ? po : undefined,
    productionPlan: pp ?? undefined,
    panelBlueprints: panelBlueprints.length > 0 ? panelBlueprints : undefined,
    premiumReadinessScore: typeof pp?.premiumReadinessScore === "number" ? pp.premiumReadinessScore : undefined,
    focusBudget: pp?.focusBudget ?? undefined,
    focusDistribution: pp?.focusDistribution ?? undefined,
    propCoverage: pp?.propCoverage ?? undefined,
    enemyCoverage: pp?.enemyCoverage ?? undefined,
    npcCoverage: pp?.npcCoverage ?? undefined,
    cutawayCoverage: pp?.cutawayCoverage ?? undefined,
    dialogueAnchorCoverage: pp?.dialogueAnchorCoverage ?? undefined,
    heroCenterRatio: typeof pp?.heroCenterRatio === "number" ? pp.heroCenterRatio : undefined,
    // Pages et panels critiques pour le workflow image
    productionPlanPages: Array.isArray(pp?.pages) ? pp.pages : undefined,
    productionPlanCriticalPanels: Array.isArray(pp?.criticalPanels) ? pp.criticalPanels : undefined,
    productionPlanLockedCharacters: Array.isArray(pp?.lockedCharacters) ? pp.lockedCharacters : undefined,
    productionPlanImageBudgetStatus: pp?.imageBudgetStatus ?? undefined,
    // Traçabilité
    estimateContext: opts.estimateContext ?? null,
  };

  return input;
}
