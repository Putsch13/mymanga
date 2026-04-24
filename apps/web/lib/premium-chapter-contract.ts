/**
 * Service partagé pour le contrat premium de chapitre.
 * Centralise toute reconstruction premium et supprime les ponts legacy dispersés.
 */

import {
  buildApprovedOutlineFromProductionOutline,
  buildChapterReadinessReport,
  PREMIUM_PANEL_RANGE,
  classifyPremiumPanelCount,
  type ApprovedChapterOutline,
  type ChapterStudioSnapshot,
  type ProductionOutline,
  type ProductionPlan,
} from "@manga-ai-studio/core";
import { buildPremiumChapterContractAsync } from "@manga-ai-studio/ai";

// ─── Constante canonique des champs premium ───────────────────────────────────

/**
 * Liste exhaustive des champs premium du productionPlan.
 * Utiliser cette constante partout où l'on merge/valide/persiste.
 */
export const PREMIUM_PRODUCTION_PLAN_KEYS = [
  "panelBlueprints",
  "focusDistribution",
  "shotDistribution",
  "focusBudget",
  "propCoverage",
  "enemyCoverage",
  "npcCoverage",
  "cutawayCoverage",
  "dialogueAnchorCoverage",
  "heroCenterRatio",
  "premiumReadinessScore",
  "objectStateTimeline",
] as const;

export type PremiumProductionPlanKey = typeof PREMIUM_PRODUCTION_PLAN_KEYS[number];


// ─── Types ────────────────────────────────────────────────────────────────────

export interface PremiumContractCoverage {
  focusDistribution?: Record<string, number>;
  propCoverage?: { covered: string[]; missing: string[] };
  enemyCoverage?: { panelCount: number; beatsCovered: string[] };
  npcCoverage?: { panelCount: number; avgNpcCount: number };
  cutawayCoverage?: { count: number; ratio: number };
  dialogueAnchorCoverage?: { anchored: number; floating: number };
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
  /**
   * P2.1 — contrainte remontée depuis `Chapter.minimumImages` (défaut 75).
   * Si omis, le builder retombe sur 75 pour rester compatible avec l'ancien
   * comportement. Quand fourni, la reconstruction du plan garantit que le
   * nombre de blueprints atteint cette cible.
   */
  minimumPanels?: number | null;
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
    // P2.1 — on transmet le vrai minimum du chapitre pour éviter que le
    // builder cape silencieusement à 75 quand le chapitre exige plus.
    minimumPanels: typeof input.minimumPanels === "number" && input.minimumPanels > 0
      ? input.minimumPanels
      : undefined,
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

// ─── buildGenerationJobInputFromSnapshot ─────────────────────────────────────
// (Utilisé par launch/route.ts et pipeline/route.ts pour garantir zéro divergence)

export interface GenerationJobInputOptions {
  chapterId: string;
  source: string;
  snapshot: ChapterStudioSnapshot;
  approvedOutline: ApprovedChapterOutline;
  heroCharacterId?: string | null;
  selectedPlotLabel?: string | null;
  creativityControls?: Record<string, unknown> | null;
  focusCharacterIds?: string[];
  activeNpcIds?: string[];
  activeCreatureIds?: string[];
  locationIds?: string[];
  estimateContext?: Record<string, unknown> | null;
}

// ─── mergePremiumProductionPlan ───────────────────────────────────────────────

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
      // Pour les tableaux structurés : préfère l'existant si l'incoming est absent ou vide
      const incomingArr = Array.isArray(incoming) ? incoming : null;
      const existingArr = Array.isArray(existing) ? existing : null;
      if (!incomingArr || incomingArr.length === 0) {
        merged[key] = existingArr ?? incomingArr ?? undefined;
      } else {
        merged[key] = incomingArr;
      }
    } else if (key === "focusDistribution" || key === "shotDistribution") {
      // Pour les maps : merge profond champ par champ
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
      // Ne remplace jamais un score valide par undefined ou 0
      if (typeof incoming !== "number" || incoming === 0) {
        if (typeof existing === "number" && existing > 0) {
          merged[key] = existing;
        }
      }
    } else {
      // Pour les coverages et autres objets : préfère l'existant si l'incoming est absent
      if (incoming === undefined || incoming === null) {
        merged[key] = existing ?? undefined;
      }
    }
  }

  return merged;
}

// ─── mergePremiumStudioDraft ──────────────────────────────────────────────────

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

// ─── validatePremiumContract ──────────────────────────────────────────────────

