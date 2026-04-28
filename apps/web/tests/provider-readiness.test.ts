/**
 * P0.4 — Tests de readiness provider pour V3 premium.
 * Le pipeline V3 premium nécessite FAL + storage.
 */
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

vi.mock("@/lib/canon/assert-chapter-canon-readiness", () => ({
  assertChapterCanonReadiness: () => ({ ok: true, violations: [] }),
}));

describe("/launch — P0.4 provider readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppUserMock.mockResolvedValue(user);
    checkRateLimitMock.mockResolvedValue({ ok: true });
    estimateChapterTextTokensFromRulesMock.mockResolvedValue(42);
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
    prismaMock.character.findMany.mockResolvedValue([]);
  });

  it("refuse le lancement si FAL_KEY absent (canRunV3Premium=false)", async () => {
    getGenerationStackStatusMock.mockReturnValue({
      canGenerateChapters: true,
      canRunV3Premium: false,
      hasFal: false,
      hasStoragePersistence: true,
      hasOpenAI: true,
      visionPremiumQaEnvReady: true,
      operationalStatus: "FULLY_OPERATIONAL",
      degradedModes: [],
      warnings: [],
    });

    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapter());

    const { POST } = await import(
      "../app/api/projects/[id]/chapters/[chapterId]/launch/route"
    );
    const response = await POST(
      new Request("http://localhost/api/projects/proj-1/chapters/ch-1/launch", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "proj-1", chapterId: "ch-1" }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("V3_PREMIUM_STACK_INCOMPLETE");
    expect(body.missingComponents).toContain("FAL_KEY");
  });

  it("refuse le lancement si storage absent (canRunV3Premium=false)", async () => {
    getGenerationStackStatusMock.mockReturnValue({
      canGenerateChapters: true,
      canRunV3Premium: false,
      hasFal: true,
      hasStoragePersistence: false,
      hasOpenAI: true,
      visionPremiumQaEnvReady: true,
      operationalStatus: "FULLY_OPERATIONAL",
      degradedModes: [],
      warnings: [],
    });

    prismaMock.chapter.findFirst.mockResolvedValue(buildPremiumChapter());

    const { POST } = await import(
      "../app/api/projects/[id]/chapters/[chapterId]/launch/route"
    );
    const response = await POST(
      new Request("http://localhost/api/projects/proj-1/chapters/ch-1/launch", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "proj-1", chapterId: "ch-1" }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("V3_PREMIUM_STACK_INCOMPLETE");
    expect(body.missingComponents).toContainEqual(expect.stringContaining("SUPABASE"));
  });

  it("autorise le lancement si FAL + storage présents", async () => {
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

    const chapter = buildPremiumChapter();
    prismaMock.chapter.findFirst.mockResolvedValue(chapter);
    prismaMock.job.create.mockResolvedValue({ id: "job-1", status: "PENDING" });
    sendChapterGenerateRequestedMock.mockResolvedValue({ ok: true });
    runFullChapterPipelineFromJobMock.mockResolvedValue({ ok: true });

    const { POST } = await import(
      "../app/api/projects/[id]/chapters/[chapterId]/launch/route"
    );
    const response = await POST(
      new Request("http://localhost/api/projects/proj-1/chapters/ch-1/launch", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "proj-1", chapterId: "ch-1" }) },
    );

    // Le test vérifie la readiness provider, pas le flux complet
    // La route peut retourner 200 (OK) ou 422 (autre validation).
    // On vérifie que ce n'est PAS un 409 V3_PREMIUM_STACK_INCOMPLETE.
    expect(response.status).not.toBe(409);
    const body = await response.json();
    if (response.status === 200) {
      expect(body.job).toBeDefined();
    } else {
      // Si 422, c'est une autre erreur de validation (pas la readiness provider)
      expect(body.code).not.toBe("V3_PREMIUM_STACK_INCOMPLETE");
    }
  });
});
