import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const composeMock = vi.fn();

const minimalProductionBeat = {
  beatId: "b1",
  summary: "Résumé du beat un assez long pour les garde-fous",
  narrativeFunction: "progression",
  whyThisBeatExists: "Ancre narrative du chapitre",
  dramaticChange: "Tension modérée",
  involvedCharacters: [] as string[],
};

const validBuilderReturn = {
  productionOutline: {
    source: "premium_rebuilt" as const,
    chapterGoal: "Objectif de chapitre décrit avec assez de détails",
    cliffhanger: "Cliffhanger explicite pour fermer le chapitre",
    beats: [minimalProductionBeat],
  },
  productionPlan: {
    pageCount: 0,
    pages: [],
    panelsPerPage: [],
    estimatedImages: 0,
    targetImages: 0,
    minimumImages: 70,
    panelBlueprints: [],
    focusDistribution: {},
  },
};

vi.mock("@manga-ai-studio/db", () => ({
  prisma: {
    character: { findMany: vi.fn().mockResolvedValue([]) },
    location: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@manga-ai-studio/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@manga-ai-studio/ai")>();
  return {
    ...actual,
    composeVisualWorldContract: (...args: unknown[]) => composeMock(...args),
    buildPremiumChapterContractAsync: vi.fn().mockResolvedValue(validBuilderReturn),
  };
});

describe("buildPremiumChapterContractFromApprovedOutline — VisualWorld strict", () => {
  beforeEach(() => {
    composeMock.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("lève premium_visual_world_compose_failed en premium strict si compose échoue", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    composeMock.mockRejectedValue(new Error("compose boom"));
    const { buildPremiumChapterContractFromApprovedOutline } = await import(
      "../lib/premium-chapter-contract"
    );
    await expect(
      buildPremiumChapterContractFromApprovedOutline({
        approvedOutline: {
          id: "o1",
          beats: [{ id: "b1", summary: "s", pageRole: null, turn: null, characters: [] }],
        } as never,
        chapterId: "ch1",
        projectId: "pr1",
      }),
    ).rejects.toThrow(/premium_visual_world_compose_failed/);
  });

  it("n’interdit pas compose échoué hors premium strict (pas de throw sur VisualWorld)", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "false");
    composeMock.mockRejectedValue(new Error("compose soft fail"));
    const { buildPremiumChapterContractFromApprovedOutline } = await import(
      "../lib/premium-chapter-contract"
    );
    await expect(
      buildPremiumChapterContractFromApprovedOutline({
        approvedOutline: {
          id: "o1",
          beats: [{ id: "b1", summary: "s", pageRole: null, turn: null, characters: [] }],
        } as never,
        chapterId: "ch1",
        projectId: "pr1",
      }),
    ).resolves.toMatchObject({
      productionOutline: expect.objectContaining({ source: "premium_rebuilt" }),
    });
  });
});