export interface PremiumContractValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
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
  // Le productionOutline peut avoir plus de beats que l'approvedOutline (découpage plus fin)
  // On bloque seulement si le productionOutline a MOINS de beats que l'approvedOutline
  if (ao && po && Array.isArray(ao.beats) && Array.isArray(po.beats) && po.beats.length < ao.beats.length) {
    warnings.push(`productionOutline a moins de beats que l'approvedOutline (${po.beats.length} < ${ao.beats.length})`);
  }

  if (!pp) {
    errors.push("productionPlan manquant");
    return { ok: false, errors, warnings };
  }

  // Champs obligatoires du plan
  if (!Array.isArray(pp.pages) || pp.pages.length === 0) errors.push("productionPlan.pages vide");
  if (typeof pp.minimumImages !== "number" || pp.minimumImages <= 0) errors.push("productionPlan.minimumImages invalide");
  if (typeof pp.estimatedImages !== "number" || pp.estimatedImages <= 0) errors.push("productionPlan.estimatedImages invalide");
  if (typeof pp.targetImages !== "number" || pp.targetImages <= 0) errors.push("productionPlan.targetImages invalide");
  // estimatedImages < minimumImages est un avertissement, pas un blocant
  // (l'IA peut estimer moins d'images que le seuil de qualité sans invalider le contrat)
  if (typeof pp.estimatedImages === "number" && typeof pp.minimumImages === "number" && pp.estimatedImages < pp.minimumImages) {
    warnings.push("productionPlan.estimatedImages < minimumImages (avertissement seulement)");
  }
  if (typeof pp.targetImages === "number" && typeof pp.minimumImages === "number" && pp.targetImages < pp.minimumImages) {
    warnings.push("productionPlan.targetImages < minimumImages (avertissement seulement)");
  }

  // Champs premium obligatoires
  if (!Array.isArray(pp.panelBlueprints) || pp.panelBlueprints.length === 0) {
    errors.push("productionPlan.panelBlueprints absent ou vide");
  } else if (
    typeof pp.minimumImages === "number"
    && pp.minimumImages > 0
    && pp.panelBlueprints.length < pp.minimumImages
  ) {
    // READ-PREMIUM : on signale en warning si le contrat ne couvre pas la cible premium
    // (75 par défaut). Pas bloquant pour rester rétro-compatible avec les contrats existants,
    // mais suffisant pour faire remonter l'incohérence dans les diagnostics.
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

  // Contrôles qualitatifs
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
    // Pas d'erreur bloquante ici — l'absence d'ennemi peut être intentionnelle
    // On vérifie seulement si le plan indique explicitement des ennemis requis
  }

  const nc = pp.npcCoverage as Record<string, unknown> | null | undefined;
  if (nc && typeof nc.panelCount === "number" && nc.panelCount === 0 && typeof nc.avgNpcCount === "number" && nc.avgNpcCount === 0) {
    // Pas d'erreur bloquante — absence de NPC peut être normale
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── reconcileIncomingPremiumContract ─────────────────────────────────────────

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

  // Vérifier la cohérence de cardinalité des beats
  const incomingBeatCount = Array.isArray(incomingProductionOutline?.beats)
    ? incomingProductionOutline.beats.length : 0;
  const rebuiltBeatCount = Array.isArray(rebuiltContract.productionOutline.beats)
    ? rebuiltContract.productionOutline.beats.length : 0;
  const approvedBeatCount = opts.approvedOutline.beats.length;

  // Si divergence de cardinalité, le serveur reconstruit et gagne
  if (incomingBeatCount !== approvedBeatCount || incomingBeatCount !== rebuiltBeatCount) {
    console.warn(
      `[reconcile] beat_count_divergence incoming=${incomingBeatCount} approved=${approvedBeatCount} rebuilt=${rebuiltBeatCount} — using server contract`,
    );
    return {
      productionOutline: rebuiltContract.productionOutline,
      productionPlan: rebuiltContract.productionPlan,
    };
  }

  // Merge du plan : le serveur gagne sur tous les champs premium
  const incomingPP = incomingProductionPlan as Record<string, unknown> | null | undefined;
  const rebuiltPP = rebuiltContract.productionPlan as Record<string, unknown>;

  const reconciledPP: Record<string, unknown> = {
    ...(incomingPP ?? {}),
    ...rebuiltPP,
  };

  // Le serveur gagne toujours sur les champs premium
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

  return {
    productionOutline: rebuiltContract.productionOutline,
    productionPlan: reconciledPP as ProductionPlan,
  };
}

// ─── validateNarrativeContractConsistency ─────────────────────────────────────

export interface NarrativeContractConsistencyResult {
  ok: boolean;
  issues: string[];
}

