import { describe, expect, it } from "vitest";
import {
  buildChapterReadinessReport,
  createEmptyChapterStudioSnapshot,
  updateChapterStudioSnapshot,
} from "./chapter-studio-helpers";
import type { ProductionPlan } from "./chapter-studio";

/**
 * P0.1 — readiness doit matérialiser `panelBlueprints.length < minimumImages`
 * comme un *blocant* de studio, pas comme un simple warning. Objectif : aligner
 * la vérité UI sur la vérité backend, qui lève `IncompletePlanError` au launch.
 */

function buildBlueprint(panelNumber: number): Record<string, unknown> {
  return {
    panelId: `panel_${panelNumber}`,
    beatId: `beat_${panelNumber}`,
    panelNumber,
    purpose: "progression",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
  };
}

function buildBaseSnapshotPatch() {
  return {
    intent: {
      chapterNumber: 1,
      workingTitle: "Chapitre test",
      shortPitch: "Un héros découvre un secret dangereux.",
      mainConflict: "Il doit choisir entre deux alliances.",
    },
    narrativeContract: {
      emotionalGoal: "Tension puis soulagement",
      heroStateAtStart: "confus",
      heroStateAtEnd: "résolu",
      centralConflict: "Dilemme moral",
      revealOrInformationGain: "Le mentor trahit",
      relationshipShift: "Le héros s'émancipe",
      chapterQuestion: "Qui est loyal ?",
      endingMode: "cliffhanger" as const,
      tone: "tendu",
      intensityCurve: [20, 40, 60, 80],
      forbiddenNarrativeMisses: [],
    },
    characterSelection: {
      heroCharacterId: "hero",
      activeCharacterIds: ["hero"],
      lockedCharacterIds: ["hero"],
      speakingCharacterIds: ["hero"],
      evolvingCharacterIds: ["hero"],
      antagonistCharacterIds: [],
      recurringNpcIds: [],
    },
    chapterCanon: {
      activeCharacters: ["hero"],
      currentLocation: "Forum principal",
      continuityNotes: ["note 1"],
      allowedVisualChanges: [],
      injuries: [],
      carriedObjects: [],
      inheritedFromPreviousChapter: true,
      universeConstraints: [],
    },
    editorialOutline: {
      summary: "Le héros avance dans l'enquête.",
      validationNotes: [],
      beats: Array.from({ length: 5 }, (_, i) => ({
        beatId: `ed_${i + 1}`,
        label: `Bloc ${i + 1}`,
        summary: `Bloc ${i + 1}`,
        involvedCharacters: ["hero"],
        narrativePurpose: "progression",
        dramaticShift: "montée",
      })),
    },
    productionOutline: {
      source: "generated" as const,
      chapterGoal: "Exposer la trahison",
      cliffhanger: "La porte s'ouvre",
      beats: Array.from({ length: 10 }, (_, i) => ({
        beatId: `prod_${i + 1}`,
        summary: `Beat ${i + 1}`,
        narrativeFunction: "progression",
        whyThisBeatExists: "Développement",
        dramaticChange: "changement",
        involvedCharacters: ["hero"],
        activeCanonConstraints: [],
        environmentContext: ["forum"],
        visualPriority: "high" as const,
        estimatedPanels: 8,
        criticality: "medium" as const,
        continuityDependencies: [],
        indispensabilityScore: 70,
        redundancyRisk: 20,
      })),
    },
  };
}

function buildPlan(partial: Partial<ProductionPlan>): ProductionPlan {
  return {
    pageCount: 10,
    pages: [],
    panelsPerPage: [],
    estimatedImages: partial.estimatedImages ?? 80,
    targetImages: partial.targetImages ?? 80,
    minimumImages: partial.minimumImages ?? 75,
    criticalPanels: [],
    lockedCharacters: [],
    compressionRisks: [],
    enrichmentAdjustments: [],
    imageBudgetStatus: "on_target" as const,
    ...partial,
  } as ProductionPlan;
}

