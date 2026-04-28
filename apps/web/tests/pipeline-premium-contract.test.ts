import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPremiumPipelineChapterOutline as buildPremiumChapterOutline,
  premiumTestProject as project,
  premiumTestUser as user,
} from "./premium-contract-fixtures";

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
  logGenerationStackReadiness: vi.fn(),
}));

vi.mock("@manga-ai-studio/workflow", () => ({
  sendChapterGenerateRequested: sendChapterGenerateRequestedMock,
  runFullChapterPipelineFromJob: runFullChapterPipelineFromJobMock,
  isPipelineV3StoryboardEnabled: () => true,
  extractChapterVisualContractUiFromOutline: () => ({ preLaunchAcknowledged: true }),
}));

vi.mock("@manga-ai-studio/billing", () => ({
  estimateChapterTextTokensFromRules: estimateChapterTextTokensFromRulesMock,
}));

vi.mock("@/lib/age-gate", () => ({
  canAccessMatureContent: () => true,
  canBypassMatureContent: () => false,
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

const ctx = { params: Promise.resolve({ id: "project-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  // P0.6 — ces fixtures décrivent un plan legacy avec 1 blueprint pour 75 images.
  // Le guard P0.6 refuserait ce cas. Comme ces tests valident d'autres aspects
  // (job.input, legacy outline, source), on active l'expansion legacy.
  process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
  getAppUserMock.mockResolvedValue(user);
  checkRateLimitMock.mockResolvedValue({ ok: true });
  getGenerationStackStatusMock.mockReturnValue({
    canGenerateChapters: true,
    canRunV3Premium: true,
    hasFal: true,
    hasStoragePersistence: true,
    hasOpenAI: true,
    visionPremiumQaEnvReady: true,
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
  }, 60_000);

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
    // panelBlueprints est défini car le snapshot contient des blueprints
    expect(jobInput?.panelBlueprints).toBeDefined();
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);
});