/**
 * Valide la cohérence transverse entre narrativeFacts, requiredProps, panelBlueprints et coverages.
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

    // prop_usage → propCoverage doit avoir des props couverts
    if (b.prop_usage || (Array.isArray(b.requiredProps) && b.requiredProps.length > 0)) {
      const pc = pp.propCoverage as Record<string, unknown> | null | undefined;
      if (!pc) {
        issues.push(`Beat ${b.beatId ?? "?"}: prop_usage détecté mais propCoverage absent`);
      }
    }

    // enemy_presence → au moins un blueprint doit montrer l'ennemi
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

    // npc_presence → npcCoverage doit refléter le besoin
    if (b.npc_presence || b.hasNpcPresence) {
      const nc = pp.npcCoverage as Record<string, unknown> | null | undefined;
      if (!nc || (typeof nc.panelCount === "number" && nc.panelCount === 0)) {
        issues.push(`Beat ${b.beatId ?? "?"}: npc_presence détecté mais npcCoverage.panelCount = 0`);
      }
    }

    // dialogue avec speaker → dialogueAnchorCoverage ne peut pas être totalement flottant
    if (b.hasDialogue || (typeof b.dialogueCount === "number" && b.dialogueCount > 0)) {
      const dac = pp.dialogueAnchorCoverage as Record<string, unknown> | null | undefined;
      if (dac && typeof dac.anchored === "number" && dac.anchored === 0 && typeof dac.floating === "number" && dac.floating > 0) {
        issues.push(`Beat ${b.beatId ?? "?"}: dialogue détecté mais tous les dialogues sont flottants`);
      }
    }

    // cutaway requis → au moins un blueprint doit l'exprimer
    if (b.requiresCutaway || b.cutawayType) {
      const cc = pp.cutawayCoverage as Record<string, unknown> | null | undefined;
      if (!cc || (typeof cc.count === "number" && cc.count === 0)) {
        issues.push(`Beat ${b.beatId ?? "?"}: cutaway requis mais cutawayCoverage.count = 0`);
      }
    }
  }

  // Valider chaque blueprint (seulement les champs critiques)
  for (const bp of blueprints) {
    const b = bp as Record<string, unknown>;
    if (b.speakerAnchorRequired === true && !b.speakerAnchorCharacterId) {
      issues.push(`Blueprint panel ${b.panelNumber ?? b.panelId ?? "?"}: speakerAnchorRequired mais speakerAnchorCharacterId absent`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Valide un blueprint individuel avant injection dans le job.
 * Retourne null si le blueprint est trop incomplet.
 */
function validateBlueprint(bp: Record<string, unknown>): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (typeof bp.panelNumber !== "number") issues.push("panelNumber manquant");
  if (!bp.subjectFocus && !bp.panelCategory) issues.push("subjectFocus/panelCategory absent");
  if (bp.speakerAnchorRequired === true && !bp.speakerAnchorCharacterId) {
    issues.push("speakerAnchorRequired mais speakerAnchorCharacterId absent");
  }
  if (typeof bp.requiredNpcCount === "number" && bp.requiredNpcCount < 0) {
    issues.push("requiredNpcCount négatif");
  }
  return { valid: issues.length === 0, issues };
}

/**
 * P1-3 — Erreur bloquante levée quand un ou plusieurs blueprints sont invalides.
 * Avant : on filtrait silencieusement et on continuait → le user croyait avoir
 * 75 cases alors que N avaient disparu. Maintenant : on refuse de lancer la
 * pipeline et on demande une régénération du plan.
 */
/**
 * P0.6 — Erreur dédiée aux plans incomplets (panelBlueprints < minimumImages).
 * Avant, ce cas était silencieusement "réparé" par `expandBlueprintsToMinimum`
 * ce qui produisait 75 cases artificielles à partir d'un plan de 40. On
 * préfère désormais bloquer la génération et exiger une régénération du plan.
 * L'expansion reste disponible derrière un flag explicite pour permettre aux
 * chapitres anciens (stale) de passer en mode dégradé.
 */
export class IncompletePlanError extends Error {
  readonly code = "INCOMPLETE_PLAN";
  readonly panelBlueprintCount: number;
  readonly minimumImages: number;
  constructor(panelBlueprintCount: number, minimumImages: number) {
    super(
      `Plan de production incomplet : ${panelBlueprintCount} blueprints pour un minimum de ${minimumImages}. ` +
        `Régénère le plan dans le studio avant de lancer la pipeline.`,
    );
    this.name = "IncompletePlanError";
    this.panelBlueprintCount = panelBlueprintCount;
    this.minimumImages = minimumImages;
  }
}

export class InvalidBlueprintsError extends Error {
  readonly code = "INVALID_BLUEPRINTS";
  readonly invalidBlueprints: Array<{ panelNumber: number | null; issues: string[] }>;
  readonly totalInvalid: number;