describe("chapter readiness — contrat de production P0.1", () => {
  it("bloque quand productionPlan est absent (missing_production_plan)", () => {
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), buildBaseSnapshotPatch());

    const report = buildChapterReadinessReport(snapshot);

    expect(report.contractStatus).toBe("missing_production_plan");
    expect(report.launchBlocked).toBe(true);
    expect(report.launchBlockedReason).toBe("missing_production_plan");
    expect(report.panelBlueprintCount).toBe(0);
    // P1.1 — `contractComplete` est exposé pour éviter aux composants UI de
    // recalculer la comparaison `panelBlueprints >= minimumImages`.
    expect(report.contractComplete).toBe(false);
    expect(report.blockerItems.some((i) => i.id === "missing_production_plan")).toBe(true);
  });

  it("bloque quand panelBlueprints est absent/vide (missing_blueprints)", () => {
    const patch = buildBaseSnapshotPatch();
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), {
      ...patch,
      productionPlan: buildPlan({ estimatedImages: 80, targetImages: 80, minimumImages: 75 }),
    });

    const report = buildChapterReadinessReport(snapshot);

    expect(report.contractStatus).toBe("missing_blueprints");
    expect(report.launchBlocked).toBe(true);
    expect(report.launchBlockedReason).toBe("missing_blueprints");
    expect(report.panelBlueprintCount).toBe(0);
    const blocker = report.blockerItems.find((i) => i.id === "production_plan_missing_blueprints");
    expect(blocker).toBeDefined();
    expect(blocker?.ctaLabel).toBe("Régénérer le plan");
    expect(blocker?.action).toBe("generate_outline");
    expect(blocker?.step).toBe("production_plan");
  });

  it("bloque quand panelBlueprints.length < minimumImages (incomplete_blueprints)", () => {
    const patch = buildBaseSnapshotPatch();
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), {
      ...patch,
      productionPlan: buildPlan({
        estimatedImages: 52,
        targetImages: 52,
        minimumImages: 75,
        panelBlueprints: Array.from({ length: 52 }, (_, i) => buildBlueprint(i + 1)) as never,
      }),
    });

    const report = buildChapterReadinessReport(snapshot);

    expect(report.contractStatus).toBe("incomplete_blueprints");
    expect(report.contractComplete).toBe(false);
    expect(report.launchBlocked).toBe(true);
    expect(report.launchBlockedReason).toBe("incomplete_plan");
    expect(report.panelBlueprintCount).toBe(52);
    const blocker = report.blockerItems.find((i) => i.id === "production_plan_incomplete_blueprints");
    expect(blocker).toBeDefined();
    expect(blocker?.message).toContain("52");
    expect(blocker?.message).toContain("75");
    expect(blocker?.ctaLabel).toBe("Régénérer le plan");
    expect(blocker?.action).toBe("generate_outline");
    // Pas de warning bruyant en doublon quand c'est déjà un blocant
    expect(report.warningItems.some((i) => i.id === "production_plan_under_minimum_images")).toBe(false);
  });

  it("passe à contractStatus=ok quand panelBlueprints.length >= minimumImages", () => {
    const patch = buildBaseSnapshotPatch();
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), {
      ...patch,
      productionPlan: buildPlan({
        estimatedImages: 80,
        targetImages: 80,
        minimumImages: 75,
        panelBlueprints: Array.from({ length: 80 }, (_, i) => buildBlueprint(i + 1)) as never,
      }),
    });

    const report = buildChapterReadinessReport(snapshot);

    expect(report.contractStatus).toBe("ok");
    expect(report.contractComplete).toBe(true);
    expect(report.launchBlocked).toBe(false);
    expect(report.launchBlockedReason).toBeNull();
    expect(report.panelBlueprintCount).toBe(80);
    expect(report.blockerItems.some((i) => i.step === "production_plan")).toBe(false);
  });

  it("reste OK même si targetImages dépasse minimumImages (pas de warning faux positif)", () => {
    const patch = buildBaseSnapshotPatch();
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), {
      ...patch,
      productionPlan: buildPlan({
        estimatedImages: 90,
        targetImages: 90,
        minimumImages: 75,
        panelBlueprints: Array.from({ length: 90 }, (_, i) => buildBlueprint(i + 1)) as never,
      }),
    });

    const report = buildChapterReadinessReport(snapshot);

    expect(report.contractStatus).toBe("ok");
    expect(report.launchBlocked).toBe(false);
    expect(report.warningItems.some((i) => i.id === "production_plan_under_minimum_images")).toBe(false);
  });
});
