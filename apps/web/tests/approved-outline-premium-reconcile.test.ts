import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
  chapter: { findFirst: vi.fn(), update: vi.fn() },
  character: { findMany: vi.fn() },
};

const getAppUserMock = vi.fn();
const getOwnedChapterMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/get-app-user", () => ({ getAppUser: getAppUserMock }));
vi.mock("@/lib/ownership", () => ({ getOwnedChapter: getOwnedChapterMock }));
vi.mock("@/lib/age-gate", () => ({
  canAccessMatureContent: () => true,
  canBypassMatureContent: () => false,
  getAgeGateMessage: () => "blocked",
  projectRequiresAgeGate: () => false,
}));

// Mock buildPremiumChapterContractAsync pour retourner un contrat serveur riche
const mockServerContract = {
  productionOutline: {
    source: "premium_rebuilt",
    chapterGoal: "But du chapitre",
    cliffhanger: "Fin",
    beats: Array.from({ length: 5 }, (_, i) => ({
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
    pageCount: 6,
    pages: Array.from({ length: 6 }, (_, i) => ({
      pageNumber: i + 1,
      beatIds: [`beat-${i + 1}`],
      panelCount: 5,
      imageTarget: 5,
      criticalPanelCount: 1,
    })),
    panelsPerPage: Array.from({ length: 6 }, () => 5),
    estimatedImages: 30,
    targetImages: 30,
    minimumImages: 30,
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
        shotType: "close_up",
        mustShowEnemy: false,
        requiredNpcCount: 0,
        requiredProps: [{ id: "prop-katana", canonicalName: "katana", mustBeVisible: true }],
        requiredLocationSignals: [],
        presenceObligations: [],
        cutawayType: "none",
        heroCenterAllowed: true,
        criticality: "medium",
        mustShowCharacterIds: ["hero-1"],
        requiredCharacterIds: ["hero-1"],
      },
    ],
    premiumReadinessScore: 0.9,
    heroCenterRatio: 0.5,
    focusDistribution: { hero: 4, duo: 2 },
    propCoverage: { covered: ["katana"], missing: [] },
    enemyCoverage: { panelCount: 2, beatsCovered: ["beat-1"] },
    npcCoverage: { panelCount: 1, avgNpcCount: 2 },
    cutawayCoverage: { count: 1, ratio: 0.1 },
    dialogueAnchorCoverage: { anchored: 2, floating: 0 },
  },
  premiumMeta: { source: "premium_rebuilt", premiumReadinessScore: 0.9 },
};

vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContractAsync: vi.fn().mockResolvedValue(mockServerContract),
}));

vi.mock("@/lib/chapter-studio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chapter-studio")>();
  return {
    ...actual,
    patchChapterStudioSnapshot: vi.fn().mockImplementation((_outline: unknown, data: Record<string, unknown>) => ({
      status: "READY_FOR_GENERATION",
      currentStep: "production_plan",
      autosaveVersion: 1,
      history: [],
      updatedAt: new Date().toISOString(),
      data: {
        productionOutline: data.productionOutline,
        productionPlan: data.productionPlan,
        editorialOutline: data.editorialOutline,
      },
    })),
    buildChapterStructuredRuntimePrismaFields: vi.fn().mockReturnValue({
      studioStatus: "READY_FOR_GENERATION",
      studioCurrentStep: "production_plan",
      studioUpdatedAt: new Date(),
      studioAutosaveVersion: 1,
      minimumImages: 30,
    }),
  };
});

const user = { id: "user-1" };
const ctx = { params: Promise.resolve({ id: "project-1", chapterId: "chapter-1" }) };

function buildApprovedOutline(beatCount = 5) {
  return {
    summary: "Résumé du chapitre",
    cliffhanger: "La porte s'ouvre",
    beats: Array.from({ length: beatCount }, (_, i) => ({
      id: `beat-${i + 1}`,
      summary: `Beat ${i + 1} avec du contenu narratif`,
      pageRole: "action",
      turn: "montée",
      characters: ["hero-1"],
      location: "dojo",
      emotionalDelta: 2,
    })),
    approvedAt: new Date().toISOString(),
    approvalVersion: "v1",
    source: "user_approved" as const,
  };
}

function buildChapterRecord() {
  return {
    id: "chapter-1",
    chapterNumber: 1,
    title: "Chapitre 1",
    summary: "Résumé",
    cliffhanger: "Fin",
    userIntent: "Test",
    outline: {},
    generatedImages: 0,
    acceptedImages: 0,
    rejectedImages: 0,
    missingImages: 30,
    minimumImages: 30,
    criticalPanelsCount: 0,
    criticalPanelsBlocked: 0,
    criticalPanelsMissingQa: 0,
    reviewBlockedReason: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppUserMock.mockResolvedValue(user);
  prismaMock.project.findFirst.mockResolvedValue({
    id: "project-1",
    primaryGenre: "action",
    tone: "dark",
  });
  prismaMock.character.findMany.mockResolvedValue([
    { id: "hero-1", roleType: "hero" },
  ]);
  prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
  getOwnedChapterMock.mockResolvedValue(buildChapterRecord());
});

