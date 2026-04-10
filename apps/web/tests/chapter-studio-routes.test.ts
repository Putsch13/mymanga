import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
  chapter: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  job: { create: vi.fn() },
};

const getAppUserMock = vi.fn();
const getOwnedChapterMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getGenerationStackStatusMock = vi.fn();
const sendChapterGenerateRequestedMock = vi.fn();
const runFullChapterPipelineFromJobMock = vi.fn();
const estimateChapterTextTokensFromRulesMock = vi.fn();
const trackServerEventMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@/lib/ownership", () => ({
  getOwnedChapter: getOwnedChapterMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/generation/stack-readiness", () => ({
  getGenerationStackStatus: getGenerationStackStatusMock,
}));

vi.mock("@manga-ai-studio/workflow", () => ({
  sendChapterGenerateRequested: sendChapterGenerateRequestedMock,
  runFullChapterPipelineFromJob: runFullChapterPipelineFromJobMock,
}));

vi.mock("@manga-ai-studio/billing", () => ({
  estimateChapterTextTokensFromRules: estimateChapterTextTokensFromRulesMock,
}));

vi.mock("@/lib/analytics", () => ({
  trackServerEvent: trackServerEventMock,
}));

vi.mock("@/lib/age-gate", () => ({
  canAccessMatureContent: () => true,
  getAgeGateMessage: () => "blocked",
  projectRequiresAgeGate: () => false,
}));

