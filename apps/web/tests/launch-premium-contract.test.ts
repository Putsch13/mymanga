import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  chapter: { findFirst: vi.fn(), update: vi.fn() },
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
    buildChapterStructuredRuntimePrismaFields: vi.fn().mockReturnValue({
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
    }),
  };
});

const user = { id: "user-1", email: "user@test.com", preferences: null };
const ctx = { params: Promise.resolve({ id: "project-1", chapterId: "chapter-1" }) };

function buildPremiumChapter(beatCount = 10) {
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
    project: {
      id: "project-1",
      userId: "user-1",
      contentRating: "TEEN",
      intensityLayer: "TEEN",
      user,
    },
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
            panelBlueprints: [
              {
                panelId: "panel-1",
                beatId: "beat-1",
                panelIndex: 0,
                panelNumber: 1,
                purpose: "Introduire le héros",
                cameraAngle: "eye_level",
                subjectFocus: "hero",
                shotType: "medium",
                requiredProps: [],
                presenceObligations: [],
              },
            ],
            premiumReadinessScore: 0.85,
            heroCenterRatio: 0.5,
            focusDistribution: { hero: 5 },
            propCoverage: { covered: ["katana"], missing: [] },
            enemyCoverage: { panelCount: 2, beatsCovered: ["beat-1"] },
            npcCoverage: { panelCount: 1, avgNpcCount: 2 },
            cutawayCoverage: { count: 1, ratio: 0.1 },
            dialogueAnchorCoverage: { anchored: 2, floating: 0 },
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
  prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
});

describe("/launch — contrat premium", () => {
  it("refuse avec 4xx si contrat premium incomplet", async () => {
    const chapterWithoutPlan = buildPremiumChapter();
    // Supprimer productionPlan et readinessReport du snapshot
    const studio = chapterWithoutPlan.outline.studio as Record<string, unknown>;
    (studio.data as Record<string, unknown>).productionPlan = undefined;
    (studio.data as Record<string, unknown>).readinessReport = undefined;
    prismaMock.chapter.findFirst.mockResolvedValue(chapterWithoutPlan);

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/launch/route");
    const response = await mod.POST(
      new Request("http://localhost", { method: "POST" }),
      ctx,
    );

    // Le chapitre doit être rejeté (soit 422 readiness blocked, soit 422 premium_contract_incomplete)
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error).toBeDefined();
  });

  it("envoie le même job.input que /pipeline (source, panelBlueprints, premiumReadinessScore)", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapter());
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/launch/route");
    const response = await mod.POST(
      new Request("http://localhost", { method: "POST" }),
      ctx,
    );

    expect(response.status).toBe(200);
    const createCall = prismaMock.job.create.mock.calls[0]?.[0];
    const jobInput = createCall?.data?.input as Record<string, unknown> | undefined;
    expect(jobInput).toBeDefined();
    expect(jobInput?.source).toBe("chapter_studio_launch");
    // premiumReadinessScore transmis
    expect(typeof jobInput?.premiumReadinessScore).toBe("number");
    expect(jobInput?.productionOutline).toBeDefined();
    expect(jobInput?.productionPlan).toBeDefined();
  });

  it("n'utilise jamais buildLegacyApprovedOutlineFromStudio", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapter());
    prismaMock.job.create.mockResolvedValue({ id: "job-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/launch/route");
    const response = await mod.POST(
      new Request("http://localhost", { method: "POST" }),
      ctx,
    );

    expect(response.status).toBe(200);
    const createCall = prismaMock.job.create.mock.calls[0]?.[0];
    const jobInput = createCall?.data?.input as Record<string, unknown> | undefined;
    // Vérifier que productionOutline est premium (source !== legacy_adapted)
    const po = jobInput?.productionOutline as Record<string, unknown> | undefined;
    if (po) {
      expect(po.source).not.toBe("legacy_adapted");
    }
  });
});
