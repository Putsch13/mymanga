/**
 * Construction du `generationJobInput` à partir d'un snapshot validé +
 * erreurs hard-fail associées (`IncompletePlanError`,
 * `InvalidBlueprintsError`). Extrait de
 * `apps/web/lib/premium-chapter-contract.ts` (audit-v9).
 */

import {
  PREMIUM_PANEL_RANGE,
  buildPanelTraceabilityReport,
  classifyPremiumPanelCount,
  computeNarrativeMemoryDigestFromOutline,
  hydratePanelProvenanceOnBlueprints,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import type { GenerationJobInputOptions } from "./types";

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
 * P0.6 — Erreur dédiée aux plans incomplets (panelBlueprints < minimumImages).
 * Avant, ce cas était silencieusement "réparé" par `expandBlueprintsToMinimum`
 * ce qui produisait 75 cases artificielles à partir d'un plan de 40. On
 * préfère désormais bloquer la génération et exiger une régénération du plan.
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

/**
 * P1-3 — Erreur bloquante levée quand un ou plusieurs blueprints sont invalides.
 * Avant : on filtrait silencieusement et on continuait → le user croyait avoir
 * 75 cases alors que N avaient disparu. Maintenant : on refuse de lancer la
 * pipeline et on demande une régénération du plan.
 */
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

  const narrativeDigest = computeNarrativeMemoryDigestFromOutline(po);
  const hydratedBlueprints = hydratePanelProvenanceOnBlueprints(
    effectiveBlueprints as PanelBlueprintPremium[],
    { narrativeMemoryDigest: narrativeDigest },
  );
  const panelTraceability = buildPanelTraceabilityReport(hydratedBlueprints);

  const input: Record<string, unknown> = {
    source: opts.source,
    chapterId: opts.chapterId,
    heroCharacterId: opts.heroCharacterId ?? null,
    secondaryHeroCharacterId: opts.secondaryHeroCharacterId ?? null,
    focusCharacterIds: opts.focusCharacterIds ?? [],
    activeNpcIds: opts.activeNpcIds ?? [],
    activeCreatureIds: opts.activeCreatureIds ?? [],
    locationIds: opts.locationIds ?? [],
    selectedPlotLabel: opts.selectedPlotLabel ?? "bold",
    creativityControls: opts.creativityControls ?? undefined,
    approvedOutlineVersion: approvedOutline.approvalVersion,
    productionOutline: po && po.source !== "legacy_adapted" ? po : undefined,
    productionPlan: pp
      ? ({ ...pp, panelBlueprints: hydratedBlueprints } as typeof pp)
      : undefined,
    panelBlueprints: hydratedBlueprints.length > 0 ? hydratedBlueprints : undefined,
    premiumReadinessScore: typeof pp?.premiumReadinessScore === "number" ? pp.premiumReadinessScore : undefined,
    focusBudget: pp?.focusBudget ?? undefined,
    focusDistribution: pp?.focusDistribution ?? undefined,
    propCoverage: pp?.propCoverage ?? undefined,
    enemyCoverage: pp?.enemyCoverage ?? undefined,
    npcCoverage: pp?.npcCoverage ?? undefined,
    cutawayCoverage: pp?.cutawayCoverage ?? undefined,
    dialogueAnchorCoverage: pp?.dialogueAnchorCoverage ?? undefined,
    heroCenterRatio: typeof pp?.heroCenterRatio === "number" ? pp.heroCenterRatio : undefined,
    productionPlanPages: Array.isArray(pp?.pages) ? pp.pages : undefined,
    productionPlanCriticalPanels: Array.isArray(pp?.criticalPanels) ? pp.criticalPanels : undefined,
    productionPlanLockedCharacters: Array.isArray(pp?.lockedCharacters) ? pp.lockedCharacters : undefined,
    productionPlanImageBudgetStatus: pp?.imageBudgetStatus ?? undefined,
    panelTraceability,
    estimateContext: opts.estimateContext ?? null,
  };

  if (snapshot.data.pipelinePreferences?.sceneDialogueEnrich === true) {
    input.sceneDialogueEnrich = true;
  }

  const intent = snapshot.data.chapterIntentContract;
  if (intent != null && typeof intent === "object" && !Array.isArray(intent)) {
    input.chapterIntentContract = intent as Record<string, unknown>;
  }
  const pVw = snapshot.data.visualWorldContract;
  if (pVw != null && typeof pVw === "object" && !Array.isArray(pVw)) {
    input.persistedVisualWorldContract = pVw as Record<string, unknown>;
  }
  const dialogue = snapshot.data.chapterDialogueContract;
  if (dialogue != null && typeof dialogue === "object" && !Array.isArray(dialogue)) {
    input.chapterDialogueContract = dialogue as Record<string, unknown>;
  }

  return input;
}
