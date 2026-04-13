import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  chapter: {
    findFirst: vi.fn(),
  },
};

const getAppUserMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@/lib/chapter-studio", () => ({
  readChapterStudioSnapshotFromOutline: vi.fn().mockReturnValue({
    status: "READY_FOR_GENERATION",
    currentStep: "production_plan",
    autosaveVersion: 1,
    history: [],
    updatedAt: new Date().toISOString(),
    data: {
      productionPlan: {
        estimatedImages: 20,
        targetImages: 20,
        minimumImages: 20,
        panelBlueprints: [],
      },
      readinessReport: {
        status: "ready",
        imageCounts: {
          estimatedImages: 20,
          targetImages: 20,
          minimumImages: 20,
          generatedImages: 0,
          acceptedImages: 0,
          rejectedImages: 0,
          missingImages: 20,
        },
      },
    },
  }),
}));

const ctx = { params: Promise.resolve({ id: "project-1", chapterId: "chapter-1" }) };

function makeImageWithPremiumScores(overrides: {
  propComplianceScore?: number;
  subjectFocusScore?: number;
  dialogueAnchorScore?: number;
  enemyPresenceScore?: number;
  populationScore?: number;
  cutawayComplianceScore?: number;
  issues?: Array<{ type: string; message: string; severity: string }>;
} = {}) {
  return {
    id: "img-1",
    panelNumber: 1,
    imageUrl: "https://example.com/img.jpg",
    status: "completed",
    consistencyScore: 0.85,
    prompt: "hero fights enemy in dojo",
    negativePrompt: null,
    metadata: {
      validationDetails: {
        qualityScores: {
          releaseScore: 0.85,
          styleConsistencyScore: 0.9,
          interactionScore: 0.8,
          shotComplianceScore: 0.85,
          environmentReadabilityScore: 0.8,
          propComplianceScore: overrides.propComplianceScore ?? 0.9,
          subjectFocusScore: overrides.subjectFocusScore ?? 0.85,
          dialogueAnchorScore: overrides.dialogueAnchorScore ?? 0.9,
          enemyPresenceScore: overrides.enemyPresenceScore ?? 0.8,
          populationScore: overrides.populationScore ?? 0.75,
          cutawayComplianceScore: overrides.cutawayComplianceScore ?? 0.95,
        },
        issues: overrides.issues ?? [],
        qaWasRequired: false,
        qaWasExecuted: false,
      },
      panelCategory: "action",
      visualPriority: "high",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppUserMock.mockResolvedValue({ id: "user-1" });
});

describe("qa-report route — scores premium", () => {
  it("expose les 6 scores premium dans axisScores quand ils sont présents dans validationDetails", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: {},
      studioStatus: "READY_FOR_GENERATION",
      studioCurrentStep: "production_plan",
      studioUpdatedAt: new Date(),
      studioAutosaveVersion: 1,
      minimumImages: 20,
      generatedImages: 1,
      acceptedImages: 1,
      rejectedImages: 0,
      missingImages: 19,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          images: [makeImageWithPremiumScores({
            propComplianceScore: 0.9,
            subjectFocusScore: 0.85,
            dialogueAnchorScore: 0.9,
            enemyPresenceScore: 0.8,
            populationScore: 0.75,
            cutawayComplianceScore: 0.95,
          })],
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/qa-report/route");
    const response = await mod.GET(new Request("http://localhost"), ctx);
    const payload = await response.json();

    expect(response.status).toBe(200);
    const panel = payload.report.panelResults[0];
    expect(panel).toBeDefined();

    // Les 6 scores premium doivent être présents et corrects
    expect(panel.axisScores.propComplianceScore).toBe(0.9);
    expect(panel.axisScores.subjectFocusScore).toBe(0.85);
    expect(panel.axisScores.dialogueAnchorScore).toBe(0.9);
    expect(panel.axisScores.enemyPresenceScore).toBe(0.8);
    expect(panel.axisScores.populationScore).toBe(0.75);
    expect(panel.axisScores.cutawayComplianceScore).toBe(0.95);
  });

  it("retourne undefined pour les scores premium quand ils sont absents de validationDetails", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: {},
      studioStatus: "READY_FOR_GENERATION",
      studioCurrentStep: "production_plan",
      studioUpdatedAt: new Date(),
      studioAutosaveVersion: 1,
      minimumImages: 20,
      generatedImages: 1,
      acceptedImages: 1,
      rejectedImages: 0,
      missingImages: 19,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          images: [{
            id: "img-legacy",
            panelNumber: 1,
            imageUrl: null,
            status: "completed",
            consistencyScore: 0.8,
            prompt: null,
            negativePrompt: null,
            metadata: {
              validationDetails: {
                qualityScores: {
                  releaseScore: 0.8,
                  // Pas de scores premium
                },
                issues: [],
                qaWasRequired: false,
                qaWasExecuted: false,
              },
            },
          }],
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/qa-report/route");
    const response = await mod.GET(new Request("http://localhost"), ctx);
    const payload = await response.json();

    expect(response.status).toBe(200);
    const panel = payload.report.panelResults[0];
    // Les scores premium doivent être undefined (pas de valeur par défaut silencieuse)
    expect(panel.axisScores.propComplianceScore).toBeUndefined();
    expect(panel.axisScores.subjectFocusScore).toBeUndefined();
    expect(panel.axisScores.cutawayComplianceScore).toBeUndefined();
  });

  it("expose les issues premium dans rejectionReasons", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: {},
      studioStatus: "READY_FOR_GENERATION",
      studioCurrentStep: "production_plan",
      studioUpdatedAt: new Date(),
      studioAutosaveVersion: 1,
      minimumImages: 20,
      generatedImages: 1,
      acceptedImages: 0,
      rejectedImages: 1,
      missingImages: 20,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          images: [makeImageWithPremiumScores({
            propComplianceScore: 0.2,
            issues: [
              { type: "missing_prop", message: "Prop obligatoire absent: katana", severity: "critical" },
              { type: "missing_enemy_presence", message: "Ennemi absent du panel", severity: "critical" },
            ],
          })],
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/qa-report/route");
    const response = await mod.GET(new Request("http://localhost"), ctx);
    const payload = await response.json();

    expect(response.status).toBe(200);
    const panel = payload.report.panelResults[0];
    // Les issues premium doivent apparaître dans rejectionReasons
    expect(panel.rejectionReasons).toContain("Prop obligatoire absent: katana");
    expect(panel.rejectionReasons).toContain("Ennemi absent du panel");
  });

  it("expose cutaway_collapsed_to_hero dans rejectionReasons", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: {},
      studioStatus: "READY_FOR_GENERATION",
      studioCurrentStep: "production_plan",
      studioUpdatedAt: new Date(),
      studioAutosaveVersion: 1,
      minimumImages: 20,
      generatedImages: 1,
      acceptedImages: 0,
      rejectedImages: 1,
      missingImages: 20,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          images: [makeImageWithPremiumScores({
            cutawayComplianceScore: 0.2,
            issues: [
              { type: "cutaway_collapsed_to_hero", message: "Cutaway remplacé par portrait héros", severity: "major" },
            ],
          })],
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/qa-report/route");
    const response = await mod.GET(new Request("http://localhost"), ctx);
    const payload = await response.json();

    expect(response.status).toBe(200);
    const panel = payload.report.panelResults[0];
    expect(panel.axisScores.cutawayComplianceScore).toBe(0.2);
    expect(panel.rejectionReasons).toContain("Cutaway remplacé par portrait héros");
  });
});
