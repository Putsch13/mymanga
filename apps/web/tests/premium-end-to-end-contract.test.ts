/**
 * Test de non-régression end-to-end du contrat premium.
 * Vérifie que le contrat premium survit intégralement de l'estimate jusqu'au reroll.
 */
import { describe, expect, it } from "vitest";
import {
  PREMIUM_PRODUCTION_PLAN_KEYS,
  assertPremiumContract,
  mergePremiumProductionPlan,
  mergePremiumStudioDraft,
  validateNarrativeContractConsistency,
  validatePremiumContract,
} from "../lib/premium-chapter-contract";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function buildFullPremiumProductionPlan() {
  return {
    pageCount: 11,
    pages: Array.from({ length: 11 }, (_, i) => ({
      pageNumber: i + 1,
      beatIds: [`beat-${i + 1}`],
      panelCount: 5,
      imageTarget: 5,
      criticalPanelCount: 1,
    })),
    panelsPerPage: Array.from({ length: 11 }, () => 5),
    estimatedImages: 75,
    targetImages: 75,
    minimumImages: 75,
    criticalPanels: ["p1"],
    lockedCharacters: ["hero-1"],
    compressionRisks: [],
    enrichmentAdjustments: [],
    imageBudgetStatus: "on_target",
    panelBlueprints: [
      {
        panelId: "panel-1",
        beatId: "beat-1",
        panelIndex: 0,
        purpose: "Combat",
        cameraAngle: "eye_level",
        subjectFocus: "hero",
        shotType: "medium",
        requiredProps: ["katana"],
        presenceObligations: [],
        mustShowEnemy: true,
        requiredNpcCount: 0,
      },
      {
        panelId: "panel-2",
        beatId: "beat-2",
        panelIndex: 1,
        purpose: "Cutaway décor",
        cameraAngle: "wide",
        subjectFocus: "environment",
        shotType: "wide",
        requiredProps: [],
        presenceObligations: [],
        mustShowEnemy: false,
        requiredNpcCount: 3,
        cutawayType: "environment",
      },
    ],
    premiumReadinessScore: 0.88,
    heroCenterRatio: 0.5,
    focusDistribution: { hero: 4, duo: 3, environment: 2, npc: 2 },
    shotDistribution: { close_up: 3, medium: 5, wide: 3 },
    focusBudget: { heroMax: 0.6, cutawayMin: 0.1 },
    propCoverage: { covered: ["katana"], missing: [] },
    enemyCoverage: { panelCount: 3, beatsCovered: ["beat-1", "beat-3"] },
    npcCoverage: { panelCount: 2, avgNpcCount: 3 },
    cutawayCoverage: { count: 2, ratio: 0.18 },
    dialogueAnchorCoverage: { anchored: 3, floating: 0 },
    objectStateTimeline: [
      { objectId: "katana", states: ["held", "sheathed"] },
    ],
  };
}

function buildFullPremiumSnapshot(beatCount = 10) {
  const pp = buildFullPremiumProductionPlan();
  return {
    status: "READY_FOR_GENERATION" as const,
    currentStep: "production_plan" as const,
    autosaveVersion: 1,
    history: [],
    updatedAt: new Date().toISOString(),
    data: {
      productionOutline: {
        source: "premium_rebuilt",
        chapterGoal: "Atteindre la tour",
        cliffhanger: "La porte s'ouvre",
        beats: Array.from({ length: beatCount }, (_, i) => ({
          beatId: `beat-${i + 1}`,
          summary: `Beat ${i + 1}`,
          narrativeFunction: "progression",
          whyThisBeatExists: "avancer",
          dramaticChange: "changement",
          involvedCharacters: ["hero-1"],
          activeCanonConstraints: [],
          environmentContext: [],
          visualPriority: "high",
          estimatedPanels: 6,
          criticality: "high",
          continuityDependencies: [],
          infoGained: null,
          emotionProduced: null,
          indispensabilityScore: 80,
          redundancyRisk: 10,
        })),
      },
      productionPlan: pp,
      readinessReport: {
        status: "ready",
        imageCounts: {
          estimatedImages: 75,
          targetImages: 75,
          minimumImages: 75,
          generatedImages: 0,
          acceptedImages: 0,
          rejectedImages: 0,
          missingImages: 75,
        },
      },
      characterCanons: [],
      locationCanons: [],
      selectedPlotLabel: "bold" as const,
      creativityControls: {},
    },
  };
}