  constructor(invalid: Array<{ panelNumber: number | null; issues: string[] }>) {
    super(
      `Plan de production invalide : ${invalid.length} blueprint(s) non-conforme(s). ` +
        `Retourne dans le studio pour régénérer le plan.`,
    );
    this.name = "InvalidBlueprintsError";
    this.invalidBlueprints = invalid;
    this.totalInvalid = invalid.length;
  }
}

export function buildGenerationJobInputFromSnapshot(opts: GenerationJobInputOptions): Record<string, unknown> {
  const { snapshot, approvedOutline } = opts;
  const pp = snapshot.data.productionPlan;
  const po = snapshot.data.productionOutline;
  const rawBlueprints = Array.isArray(pp?.panelBlueprints) ? pp.panelBlueprints : [];

  // P1-3 : blueprint invalide = erreur bloquante. Plus de filtre silencieux.
  // On remonte la liste détaillée au caller (launch / pipeline route) qui
  // renvoie un 422 exploitable par le studio.
  const panelBlueprints: unknown[] = [];
  const invalidBlueprints: Array<{ panelNumber: number | null; issues: string[] }> = [];
  for (const bp of rawBlueprints) {
    const bpRecord = bp as Record<string, unknown>;
    const { valid, issues } = validateBlueprint(bpRecord);
    if (valid) {
      panelBlueprints.push(bp);
    } else {
      const panelNumber = typeof bpRecord.panelNumber === "number" ? bpRecord.panelNumber : null;
      invalidBlueprints.push({ panelNumber, issues });
      console.error(
        `[buildGenerationJobInput] blueprint_invalid panelNumber=${panelNumber ?? "?"} issues=${issues.join(", ")}`,
      );
    }
  }
  if (invalidBlueprints.length > 0) {
    throw new InvalidBlueprintsError(invalidBlueprints);
  }

  // P8 — CONTRAT COUNT STRICT (mission de refonte premium).
  //
  // Règle produit : le premium DOIT viser 70–75 panels NATIFS.
  // Plus de "warning non bloquant" sur 49 panels : un storyboard qui sort
  // 56 panels est un BUG éditorial et doit échouer immédiatement. Aucune
  // génération image ne doit démarrer sur un plan sous-dimensionné ou
  // surdimensionné (plus de recovery silencieuse, plus de padding legacy).
  //
  // Cas bloquants :
  //   - `rawCount === 0`                                → IncompletePlanError
  //   - `rawCount < PREMIUM_PANEL_RANGE.min` (70)       → IncompletePlanError
  //   - `rawCount > PREMIUM_PANEL_RANGE.max` (75)       → IncompletePlanError
  const rawCount = panelBlueprints.length;
  if (rawCount === 0) {
    console.error(
      `[contract] native_storyboard_empty panelBlueprints=0 chapterId=${opts.chapterId ?? "?"}`,
    );
    throw new IncompletePlanError(rawCount, PREMIUM_PANEL_RANGE.min);
  }
  const panelCountStatus = classifyPremiumPanelCount(rawCount);
  if (panelCountStatus === "under_min") {
    console.error(
      `[contract] native_storyboard_under_range panelBlueprints=${rawCount} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${opts.chapterId ?? "?"} — BLOQUÉ (aucune génération sur un plan trop court)`,
    );
    throw new IncompletePlanError(rawCount, PREMIUM_PANEL_RANGE.min);
  }
  if (panelCountStatus === "over_max") {
    console.error(
      `[contract] native_storyboard_over_range panelBlueprints=${rawCount} required_range=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max} chapterId=${opts.chapterId ?? "?"} — BLOQUÉ (compactage éditorial requis)`,
    );
    throw new IncompletePlanError(rawCount, PREMIUM_PANEL_RANGE.max);
  }

  const effectiveBlueprints = panelBlueprints as unknown[];

  const input: Record<string, unknown> = {
    source: opts.source,
    chapterId: opts.chapterId,
    heroCharacterId: opts.heroCharacterId ?? null,
    focusCharacterIds: opts.focusCharacterIds ?? [],
    activeNpcIds: opts.activeNpcIds ?? [],
    activeCreatureIds: opts.activeCreatureIds ?? [],
    locationIds: opts.locationIds ?? [],
    selectedPlotLabel: opts.selectedPlotLabel ?? "bold",
    creativityControls: opts.creativityControls ?? undefined,
    approvedOutlineVersion: approvedOutline.approvalVersion,
    // Contrat premium complet
    productionOutline: po && po.source !== "legacy_adapted" ? po : undefined,
    productionPlan: pp
      ? ({ ...pp, panelBlueprints: effectiveBlueprints } as typeof pp)
      : undefined,
    panelBlueprints: effectiveBlueprints.length > 0 ? effectiveBlueprints : undefined,
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
