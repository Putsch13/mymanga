import { describe, expect, it } from "vitest";
import {
  buildChapterReadinessReport,
  buildLegacyApprovedOutlineFromStudio,
  buildProductionPlanFromOutline,
  buildStudioSnapshotFromLegacy,
  createEmptyChapterStudioSnapshot,
  normalizeChapterImageCounts,
  updateChapterStudioSnapshot,
} from "./chapter-studio-helpers";

describe("chapter studio domain", () => {
  it("enrichit automatiquement un plan sous 75 images", () => {
    const plan = buildProductionPlanFromOutline({
      source: "generated",
      chapterGoal: "Monter la tension avant l'affrontement.",
      cliffhanger: "Le héros découvre que son allié a menti.",
      beats: Array.from({ length: 10 }, (_, index) => ({
        beatId: `beat_${index + 1}`,
        summary: `Beat ${index + 1}`,
        narrativeFunction: "progression",
        whyThisBeatExists: "Faire progresser le chapitre",
        dramaticChange: "La situation se complique",
        involvedCharacters: ["hero"],
        activeCanonConstraints: [],
        environmentContext: ["dojo"],
        visualPriority: "high" as const,
        estimatedPanels: 3,
        criticality: "medium" as const,
        continuityDependencies: [],
        indispensabilityScore: 70,
        redundancyRisk: 15,
      })),
    });

    expect(plan.estimatedImages).toBe(30);
    expect(plan.targetImages).toBeGreaterThanOrEqual(75);
    expect(plan.enrichmentAdjustments.length).toBeGreaterThan(0);
  });

  it("bloque la readiness si le plan de production reste insuffisant", () => {
    const snapshot = updateChapterStudioSnapshot(createEmptyChapterStudioSnapshot(), {
      intent: {
        chapterNumber: 4,
        workingTitle: "Le temple fissuré",
        shortPitch: "Le héros pénètre dans le temple.",
        mainConflict: "Il doit survivre à un piège vivant.",
      },
      narrativeContract: {
        emotionalGoal: "Faire sentir la peur puis le courage",
        heroStateAtStart: "méfiant",
        heroStateAtEnd: "déterminé",
        centralConflict: "Le temple teste la loyauté du héros",
        revealOrInformationGain: "Le gardien protège un souvenir du héros",
        relationshipShift: "Le héros doute de son mentor",
        chapterQuestion: "Le héros mérite-t-il l'héritage ?",
        endingMode: "cliffhanger",
        tone: "mystique",
        intensityCurve: [20, 40, 65, 80],
        forbiddenNarrativeMisses: [],
      },
      characterSelection: {
        heroCharacterId: "hero",
        activeCharacterIds: ["hero", "mentor"],
        lockedCharacterIds: ["hero"],
        speakingCharacterIds: ["hero", "mentor"],
        evolvingCharacterIds: ["hero"],
        antagonistCharacterIds: [],
        recurringNpcIds: [],
      },
      chapterCanon: {
        activeCharacters: ["hero", "mentor"],
        currentLocation: "Temple ancien",
        continuityNotes: [],
        allowedVisualChanges: [],
        injuries: [],
        carriedObjects: [],
        inheritedFromPreviousChapter: true,
        universeConstraints: [],
      },
      editorialOutline: {
        summary: "Le héros avance dans le temple.",
        validationNotes: [],
        beats: Array.from({ length: 5 }, (_, index) => ({
          beatId: `ed_${index + 1}`,
          label: `Bloc ${index + 1}`,
          summary: `Bloc ${index + 1}`,
          involvedCharacters: ["hero"],
          narrativePurpose: "progression",
          dramaticShift: "montée",
        })),
      },
      productionOutline: {
        source: "generated",
        chapterGoal: "Percer le secret du temple",
        cliffhanger: "Une voix appelle le héros par son vrai nom",
        beats: Array.from({ length: 10 }, (_, index) => ({
          beatId: `prod_${index + 1}`,
          summary: `Beat ${index + 1}`,
          narrativeFunction: "progression",
          whyThisBeatExists: "Faire progresser l'enquête",
          dramaticChange: "Le danger monte",
          involvedCharacters: ["hero"],
          activeCanonConstraints: [],
          environmentContext: ["Temple ancien"],
          visualPriority: "high" as const,
          estimatedPanels: 2,
          criticality: "medium" as const,
          continuityDependencies: [],
          indispensabilityScore: 70,
          redundancyRisk: 30,
        })),
      },
      productionPlan: {
        pageCount: 4,
        pages: Array.from({ length: 4 }, (_, i) => ({
          pageNumber: i + 1,
          beatIds: [`prod_${i + 1}`],
          panelCount: 5,
          imageTarget: 5,
          criticalPanelCount: 0,
        })),
        panelsPerPage: [5, 5, 5, 5],
        estimatedImages: 20,
        targetImages: 20,
        minimumImages: 75,
        criticalPanels: [],
        lockedCharacters: [],
        compressionRisks: [],
        enrichmentAdjustments: [],
        imageBudgetStatus: "under_target",
      },
    });

    const report = buildChapterReadinessReport(snapshot);
    expect(report.warnings.some((issue) => issue.includes("75"))).toBe(true);
    expect(report.warningItems.some((issue) => issue.id === "production_plan_under_minimum_images" && issue.step === "production_plan")).toBe(true);
    expect(report.warningItems.some((issue) => issue.id === "missing_continuity_notes" && issue.step === "canon")).toBe(true);
  });

  it("adapte un outline legacy vers le studio puis le retransforme", () => {
    const snapshot = buildStudioSnapshotFromLegacy({
      chapterNumber: 2,
      chapterTitle: "Le duel",
      chapterSummary: "Un duel tendu commence",
      cliffhanger: "La lame se brise",
      userIntent: "Créer un duel très dramatique",
      approvedOutline: {
        summary: "Le duel monte en intensité",
        cliffhanger: "La lame se brise",
        approvalVersion: "ao_test",
        approvedAt: new Date().toISOString(),
        source: "user_approved",
        beats: Array.from({ length: 6 }, (_, index) => ({
          id: `beat_${index + 1}`,
          summary: `Beat ${index + 1}`,
          characters: ["hero", "rival"],
          location: "Arène",
          pageRole: "combat",
          turn: "impact",
          emotionalDelta: 2,
          structuredBeat: null,
        })),
      },
    });

    const legacy = buildLegacyApprovedOutlineFromStudio(snapshot);
    expect(legacy?.beats.length).toBe(6);
    expect(legacy?.cliffhanger).toBe("La lame se brise");
  });

  it("calcule les images manquantes à partir des acceptées", () => {
    const counts = normalizeChapterImageCounts({
      estimatedImages: 62,
      targetImages: 58,
      minimumImages: 75,
      generatedImages: 48,
      acceptedImages: 41,
      rejectedImages: 7,
    });

    expect(counts.missingImages).toBe(34);
  });
});
