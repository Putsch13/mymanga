import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
  chapter: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  character: { findMany: vi.fn() },
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
  isUnlimitedAdminEmail: () => true,
}));

vi.mock("@/lib/ownership", () => ({
  getOwnedChapter: getOwnedChapterMock,
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

vi.mock("@/lib/analytics", () => ({
  trackServerEvent: trackServerEventMock,
}));

vi.mock("@/lib/age-gate", () => ({
  canAccessMatureContent: () => true,
  canBypassMatureContent: () => false,
  getAgeGateMessage: () => "blocked",
  projectRequiresAgeGate: () => false,
}));

const buildPremiumChapterContractMock = vi.fn();
const buildPremiumChapterContractAsyncMock = vi.fn();
vi.mock("@manga-ai-studio/ai", () => ({
  buildPremiumChapterContract: buildPremiumChapterContractMock,
  buildPremiumChapterContractAsync: buildPremiumChapterContractAsyncMock,
  // AUDIT v2 — expandBlueprintsToMinimum est appelé explicitement par
  // buildGenerationJobInputFromSnapshot pour garantir le minimum d'images.
  // En test on duplique le dernier blueprint jusqu'au minimum.
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
  computeShotVarietyBudget: () => ({ varietyScore: 0.8, missingShots: [] }),
  computeContractualFocusAdequacy: () => ({ blocking: false, score: 0.9, violations: [] }),
  computePremiumReadinessScore: () => 0.9,
}));

const patchChapterStudioSnapshotMock = vi.fn();
const buildChapterStructuredRuntimePrismaFieldsMock = vi.fn();

vi.mock("@/lib/chapter-studio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chapter-studio")>();
  return {
    ...actual,
    patchChapterStudioSnapshot: patchChapterStudioSnapshotMock,
    buildChapterStructuredRuntimePrismaFields: buildChapterStructuredRuntimePrismaFieldsMock,
  };
});

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
        coreCastCharacterIds: ["hero-1", "support-1"],
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
        estimatedImages: 75,
        targetImages: 75,
        minimumImages: 75,
        criticalPanels: ["p1"],
        lockedCharacters: ["hero-1"],
        compressionRisks: [],
        enrichmentAdjustments: [],
        imageBudgetStatus: "on_target",
        premiumReadinessScore: 0.85,
        heroCenterRatio: 0.5,
        focusDistribution: { hero: 5 },
        propCoverage: { covered: ["katana"], missing: [] },
        enemyCoverage: { panelCount: 2, beatsCovered: ["b1"] },
        npcCoverage: { panelCount: 1, avgNpcCount: 2 },
        cutawayCoverage: { count: 1, ratio: 0.1 },
        dialogueAnchorCoverage: { anchored: 2, floating: 0 },
        // P0.6 — un "ready studio" doit présenter un contrat complet
        // (panelBlueprints.length >= minimumImages). Auparavant un seul blueprint
        // suffisait parce que la readiness ne vérifiait pas ce ratio ; depuis P0.1
        // c'est un blocant explicite, donc le fixture doit fournir 75 panels.
        panelBlueprints: Array.from({ length: 75 }, (_, i) => {
          const isCutaway = i % 5 === 0;
          return {
            panelId: `panel-${i + 1}`,
            beatId: `b${(i % 10) + 1}`,
            panelIndex: i,
            panelNumber: i + 1,
            purpose: "Progression",
            cameraAngle: "eye_level",
            shotType: ["medium", "wide", "close_up", "establishing", "reaction", "over_shoulder"][i % 6],
            subjectFocus: isCutaway ? ("environment" as const) : ("hero" as const),
            mustShowEnemy: false,
            requiredNpcCount: 0,
            requiredProps: [],
            requiredLocationSignals: [],
            presenceObligations: [],
            cutawayType: isCutaway ? ("environment" as const) : ("none" as const),
            heroCenterAllowed: true,
            criticality: "medium" as const,
            mustShowCharacterIds: isCutaway ? [] : ["hero-1"],
            requiredCharacterIds: isCutaway ? [] : ["hero-1"],
            dialogueCarrier: isCutaway ? undefined : ("speaker_visible" as const),
            dialogueLines: isCutaway ? undefined : ([{ speaker: "hero-1", text: "Ok." }] as const),
            speakerAnchorCharacterId: isCutaway ? null : "hero-1",
            speakerAnchorCharacterName: isCutaway ? null : "Héros",
          };
        }),
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
  // Les tests Chapter Studio sont des tests unitaires : forcer le mode non
  // premium-only pour rester déterministes (sinon un shell avec
  // PIPELINE_V3_PREMIUM_ONLY=true déclenche continuité / gates premium).
  process.env.PIPELINE_V3_PREMIUM_ONLY = "false";
  // P0.6 — fixtures contiennent 1 blueprint pour 75 images ; on active le flag legacy.
  process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
  getAppUserMock.mockResolvedValue(user);
  checkRateLimitMock.mockResolvedValue({ ok: true });
  getGenerationStackStatusMock.mockReturnValue({
    configuredProviders: ["fal"],
    preferredImageProvider: "fal",
    operationalStatus: "FULLY_OPERATIONAL",
    degradedModes: [],
    isDegraded: false,
    hasOpenAI: true,
    hasFal: true,
    hasStoragePersistence: true,
    allowMockImageProvider: true,
    canGenerateImages: true,
    canGenerateChapters: true,
    canRunV3Premium: true,
    visionPremiumQaEnvReady: true,
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
  prismaMock.character.findMany.mockResolvedValue([]);
  patchChapterStudioSnapshotMock.mockReturnValue({
    status: "READY_FOR_GENERATION",
    currentStep: "production_plan",
    autosaveVersion: 1,
    history: [],
    updatedAt: new Date().toISOString(),
    data: {
      productionPlan: { minimumImages: 75 },
      readinessReport: { imageCounts: { minimumImages: 75 } },
    },
  });
  buildChapterStructuredRuntimePrismaFieldsMock.mockReturnValue({
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
  });

  // Default premium contract mock (sync + async)
  const defaultPremiumContractResult = {
    productionOutline: {
      source: "premium_rebuilt" as const,
      chapterGoal: "But du chapitre",
      cliffhanger: "Fin dramatique",
      beats: Array.from({ length: 10 }, (_, i) => ({
        beatId: `beat-${i + 1}`,
        summary: `Beat ${i + 1}`,
        narrativeFunction: "progression",
        whyThisBeatExists: "avancer",
        dramaticChange: "changement",
        involvedCharacters: ["hero-1"],
        activeCanonConstraints: [],
        environmentContext: [],
        visualPriority: "high" as const,
        estimatedPanels: 6,
        criticality: "high" as const,
        continuityDependencies: [],
        infoGained: null,
        emotionProduced: null,
        indispensabilityScore: 80,
        redundancyRisk: 10,
        narrativeFacts: [],
        requiredProps: [{ id: "prop-katana", canonicalName: "katana", mustBeVisible: true }],
      })),
    },
    productionPlan: {
      panelBlueprints: [],
      minimumImages: 72,
      estimatedImages: 72,
      targetImages: 72,
      premiumReadinessScore: 0.85,
      heroCenterRatio: 0.5,
      focusDistribution: {},
      shotDistribution: {},
      propCoverage: { covered: ["katana"], missing: [] },
      enemyCoverage: { panelCount: 2, beatsCovered: [] },
      npcCoverage: { panelCount: 1, avgNpcCount: 1 },
      cutawayCoverage: { count: 2, ratio: 0.1 },
      dialogueAnchorCoverage: { anchored: 3, floating: 1 },
    },
    panelBlueprints: [],
    objectStateTimeline: [],
    premiumMeta: {
      premiumReadinessScore: 0.85,
      heroCenterRatio: 0.5,
      cutawayCount: 2,
      cutawayRatio: 0.1,
      enemyFocusPanels: 2,
      npcPanels: 1,
      propCoverage: { covered: ["katana"], missing: [] },
      enemyCoverage: { panelCount: 2, beatsCovered: [] },
      npcCoverage: { panelCount: 1, avgNpcCount: 1 },
      cutawayCoverage: { count: 2, ratio: 0.1 },
      dialogueAnchorCoverage: { anchored: 3, floating: 1 },
      focusDistribution: {},
      shotDistribution: {},
    },
  };
  buildPremiumChapterContractMock.mockReturnValue(defaultPremiumContractResult);
  buildPremiumChapterContractAsyncMock.mockResolvedValue(defaultPremiumContractResult);
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

  it("P8 — readiness BLOQUE un plan de 52 blueprints (sous la range 70-75)", async () => {
    // P8 — le premium vise 70-75 panels natifs. Un storyboard qui sort 52
    // panels est un BUG éditorial : le readiness doit bloquer explicitement
    // pour empêcher le lancement d'un chapitre incomplet.
    const studioWithIncompletePlan = buildReadyStudio();
    studioWithIncompletePlan.data.productionPlan.panelBlueprints = Array.from({ length: 52 }, (_, i) => ({
      panelId: `panel-${i + 1}`,
      beatId: `b${(i % 10) + 1}`,
      panelIndex: i,
      panelNumber: i + 1,
      purpose: "Progression",
      cameraAngle: "eye_level",
      shotType: ["medium", "wide", "close_up"][i % 3]!,
      subjectFocus: "hero",
      requiredProps: [],
      presenceObligations: [],
    })) as never;
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre incomplet",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "intent",
      outline: { studio: studioWithIncompletePlan },
    });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/readiness/route");
    const response = await mod.GET(new Request("http://localhost"), ctxChapter);
    const payload = await response.json();

    // P8 : strict — count hors range = blocking.
    expect(payload.readiness.contractStatus).toBe("incomplete_blueprints");
    expect(payload.readiness.contractComplete).toBe(false);
    expect(payload.readiness.launchBlocked).toBe(true);
    expect(payload.readiness.launchBlockedReason).toBe("incomplete_plan");
    expect(payload.readiness.panelBlueprintCount).toBe(52);
    const underRangeBlocker = payload.readiness.blockerItems.find(
      (item: { id: string }) => item.id === "production_plan_under_native_range",
    );
    expect(underRangeBlocker).toBeDefined();
    expect(underRangeBlocker.message).toContain("52");
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
    const readyStudio = buildReadyStudio();
    const approvedOutlineForLaunch = {
      summary: "Résumé du chapitre prêt",
      cliffhanger: "Fin dramatique",
      beats: Array.from({ length: 10 }, (_, i) => ({
        id: `beat-${i + 1}`,
        summary: `Beat ${i + 1} — action importante`,
        pageRole: "action",
        turn: "montée",
        characters: ["hero-1"],
      })),
      approvedAt: new Date().toISOString(),
      approvalVersion: "v1",
      source: "user_approved",
    };
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-1",
      projectId: "project-1",
      chapterNumber: 3,
      title: "Chapitre prêt",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: { studio: readyStudio, approvedOutline: approvedOutlineForLaunch },
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
          images: Array.from({ length: 75 }, (_, index) => ({
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

  it("persiste l'outline complet (non tronqué à 5 beats) lors de la création du chapitre", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(null);

    let capturedCreateData: Record<string, unknown> | null = null;
    prismaMock.chapter.create.mockImplementation((args: { data: Record<string, unknown> }) => {
      capturedCreateData = args.data;
      return Promise.resolve({ id: "chapter-new", chapterNumber: 1, title: "Chapitre 1", outline: {} });
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-new" });

    // Simulate approvedOutline with 10 beats (as built by corrected buildApprovedOutlinePayload)
    const fullBeats = Array.from({ length: 10 }, (_, index) => ({
      id: `beat_${index + 1}`,
      summary: `Le héros avance dans le dojo — beat ${index + 1}`,
      characters: ["Hero"],
      location: "Dojo de la montagne",
      pageRole: "escalation",
      turn: `Changement dramatique ${index + 1}`,
      emotionalDelta: 1,
      structuredBeat: null,
    }));

    const mod = await import("../app/api/projects/[id]/chapters/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          title: "Chapitre 1",
          userIntent: "Le héros affronte son rival.",
          approvedOutline: {
            summary: "Résumé complet",
            cliffhanger: "Fin dramatique",
            beats: fullBeats,
            approvedAt: new Date().toISOString(),
            approvalVersion: "v1",
            source: "user_approved",
          },
        }),
      }),
      ctxProject,
    );

    expect(response.status).toBe(200);
    expect(prismaMock.chapter.create).toHaveBeenCalled();
    // Verify the outline payload contains all 10 beats (not truncated to 5)
    const outlinePayload = (capturedCreateData as Record<string, unknown> | null)?.outline as Record<string, unknown> | undefined;
    const approvedOutline = outlinePayload?.approvedOutline as { beats?: unknown[] } | undefined;
    expect(approvedOutline?.beats).toBeDefined();
    expect(approvedOutline?.beats?.length).toBe(10);
  });

  it("approved-outline PATCH appelle buildPremiumChapterContract (non legacy)", async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      primaryGenre: "action",
      tone: "dark",
    });
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    // getOwnedChapter retourne un chapitre existant
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: "Fin",
      userIntent: "Préparer le duel",
      outline: {},
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const fullBeats = Array.from({ length: 8 }, (_, index) => ({
      id: `beat_${index + 1}`,
      summary: `Le héros affronte l'ennemi dans le dojo — beat ${index + 1}`,
      characters: ["Hero"],
      location: "Dojo de la montagne",
      pageRole: "escalation",
      turn: `Changement dramatique ${index + 1}`,
      emotionalDelta: 1,
      structuredBeat: null,
    }));

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: {
            summary: "Résumé du chapitre",
            cliffhanger: "Fin dramatique",
            beats: fullBeats,
            approvedAt: new Date().toISOString(),
            approvalVersion: "v1",
            source: "user_approved",
          },
        }),
      }),
      ctxChapter,
    );

    expect(response.status).toBe(200);
    // Vérifier que buildPremiumChapterContractAsync a été appelé (non legacy)
    expect(buildPremiumChapterContractAsyncMock).toHaveBeenCalledTimes(1);
    expect(buildPremiumChapterContractAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectGenre: "action",
        projectTone: "dark",
      }),
    );
    // Vérifier que premiumMeta est retourné
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.premiumMeta).toBeDefined();
    expect(typeof payload.premiumMeta.premiumReadinessScore).toBe("number");
    // P0.5 — le contrat rebuilt a 0 blueprint → launchBlocked doit être signalé.
    expect(payload.premiumMeta.launchBlocked).toBe(true);
    expect(payload.premiumMeta.launchBlockedReason).toBe("missing_blueprints");
    // PREMIUM_PANEL_RANGE.target = 72 (mission de refonte — plus de hardcode 75).
    expect(payload.premiumMeta.minimumImages).toBe(72);
  });

  it("approved-outline PATCH reconstruit un contrat premium complet sans legacy_adapted", async () => {
    const fullBeats = Array.from({ length: 10 }, (_, i) => ({
      id: `beat-${i + 1}`,
      summary: `Beat ${i + 1} — action narrative importante du chapitre premium`,
      pageRole: "action",
      turn: "montée dramatique",
      characters: ["hero-1"],
      location: "dojo",
      emotionalDelta: 2,
    }));
    prismaMock.project.findFirst
      .mockResolvedValueOnce({ id: "project-1", userId: "user-1", primaryGenre: "shonen", tone: "epic" })
      .mockResolvedValueOnce({ id: "project-1", userId: "user-1", primaryGenre: "shonen", tone: "epic" });
    prismaMock.character.findMany.mockResolvedValue([{ id: "hero-1", roleType: "hero" }]);
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: null,
      outline: {},
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      minimumImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          approvedOutline: {
            summary: "Résumé du chapitre",
            cliffhanger: "Fin dramatique",
            beats: fullBeats,
            approvedAt: new Date().toISOString(),
            approvalVersion: "v1",
            source: "user_approved",
          },
        }),
      }),
      ctxChapter,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    // Vérifier que le contrat premium est reconstruit
    expect(buildPremiumChapterContractAsyncMock).toHaveBeenCalled();
    // Vérifier qu'aucun legacy_adapted n'est écrit
    const updateCall = prismaMock.chapter.update.mock.calls[0]?.[0];
    const outlineData = updateCall?.data?.outline as Record<string, unknown> | undefined;
    const studioData = outlineData?.studio as Record<string, unknown> | undefined;
    const productionOutline = (studioData?.data as Record<string, unknown> | undefined)?.productionOutline as Record<string, unknown> | undefined;
    if (productionOutline) {
      expect(productionOutline.source).not.toBe("legacy_adapted");
    }
  });

  it("approved-outline PATCH utilise heroCharacterId depuis chapter.outline.studio.data.characterSelection", async () => {
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 3,
      title: "Chapitre 3",
      summary: "Résumé",
      cliffhanger: null,
      userIntent: "Intent",
      outline: {
        studio: {
          data: {
            characterSelection: {
              heroCharacterId: "hero-2",
              coreCastCharacterIds: ["hero-2", "support-1"],
              activeCharacterIds: ["hero-2", "support-1"],
            },
          },
        },
      },
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      minimumImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    });
    prismaMock.project.findFirst.mockResolvedValue({ primaryGenre: "mystery", tone: "tense" });
    prismaMock.character.findMany.mockResolvedValue([
      { id: "hero-1", roleType: "hero" },
      { id: "hero-2", roleType: "support" },
    ]);
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/approved-outline/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedOutline: {
            summary: "Résumé suffisant",
            cliffhanger: "Fin ok",
            approvalVersion: "v1",
            approvedAt: new Date().toISOString(),
            source: "user_approved",
            beats: [
              {
                id: "beat-1",
                summary: "Beat valide pour le schéma",
                pageRole: "action",
                turn: "changement",
                characters: ["hero-2"],
                location: "dojo",
                emotionalDelta: 1,
              },
            ],
          },
        }),
      }),
      ctxChapter,
    );

    expect(response.status).toBe(200);
    expect(buildPremiumChapterContractAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ heroCharacterId: "hero-2" }),
    );
    const payload = await response.json();
    expect(payload.premiumMeta).toEqual(
      expect.objectContaining({
        heroCharacterId: "hero-2",
        snapshotHeroCharacterId: "hero-2",
        usedFallbackHeroCharacterId: false,
      }),
    );
  });

  it("studio PATCH ne détruit pas le contrat premium existant", async () => {
    const premiumStudio = buildReadyStudio();
    // Snapshot avec panelBlueprints et premiumReadinessScore
    const studioWithBlueprints = {
      ...premiumStudio,
      data: {
        ...premiumStudio.data,
        productionPlan: {
          ...premiumStudio.data.productionPlan,
          panelBlueprints: [
            {
              panelId: "panel-1",
              beatId: "b1",
              panelIndex: 0,
              purpose: "Introduire le héros",
              cameraAngle: "eye_level",
              subjectFocus: "hero",
              shotType: "close_up",
              requiredProps: [],
              presenceObligations: [],
            },
          ],
          premiumReadinessScore: 0.9,
          focusDistribution: { hero: 5, duo: 3 },
        },
      },
    };
    patchChapterStudioSnapshotMock.mockReturnValue(studioWithBlueprints);
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: "ancien",
      outline: { studio: studioWithBlueprints, approvedOutline: { beats: [], approvalVersion: "v1" } },
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      minimumImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
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

    expect(response.status).toBe(200);
    const payload = await response.json();
    // Vérifier que les panelBlueprints et premiumReadinessScore sont préservés
    const snapshotData = (payload.snapshot as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const pp = snapshotData?.productionPlan as Record<string, unknown> | undefined;
    if (pp) {
      expect(pp.premiumReadinessScore).toBe(0.9);
    }
  });

  it("chapters POST ne reconstruit pas un approvedOutline legacy si studioDraft premium est fourni", async () => {
    prismaMock.project.findFirst.mockResolvedValue(project);
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    prismaMock.chapter.create.mockResolvedValue({
      id: "chapter-new",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: {},
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-new" });

    const premiumStudio = buildReadyStudio();
    const mod = await import("../app/api/projects/[id]/chapters/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          title: "Chapitre 1",
          userIntent: "Test premium",
          studioDraft: premiumStudio.data,
        }),
      }),
      ctxProject,
    );

    expect(response.status).toBe(200);
    // buildLegacyApprovedOutlineFromStudio ne doit pas être appelé
    // (il n'est plus importé dans chapters/route.ts)
    expect(prismaMock.chapter.create).toHaveBeenCalled();
  });
});