describe("approved-outline PATCH — réconciliation premium serveur", () => {
  it("persiste des panelBlueprints avec characterVisualDna hydraté (hero-1)", async () => {
    prismaMock.character.findMany.mockResolvedValue([
      {
        id: "hero-1",
        name: "Hero",
        roleType: "hero",
        hairColor: "argent",
        eyeColor: "bleu",
        appearance: null,
        outfitDefault: "combinaison",
        stableVisualDNA: { faceShape: "oval", hairTexture: "wavy" },
        characterFingerprint: {},
        visualProfile: {},
        wardrobeProfile: {},
        bodyState: {},
        continuityProfile: {},
        speechProfile: {},
        voiceRegister: null,
        voiceSentenceLength: null,
        voiceVocabularyStyle: null,
        voiceFavoriteExpressions: [],
        voiceForbiddenExpressions: [],
        visualRefs: [],
        visualLocks: [],
        canonPack: null,
        loraAttachments: [],
      },
    ] as never);

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: { ...mockServerContract.productionOutline },
          productionPlan: {
            ...mockServerContract.productionPlan,
            panelBlueprints: [
              {
                ...mockServerContract.productionPlan.panelBlueprints[0],
                characterVisualDna: undefined,
              },
            ],
          },
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const updateCall = prismaMock.chapter.update.mock.calls[0]?.[0];
    const outline = updateCall?.data?.outline as Record<string, unknown> | undefined;
    const studio = outline?.studio as Record<string, unknown> | undefined;
    const data = studio?.data as Record<string, unknown> | undefined;
    const plan = data?.productionPlan as Record<string, unknown> | undefined;
    const bps = plan?.panelBlueprints as Array<{ characterVisualDna?: Array<{ characterId: string; hairColor?: string }> }> | undefined;
    expect(Array.isArray(bps) && bps?.length).toBeGreaterThan(0);
    const dna = bps![0]?.characterVisualDna;
    expect(Array.isArray(dna)).toBe(true);
    expect(dna?.some((d) => d.characterId === "hero-1")).toBe(true);
    expect(dna?.find((d) => d.characterId === "hero-1")?.hairColor).toBe("argent");
  });

  it("payload client sans panelBlueprints est enrichi par le serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: { ...mockServerContract.productionOutline },
          productionPlan: {
            ...mockServerContract.productionPlan,
            panelBlueprints: [], // client envoie vide
          },
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Le serveur doit avoir enrichi avec ses panelBlueprints
    expect(payload.premiumMeta?.panelBlueprintsCount).toBeGreaterThan(0);
  });

  it("payload client avec heroCenterRatio absent est enrichi par le serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const planWithoutRatio = { ...mockServerContract.productionPlan };
    delete (planWithoutRatio as Record<string, unknown>).heroCenterRatio;

    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: { ...mockServerContract.productionOutline },
          productionPlan: planWithoutRatio,
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.premiumMeta?.heroCenterRatio).toBeDefined();
    expect(typeof payload.premiumMeta?.heroCenterRatio).toBe("number");
  });

  it("payload client avec propCoverage absent est enrichi par le serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const planWithoutPropCoverage = { ...mockServerContract.productionPlan };
    delete (planWithoutPropCoverage as Record<string, unknown>).propCoverage;

    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: { ...mockServerContract.productionOutline },
          productionPlan: planWithoutPropCoverage,
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.premiumMeta?.propCoverage).toBeDefined();
  });

  it("payload client avec panelBlueprints vides est remplacé par le contrat serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");

    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: { ...mockServerContract.productionOutline },
          productionPlan: {
            ...mockServerContract.productionPlan,
            panelBlueprints: [],
          },
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Le serveur a ses propres blueprints → doit les injecter
    expect(payload.premiumMeta?.panelBlueprintsCount).toBe(mockServerContract.productionPlan.panelBlueprints.length);
  });

  it("payload client contradictoire (nombre de beats différent) est reconstruit par le serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");

    // approvedOutline a 5 beats mais productionOutline client en a 3
    const outlineWith3Beats = {
      ...mockServerContract.productionOutline,
      beats: mockServerContract.productionOutline.beats.slice(0, 3),
    };

    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          productionOutline: outlineWith3Beats,
          productionPlan: mockServerContract.productionPlan,
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    // Le serveur doit avoir reconstruit avec ses 5 beats
    const updateCall = prismaMock.chapter.update.mock.calls[0]?.[0];
    const outline = updateCall?.data?.outline as Record<string, unknown> | undefined;
    const studioData = (outline?.studio as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const po = studioData?.productionOutline as Record<string, unknown> | undefined;
    if (po) {
      expect(Array.isArray(po.beats) && (po.beats as unknown[]).length).toBe(5);
    }
  });

  it("sans payload client, utilise directement le contrat serveur", async () => {
    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");

    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: buildApprovedOutline(5),
          // pas de productionOutline ni productionPlan
        }),
      }),
      ctx,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.premiumMeta?.panelBlueprintsCount).toBe(mockServerContract.productionPlan.panelBlueprints.length);
    expect(payload.premiumMeta?.heroCenterRatio).toBeDefined();
  });
});
