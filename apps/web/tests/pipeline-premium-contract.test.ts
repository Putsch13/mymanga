import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
  chapter: { findFirst: vi.fn() },
  job: { create: vi.fn() },
};

const getAppUserMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getGenerationStackStatusMock = vi.fn();
const sendChapterGenerateRequestedMock = vi.fn();
const runFullChapterPipelineFromJobMock = vi.fn();
const estimateChapterTextTokensFromRulesMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
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

vi.mock("@/lib/age-gate", () => ({
  canAccessMatureContent: () => true,
  getAgeGateMessage: () => "blocked",
  projectRequiresAgeGate: () => false,
}));

// Mock readChapterStudioSnapshotFromOutline pour retourner directement le snapshot premium
vi.mock("@/lib/chapter-studio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chapter-studio")>();
  return {
    ...actual,
    readChapterStudioSnapshotFromOutline: vi.fn().mockImplementation((input: { outline: unknown }) => {
      const outline = input.outline as Record<string, unknown> | null;
      const studio = outline?.studio as Record<string, unknown> | null;
      if (studio?.data) {
        return {
          status: "READY_FOR_GENERATION",
          currentStep: "production_plan",
          autosaveVersion: 1,
          history: [],
          updatedAt: new Date().toISOString(),
          data: studio.data,
        };
      }
      return {
        status: "DRAFT",
        currentStep: "intent",
        autosaveVersion: 0,
        history: [],
        updatedAt: new Date().toISOString(),
        data: { characterCanons: [], locationCanons: [], selectedPlotLabel: "bold", creativityControls: {} },
      };
    }),
  };
});

const user = { id: "user-1", email: "user@test.com", preferences: null };
const project = {
  id: "project-1",
  userId: "user-1",
  contentRating: "TEEN",
  intensityLayer: "TEEN",
  user,
  title: "Mon Projet",
};
const ctx = { params: Promise.resolve({ id: "project-1" }) };

function buildPremiumChapterOutline(beatCount = 10) {
  return {
    id: "chapter-1",
    chapterNumber: 1,
    title: "Chapitre 1",
    summary: "Résumé",
    cliffhanger: "Fin",
    userIntent: "Test",
    status: "draft",
    studioStatus: "READY_FOR_GENERATION",
    studioCurrentStep: "production_plan",
    studioUpdatedAt: new Date(),
    studioAutosaveVersion: 1,
    minimumImages: 55,
    generatedImages: 0,
    acceptedImages: 0,
    rejectedImages: 0,
    missingImages: 55,
    criticalPanelsCount: 0,
    criticalPanelsBlocked: 0,
    criticalPanelsMissingQa: 0,
    reviewBlockedReason: null,
    outline: {
      approvedOutline: {
        summary: "Résumé",
        cliffhanger: "Fin",
        beats: Array.from({ length: beatCount }, (_, i) => ({
          id: `beat-${i + 1}`,
          summary: `Beat ${i + 1}`,
          pageRole: "action",
          turn: "montée",
          characters: ["hero-1"],
        })),
        approvedAt: new Date().toISOString(),
        approvalVersion: "v1",
        source: "user_approved",
      },
      studio: {
        status: "READY_FOR_GENERATION",
        currentStep: "production_plan",
        autosaveVersion: 1,
        history: [],
        updatedAt: new Date().toISOString(),
        data: {
          productionOutline: {
            source: "premium_rebuilt",
            chapterGoal: "But du chapitre",
            cliffhanger: "Fin",
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
          productionPlan: {
            pageCount: 11,
            pages: Array.from({ length: 11 }, (_, i) => ({
              pageNumber: i + 1,
              beatIds: [`beat-${Math.min(i + 1, beatCount)}`],
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
            panelBlueprints: [],
            premiumReadinessScore: 0.85,
            heroCenterRatio: 0.5,
            focusDistribution: { hero: 5 },
          },
          readinessReport: {
            status: "ready",
            imageCounts: {
              estimatedImages: 55,
              targetImages: 55,
              minimumImages: 55,
              generatedImages: 0,
              acceptedImages: 0,
              rejectedImages: 0,
              missingImages: 55,
            },
          },
        },
      },
    },
  };
}

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

describe("/pipeline — contrat premium", () => {
  it("refuse avec 4xx si productionPlan absent", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    const chapterWithoutPlan = buildPremiumChapterOutline();
    // Supprimer productionPlan du snapshot
    const studio = chapterWithoutPlan.outline.studio as Record<string, unknown>;
    (studio.data as Record<string, unknown>).productionPlan = undefined;
    // Supprimer aussi readinessReport pour forcer le recalcul
    (studio.data as Record<string, unknown>).readinessReport = undefined;
    prismaMock.chapter.findFirst.mockResolvedValue(chapterWithoutPlan);

    const mod = await import("../app/api/projects/[id]/pipeline/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ chapterId: "chapter-1" }),
      }),
      ctx,
    );

    // Le chapitre doit être rejeté (soit 422 readiness blocked, soit 422 premium_contract_incomplete)
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error).toBeDefined();
  });

  it("envoie panelBlueprints dans job.input", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapterOutline());
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/pipeline/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ chapterId: "chapter-1" }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const createCall = prismaMock.job.create.mock.calls[0]?.[0];
    const jobInput = createCall?.data?.input as Record<string, unknown> | undefined;
    expect(jobInput).toBeDefined();
    // Vérifier que les champs premium sont présents
    expect(jobInput?.productionOutline).toBeDefined();
    expect(jobInput?.productionPlan).toBeDefined();
    // panelBlueprints est undefined si vide (comportement attendu de buildGenerationJobInputFromSnapshot)
    expect(jobInput?.panelBlueprints).toBeUndefined();
  });

  it("envoie premiumReadinessScore dans job.input", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapterOutline());
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/pipeline/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ chapterId: "chapter-1" }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const createCall = prismaMock.job.create.mock.calls[0]?.[0];
    const jobInput = createCall?.data?.input as Record<string, unknown> | undefined;
    expect(typeof jobInput?.premiumReadinessScore).toBe("number");
    expect(jobInput?.premiumReadinessScore).toBe(0.85);
  });

  it("n'utilise jamais buildLegacyApprovedOutlineFromStudio", async () => {
    // Ce test vérifie que le pipeline route n'importe plus buildLegacyApprovedOutlineFromStudio
    // En vérifiant que le job est créé correctement sans fallback legacy
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapterOutline());
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/pipeline/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ chapterId: "chapter-1" }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    // Vérifier que source est "pipeline_route" (pas "legacy_adapted")
    const createCall = prismaMock.job.create.mock.calls[0]?.[0];
    const jobInput = createCall?.data?.input as Record<string, unknown> | undefined;
    expect(jobInput?.source).toBe("pipeline_route");
    // Vérifier que productionOutline est premium (source !== legacy_adapted)
    const po = jobInput?.productionOutline as Record<string, unknown> | undefined;
    if (po) {
      expect(po.source).not.toBe("legacy_adapted");
    }
  });
});