function buildApprovedOutlineRecord(beatCount = 10) {
  return {
    approvedOutline: {
      summary: "Résumé",
      cliffhanger: "Fin",
      beats: Array.from({ length: beatCount }, (_, i) => ({
        id: `beat-${i + 1}`,
        summary: `Beat ${i + 1}`,
        pageRole: "action",
        turn: "montée",
        characters: ["hero-1"],
        location: "dojo",
        emotionalDelta: 2,
      })),
      approvedAt: new Date().toISOString(),
      approvalVersion: "v1",
      source: "user_approved",
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("premium-end-to-end-contract — survie du contrat premium", () => {
  it("un snapshot premium complet passe assertPremiumContract", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = assertPremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("validatePremiumContract retourne ok=true pour un contrat complet", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validatePremiumContract détecte panelBlueprints vide", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    (snapshot.data.productionPlan as Record<string, unknown>).panelBlueprints = [];
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("panelBlueprints"))).toBe(true);
  });

  it("validatePremiumContract détecte dialogueAnchorCoverage absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).dialogueAnchorCoverage;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("dialogueAnchorCoverage"))).toBe(true);
  });

  it("validatePremiumContract détecte propCoverage absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).propCoverage;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("propCoverage"))).toBe(true);
  });

  it("validatePremiumContract détecte enemyCoverage absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).enemyCoverage;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("enemyCoverage"))).toBe(true);
  });

  it("validatePremiumContract détecte npcCoverage absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).npcCoverage;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("npcCoverage"))).toBe(true);
  });

  it("validatePremiumContract détecte cutawayCoverage absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).cutawayCoverage;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("cutawayCoverage"))).toBe(true);
  });

  it("validatePremiumContract détecte heroCenterRatio absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).heroCenterRatio;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("heroCenterRatio"))).toBe(true);
  });

  it("validatePremiumContract détecte premiumReadinessScore absent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    delete (snapshot.data.productionPlan as Record<string, unknown>).premiumReadinessScore;
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("premiumReadinessScore"))).toBe(true);
  });

  it("validatePremiumContract accepte enemyCoverage avec panelCount=0 (pas d'ennemi dans ce chapitre)", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    (snapshot.data.productionPlan as Record<string, unknown>).enemyCoverage = { panelCount: 0, beatsCovered: [] };
    const outlineRecord = buildApprovedOutlineRecord(10);
    const result = validatePremiumContract(snapshot as never, outlineRecord);
    // enemyCoverage présent mais vide n'est pas une erreur bloquante
    expect(result.errors.some((e) => e.includes("enemyCoverage absent"))).toBe(false);
  });

  it("mergePremiumProductionPlan préserve tous les champs premium présents dans l'existant", () => {
    const existing = buildFullPremiumProductionPlan();
    const incoming = {
      pageCount: 11,
      estimatedImages: 75,
      targetImages: 75,
      minimumImages: 75,
      pages: existing.pages,
      panelsPerPage: existing.panelsPerPage,
      criticalPanels: [],
      lockedCharacters: [],
      compressionRisks: [],
      enrichmentAdjustments: [],
      imageBudgetStatus: "on_target",
      // Champs premium absents dans l'incoming
    };

    const merged = mergePremiumProductionPlan(
      existing as Record<string, unknown>,
      incoming as Record<string, unknown>,
    );

    // Vérifier que les champs premium de l'existant sont préservés
    const premiumFieldsInExisting = PREMIUM_PRODUCTION_PLAN_KEYS.filter(
      (key) => existing[key as keyof typeof existing] !== undefined,
    );
    for (const key of premiumFieldsInExisting) {
      expect(merged[key]).toBeDefined();
    }
  });

  it("mergePremiumProductionPlan préserve les panelBlueprints si incoming vide", () => {
    const existing = buildFullPremiumProductionPlan();
    const incoming = { ...existing, panelBlueprints: [] };

    const merged = mergePremiumProductionPlan(
      existing as Record<string, unknown>,
      incoming as Record<string, unknown>,
    );

    expect(Array.isArray(merged.panelBlueprints)).toBe(true);
    expect((merged.panelBlueprints as unknown[]).length).toBe(existing.panelBlueprints.length);
  });

  it("mergePremiumProductionPlan ne remplace pas premiumReadinessScore valide par 0", () => {
    const existing = buildFullPremiumProductionPlan();
    const incoming = { ...existing, premiumReadinessScore: 0 };

    const merged = mergePremiumProductionPlan(
      existing as Record<string, unknown>,
      incoming as Record<string, unknown>,
    );

    expect(merged.premiumReadinessScore).toBe(existing.premiumReadinessScore);
  });

  it("mergePremiumStudioDraft préserve le productionPlan premium", () => {
    const existingDraft = {
      productionPlan: buildFullPremiumProductionPlan(),
      intent: { workingTitle: "Ancien titre" },
    };
    const incomingDraft = {
      intent: { workingTitle: "Nouveau titre" },
      productionPlan: { pageCount: 11, estimatedImages: 75, targetImages: 75, minimumImages: 75 },
    };

    const merged = mergePremiumStudioDraft(
      existingDraft as Record<string, unknown>,
      incomingDraft as Record<string, unknown>,
    );

    const mergedPP = merged.productionPlan as Record<string, unknown>;
    expect(mergedPP.panelBlueprints).toBeDefined();
    expect(mergedPP.propCoverage).toBeDefined();
    expect(mergedPP.enemyCoverage).toBeDefined();
    expect((merged.intent as Record<string, unknown>)?.workingTitle).toBe("Nouveau titre");
  });

  it("validateNarrativeContractConsistency retourne ok pour un contrat cohérent", () => {
    const snapshot = buildFullPremiumSnapshot(10);
    const result = validateNarrativeContractConsistency(snapshot as never);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("PREMIUM_PRODUCTION_PLAN_KEYS contient tous les champs attendus", () => {
    const expected = [
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
    ];
    for (const key of expected) {
      expect(PREMIUM_PRODUCTION_PLAN_KEYS).toContain(key);
    }
  });
});
