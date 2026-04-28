import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPremiumLaunchChapter as buildPremiumChapter,
  premiumTestUser as user,
} from "./premium-contract-fixtures";

const prismaMock = {
  chapter: { findFirst: vi.fn(), update: vi.fn() },
  character: { findMany: vi.fn() },
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
  isUnlimitedAdminEmail: () => true,
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

vi.mock("@manga-ai-studio/ai", () => ({
  computeShotVarietyBudget: () => ({ varietyScore: 0.8, missingShots: [] }),
  computeContractualFocusAdequacy: () => ({ blocking: false, score: 0.9, violations: [] }),
  computePremiumReadinessScore: () => 0.9,
  // AUDIT v2 — l'enrichisseur narratif est maintenant appelé de manière
  // explicite par buildGenerationJobInputFromSnapshot pour garantir
  // `panelBlueprints.length >= minimumImages`. En test, on duplique le
  // dernier blueprint jusqu'au minimum (suffisant pour valider que la route
  // launch passe le guard).
  expandBlueprintsToMinimum: (blueprints: unknown[], minimum: number) => {
    if (blueprints.length === 0 || blueprints.length >= minimum) return blueprints;
    const result = [...blueprints];
    let i = 0;
    while (result.length < minimum) {
      const seed = blueprints[i % blueprints.length] as Record<string, unknown>;
      result.push({
        ...seed,
        panelNumber: result.length + 1,
        panelId: `${seed.panelId ?? "panel"}_enrich_${result.length + 1}`,
      });
      i += 1;
    }
    return result;
  },
  buildPremiumChapterContractAsync: async () => ({ productionOutline: {}, productionPlan: {}, panelBlueprints: [], coverage: {} }),
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
      minimumImages: 75,
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    }),
  };
});

const ctx = { params: Promise.resolve({ id: "project-1", chapterId: "chapter-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  // P0.6 — fixtures legacy avec 1 blueprint pour 75 images : on active le flag.
  process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
  getAppUserMock.mockResolvedValue(user);
  checkRateLimitMock.mockResolvedValue({ ok: true });
  getGenerationStackStatusMock.mockReturnValue({
    configuredProviders: ["fal"],
    preferredImageProvider: "fal",
    canGenerateChapters: true,
    canGenerateImages: true,
    canRunV3Premium: true,
    hasFal: true,
    hasStoragePersistence: true,
    hasOpenAI: true,
    visionPremiumQaEnvReady: true,
    operationalStatus: "FULLY_OPERATIONAL",
    degradedModes: [],
    isDegraded: false,
    allowMockImageProvider: false,
    premiumVisualQaPreflight: {
      ok: true,
      missing: [],
      strictlyRequired: false,
      launchBlocked: false,
    },
    blockers: [],
    warnings: [],
  });
  estimateChapterTextTokensFromRulesMock.mockResolvedValue(42);
  sendChapterGenerateRequestedMock.mockResolvedValue({ ok: true });
  runFullChapterPipelineFromJobMock.mockResolvedValue({ ok: true });
  prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
  prismaMock.character.findMany.mockResolvedValue([]);
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

  async function postLaunchJobInput(): Promise<Record<string, unknown>> {
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
    return jobInput!;
  }

  it("envoie le payload chapitre complet au pipeline (hero, actifs, PNJ, créatures, lieux)", async () => {
    const jobInput = await postLaunchJobInput();
    expect(jobInput.source).toBe("chapter_studio_launch");
    expect(jobInput.heroCharacterId).toBe("hero-1");
    expect(jobInput.focusCharacterIds).toEqual(["hero-1", "support-1"]);
    expect(jobInput.activeNpcIds).toEqual(["npc-1", "npc-2"]);
    expect(jobInput.activeCreatureIds).toEqual(["creature-1"]);
    expect(jobInput.locationIds).toEqual(["dojo", "rooftop"]);
    expect(typeof jobInput.premiumReadinessScore).toBe("number");
    expect(jobInput.productionOutline).toBeDefined();
    expect(jobInput.productionPlan).toBeDefined();
  });

  it("propage heroCharacterId dans le job input", async () => {
    const jobInput = await postLaunchJobInput();
    expect(jobInput.heroCharacterId).toBe("hero-1");
  });

  it("propage locationIds dans le job input", async () => {
    const jobInput = await postLaunchJobInput();
    expect(jobInput.locationIds).toEqual(["dojo", "rooftop"]);
  });

  it("propage activeNpcIds dans le job input", async () => {
    const jobInput = await postLaunchJobInput();
    expect(jobInput.activeNpcIds).toEqual(["npc-1", "npc-2"]);
  });

  it("propage activeCreatureIds dans le job input", async () => {
    const jobInput = await postLaunchJobInput();
    expect(jobInput.activeCreatureIds).toEqual(["creature-1"]);
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