function buildReadyStudio() {
  return {
    status: "READY_FOR_GENERATION",
    currentStep: "readiness",
    autosaveVersion: 1,
    history: [],
    updatedAt: new Date().toISOString(),
    data: {
      intent: {
        chapterNumber: 3,
        workingTitle: "Chapitre prêt",
        shortPitch: "Le héros fait un choix",
        mainConflict: "Conflit majeur",
        endingMode: "cliffhanger",
        arcImportance: "high",
      },
      narrativeContract: {
        emotionalGoal: "tension",
        heroStateAtStart: "calme",
        heroStateAtEnd: "choqué",
        centralConflict: "ennemi visible",
        revealOrInformationGain: "le secret apparaît",
        relationshipShift: "rupture",
        chapterQuestion: "qui trahit ?",
        endingMode: "cliffhanger",
        tone: "dark",
        dominantTone: "dark",
        intensityCurve: [20, 50, 80],
        keyMotif: "pluie",
        forbiddenNarrativeMisses: [],
      },
      characterSelection: {
        heroCharacterId: "hero-1",
        activeCharacterIds: ["hero-1", "support-1"],
        lockedCharacterIds: ["hero-1"],
        speakingCharacterIds: ["hero-1"],
        evolvingCharacterIds: ["hero-1"],
        antagonistCharacterIds: ["support-1"],
        recurringNpcIds: [],
      },
      chapterCanon: {
        heroOutfitId: "outfit-1",
        activeCharacters: ["hero-1", "support-1"],
        allowedVisualChanges: [],
        currentLocation: "dojo",
        weather: "rain",
        timeOfDay: "night",
        injuries: [],
        carriedObjects: [],
        continuityNotes: ["same sword"],
        inheritedFromPreviousChapter: true,
        universeConstraints: [],
      },
      editorialOutline: {
        summary: "outline éditorial",
        validationNotes: [],
        beats: [{ beatId: "e1", label: "start", summary: "début", involvedCharacters: ["hero-1"] }],
      },
      productionOutline: {
        source: "generated",
        chapterGoal: "atteindre la tour",
        cliffhanger: "la porte s'ouvre",
        beats: Array.from({ length: 10 }, (_, index) => ({
          beatId: `b${index + 1}`,
          summary: `beat ${index + 1}`,
          narrativeFunction: "progression",
          whyThisBeatExists: "faire avancer",
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
      productionPlan: {
        pageCount: 11,
        pages: Array.from({ length: 11 }, (_, index) => ({
          pageNumber: index + 1,
          beatIds: [`b${Math.min(index + 1, 10)}`],
          panelCount: 5,
          imageTarget: 5,
          criticalPanelCount: 1,
        })),
        panelsPerPage: Array.from({ length: 11 }, () => 5),
        estimatedImages: 55,
        targetImages: 55,
        minimumImages: 55,
        criticalPanels: ["p1"],
        lockedCharacters: ["hero-1"],
        compressionRisks: [],
        enrichmentAdjustments: [],
        imageBudgetStatus: "on_target",
      },
    },
  };
}

const user = { id: "user-1" };
const project = { id: "project-1", userId: "user-1", contentRating: "TEEN", intensityLayer: "TEEN", user, title: "Mon Projet" };
const ctxProject = { params: Promise.resolve({ id: "project-1" }) };
const ctxChapter = { params: Promise.resolve({ id: "project-1", chapterId: "chapter-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getAppUserMock.mockResolvedValue(user);
  checkRateLimitMock.mockReturnValue({ ok: true });
  getGenerationStackStatusMock.mockReturnValue({
    canGenerateChapters: true,
    operationalStatus: "FULLY_OPERATIONAL",
    degradedModes: [],
    warnings: [],
  });
  estimateChapterTextTokensFromRulesMock.mockResolvedValue(42);
  sendChapterGenerateRequestedMock.mockResolvedValue({ ok: true });
  runFullChapterPipelineFromJobMock.mockResolvedValue({ ok: true });
});

describe("routes Chapter Studio", () => {
  it("crée un draft studio", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    prismaMock.chapter.create.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: {},
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const mod = await import("../app/api/projects/[id]/chapters/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          title: "Chapitre 1",
          userIntent: "Préparer le duel",
          studioDraft: { productionPlan: buildReadyStudio().data.productionPlan },
        }),
      }),
      ctxProject,
    );

    expect(response.status).toBe(200);
    expect(prismaMock.chapter.create).toHaveBeenCalled();
    expect(trackServerEventMock).toHaveBeenCalled();
  });

  it("sauvegarde un patch studio", async () => {
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: "ancien",
      outline: {},
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/studio/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          currentStep: "intent",
          data: { intent: { workingTitle: "Nouveau titre", shortPitch: "nouveau pitch" } },
        }),
      }),
      ctxChapter,
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(prismaMock.chapter.update).toHaveBeenCalled();
  });

  it("retourne une readiness bloquée si le studio est incomplet", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: null,
      outline: {},
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/readiness/route");
    const response = await mod.GET(new Request("http://localhost"), ctxChapter);
    const payload = await response.json();

    expect(payload.readiness.status).toBe("blocked");
    expect(payload.readiness.blockingIssues.length).toBeGreaterThan(0);
  });

  it("refuse un launch studio si le chapitre n'est pas prêt", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: null,
      outline: {},
      project,
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/launch/route");
    const response = await mod.POST(new Request("http://localhost", { method: "POST" }), ctxChapter);

    expect(response.status).toBe(422);
  });

  it("autorise le launch studio si le chapitre est prêt", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre prêt",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: { studio: buildReadyStudio() },
      project,
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/launch/route");
    const response = await mod.POST(new Request("http://localhost", { method: "POST" }), ctxChapter);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(prismaMock.job.create).toHaveBeenCalled();
  });

  it("agrège le qa-report avec panels critiques sans QA", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre prêt",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: { studio: buildReadyStudio() },
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          images: [
            {
              id: "img-1",
              panelNumber: 1,
              status: "blocked",
              consistencyScore: 0.91,
              prompt: "prompt",
              metadata: {
                panelCategory: "CHARACTER_LOCK",
                validationDetails: {
                  panelCriticality: { level: "CRITICAL", reasons: ["hero_closeup"] },
                  qaWasRequired: true,
                  qaWasExecuted: false,
                  qaFailureReason: "visual_analyzer_unavailable_for_critical_panel",
                  qualityScores: {
                    releaseScore: 0.91,
                    styleConsistencyScore: 0.9,
                    interactionScore: 0.9,
                    shotComplianceScore: 0.9,
                    environmentReadabilityScore: 0.9,
                  },
                  issues: [],
                },
              },
            },
          ],
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/qa-report/route");
    const response = await mod.GET(new Request("http://localhost"), ctxChapter);
    const payload = await response.json();

    expect(payload.report.criticalPanelsMissingQA).toBe(1);
    expect(payload.report.missingCriticalPanels).toContain("img-1");
  });

  it("bloque review/complete sous le minimum d'images", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre prêt",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: { studio: buildReadyStudio() },
      scenes: [
        {
          id: "scene-1",
          images: Array.from({ length: 10 }, (_, index) => ({
            id: `img-${index}`,
            status: "completed",
            metadata: {},
          })),
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/review/complete/route");
    const response = await mod.POST(new Request("http://localhost", { method: "POST" }), ctxChapter);

    expect(response.status).toBe(422);
  });

  it("bloque review/complete si la QA critique manque", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre prêt",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: { studio: buildReadyStudio() },
      scenes: [
        {
          id: "scene-1",
          images: Array.from({ length: 55 }, (_, index) => ({
            id: `img-${index}`,
            status: "completed",
            metadata: index === 0
              ? { validationDetails: { qaWasRequired: true, qaWasExecuted: false } }
              : {},
          })),
        },
      ],
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/review/complete/route");
    const response = await mod.POST(new Request("http://localhost", { method: "POST" }), ctxChapter);

    expect(response.status).toBe(422);
  });
});