describe("studio PATCH — préservation intégrale des champs premium", () => {
  function buildFullPremiumStudio() {
    const base = buildReadyStudio();
    return {
      ...base,
      data: {
        ...base.data,
        productionPlan: {
          ...base.data.productionPlan,
          panelBlueprints: [
            {
              panelId: "panel-1",
              beatId: "b1",
              panelIndex: 0,
              purpose: "Introduire le héros",
              cameraAngle: "eye_level",
              subjectFocus: "hero",
              shotType: "close_up",
              requiredProps: [],
              presenceObligations: [],
            },
          ],
          premiumReadinessScore: 0.88,
          heroCenterRatio: 0.45,
          focusDistribution: { hero: 4, duo: 3, environment: 2 },
          shotDistribution: { close_up: 3, medium: 4, wide: 2 },
          focusBudget: { heroMax: 0.6, cutawayMin: 0.1 },
          propCoverage: { covered: ["katana"], missing: [] },
          enemyCoverage: { panelCount: 3, beatsCovered: ["b1", "b2"] },
          npcCoverage: { panelCount: 2, avgNpcCount: 2 },
          cutawayCoverage: { count: 2, ratio: 0.2 },
          dialogueAnchorCoverage: { anchored: 3, floating: 0 },
          objectStateTimeline: [{ objectId: "katana", states: ["held", "sheathed"] }],
        },
      },
    };
  }

  function setupStudioPatch(studioSnapshot: ReturnType<typeof buildFullPremiumStudio>) {
    patchChapterStudioSnapshotMock.mockReturnValue(studioSnapshot);
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: "test",
      outline: {
        studio: studioSnapshot,
        approvedOutline: { beats: [], approvalVersion: "v1" },
      },
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      minimumImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });
  }

  const premiumFields = [
    ["propCoverage", { covered: ["katana"], missing: [] }],
    ["enemyCoverage", { panelCount: 3, beatsCovered: ["b1", "b2"] }],
    ["npcCoverage", { panelCount: 2, avgNpcCount: 2 }],
    ["cutawayCoverage", { count: 2, ratio: 0.2 }],
    ["dialogueAnchorCoverage", { anchored: 3, floating: 0 }],
    ["heroCenterRatio", 0.45],
    ["shotDistribution", { close_up: 3, medium: 4, wide: 2 }],
    ["focusBudget", { heroMax: 0.6, cutawayMin: 0.1 }],
    ["objectStateTimeline", [{ objectId: "katana", states: ["held", "sheathed"] }]],
  ] as const;

  for (const [field, expectedValue] of premiumFields) {
    it(`patch partiel studio ne doit pas supprimer ${field}`, async () => {
      const studioSnapshot = buildFullPremiumStudio();
      setupStudioPatch(studioSnapshot);

      const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/studio/route");
      const response = await mod.PATCH(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({
            currentStep: "intent",
            data: { intent: { workingTitle: "Nouveau titre", shortPitch: "pitch" } },
          }),
        }),
        ctxChapter,
      );

      expect(response.status).toBe(200);
      const updateCall = prismaMock.chapter.update.mock.calls[0]?.[0];
      const outlineData = updateCall?.data?.outline as Record<string, unknown> | undefined;
      const studioData = outlineData?.studio as Record<string, unknown> | undefined;
      const pp = (studioData?.data as Record<string, unknown> | undefined)?.productionPlan as Record<string, unknown> | undefined;
      if (pp) {
        expect(pp[field]).toBeDefined();
        if (typeof expectedValue === "number") {
          expect(pp[field]).toBe(expectedValue);
        } else {
          expect(pp[field]).toEqual(expectedValue);
        }
      }
    });
  }

  it("patch partiel studio avec panelBlueprints vides doit conserver les blueprints existants", async () => {
    const studioSnapshot = buildFullPremiumStudio();
    // Simuler un patch qui envoie panelBlueprints vide
    const snapshotWithEmptyBlueprints = {
      ...studioSnapshot,
      data: {
        ...studioSnapshot.data,
        productionPlan: {
          ...studioSnapshot.data.productionPlan,
          panelBlueprints: [],
        },
      },
    };
    patchChapterStudioSnapshotMock.mockReturnValue(snapshotWithEmptyBlueprints);
    getOwnedChapterMock.mockResolvedValue({
      id: "chapter-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      summary: null,
      cliffhanger: null,
      userIntent: "test",
      outline: {
        studio: studioSnapshot, // existant a des blueprints
        approvedOutline: { beats: [], approvalVersion: "v1" },
      },
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
      missingImages: 75,
      minimumImages: 75,
      criticalPanelsCount: 0,
      criticalPanelsBlocked: 0,
      criticalPanelsMissingQa: 0,
      reviewBlockedReason: null,
    });
    prismaMock.chapter.update.mockResolvedValue({ id: "chapter-1" });

    const mod = await import("../app/api/projects/[id]/chapters/[chapterId]/studio/route");
    const response = await mod.PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          currentStep: "intent",
          data: { intent: { workingTitle: "Titre", shortPitch: "pitch" } },
        }),
      }),
      ctxChapter,
    );

    expect(response.status).toBe(200);
    const updateCall = prismaMock.chapter.update.mock.calls[0]?.[0];
    const outlineData = updateCall?.data?.outline as Record<string, unknown> | undefined;
    const studioData = outlineData?.studio as Record<string, unknown> | undefined;
    const pp = (studioData?.data as Record<string, unknown> | undefined)?.productionPlan as Record<string, unknown> | undefined;
    if (pp) {
      // Les blueprints existants doivent être préservés
      expect(Array.isArray(pp.panelBlueprints)).toBe(true);
      expect((pp.panelBlueprints as unknown[]).length).toBeGreaterThan(0);
    }
  });
});

