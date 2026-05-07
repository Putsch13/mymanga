import { beforeEach, describe, expect, it, vi } from "vitest";
import * as studioCore from "@manga-ai-studio/core";

const prismaMock = {
  chapter: { findFirst: vi.fn() },
  character: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  npcGroup: { findMany: vi.fn() },
  worldProp: { findMany: vi.fn() },
};

const getAppUserMock = vi.fn();
const getOwnedProjectMock = vi.fn();
const estimateChapterTextTokensFromRulesMock = vi.fn();
const buildProjectContextMock = vi.fn();
const generateChapterBundleMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@/lib/ownership", () => ({
  getOwnedProject: getOwnedProjectMock,
}));

vi.mock("@/lib/generation/stack-readiness", () => ({
  getGenerationStackStatus: () => ({
    configuredProviders: ["fal"],
    preferredImageProvider: "fal",
    operationalStatus: "FULLY_OPERATIONAL",
    degradedModes: [],
    isDegraded: false,
    hasOpenAI: true,
    hasFal: true,
    hasStoragePersistence: true,
    allowMockImageProvider: false,
    canGenerateImages: true,
    canGenerateChapters: true,
    canRunV3Premium: true,
    visionPremiumQaEnvReady: true,
    premiumVisualQaPreflight: {
      ok: true,
      missing: [] as string[],
      strictlyRequired: false,
      launchBlocked: false,
    },
    blockers: [] as string[],
    warnings: [] as string[],
  }),
  logGenerationStackReadiness: vi.fn(),
}));

vi.mock("@manga-ai-studio/billing", () => ({
  estimateChapterTextTokensFromRules: estimateChapterTextTokensFromRulesMock,
}));

vi.mock("@manga-ai-studio/memory", () => ({
  buildProjectContext: buildProjectContextMock,
}));

const inferNarrativeFactsFromBeatMock = vi.fn();
const inferRequiredPropsFromBeatMock = vi.fn();
const buildPanelBlueprintsFromBeatMock = vi.fn();
const computeChapterFocusBudgetMock = vi.fn();
const computePremiumReadinessScoreMock = vi.fn();
const indexVisualWorldPropsByBeatMock = vi.fn();

vi.mock("@manga-ai-studio/ai", () => ({
  generateChapterBundle: generateChapterBundleMock,
  composeVisualWorldContract: vi.fn().mockImplementation(async (input: { chapterId: string; beats: Array<{ beatId: string }> }) => ({
    chapterId: input.chapterId,
    source: "ai_generated" as const,
    locations: [
      {
        id: "loc-mock",
        label: "Lieu IA",
        kind: "interior",
        description: "Description lieu composé",
        visualAnchors: [] as string[],
        architecture: [] as string[],
        lighting: [] as string[],
        atmosphere: [] as string[],
        recurringProps: [] as string[],
        negativeConstraints: [] as string[],
        source: "ai_generated" as const,
        canonPolicy: "temporary" as const,
      },
    ],
    props: [],
    npcGroups: [],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: input.beats.map((b) => ({
      beatId: b.beatId,
      locationId: "loc-mock",
      primaryPropIds: [] as string[],
      npcGroupIds: [] as string[],
      creatureIds: [] as string[],
      vehicleIds: [] as string[],
      factionIds: [] as string[],
    })),
  })),
  inferNarrativeFactsFromBeat: inferNarrativeFactsFromBeatMock,
  inferRequiredPropsFromBeat: inferRequiredPropsFromBeatMock,
  buildPanelBlueprintsFromBeat: buildPanelBlueprintsFromBeatMock,
  computeChapterFocusBudget: computeChapterFocusBudgetMock,
  computePremiumReadinessScore: computePremiumReadinessScoreMock,
  // Enrichisseur narratif : passthrough sauf si sous le minimum, auquel cas
  // on duplique le dernier blueprint jusqu'à atteindre le minimum (suffisant
  // pour valider le comportement de la route).
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
  // Couche LLM — retourne null en test (pas de clé API)
  enrichNarrativeFactsWithLLM: vi.fn().mockResolvedValue(null),
  mergeNarrativeFacts: vi.fn().mockImplementation((heuristic: unknown[]) => heuristic),
  indexVisualWorldPropsByBeat: indexVisualWorldPropsByBeatMock,
  // Sprint B — shot plan est ajouté au productionPlan. Mock minimal qui
  // renvoie une structure stable pour ne pas casser les tests existants.
  buildChapterShotPlan: vi.fn().mockImplementation(
    (input: { blueprints?: unknown[]; projectTitle?: string | null; chapterTitle?: string | null }) => ({
      projectTitle: input.projectTitle ?? null,
      chapterTitle: input.chapterTitle ?? null,
      entries: Array.isArray(input.blueprints) ? input.blueprints.map((_, i) => ({ panelNumber: i + 1 })) : [],
      distribution: {
        totalPanels: Array.isArray(input.blueprints) ? input.blueprints.length : 0,
        byCategory: {},
        heroLeadRatio: 0,
        cutawayRatio: 0.25,
        uniqueShotTypes: 3,
        environmentPanels: 2,
        npcPanels: 1,
        propInsertPanels: 1,
        reactionPanels: 1,
      },
      reliability: { score: 1, launchAllowed: true, warnings: [], blockers: [] },
      humanReadable: "mocked shot plan",
    }),
  ),
  runCutawayQa: vi.fn().mockReturnValue({
    ok: true,
    totalBeats: 0,
    beatsWithCutaway: 0,
    beatsWithoutCutaway: [],
    warnings: [],
  }),
}));

const ctx = { params: Promise.resolve({ id: "project-1" }) };

function makeContext() {
  return {
    project: { title: "Projet", pitch: "Pitch", primaryGenre: "drama", tone: "dark", format: "webtoon" },
    characters: [{ id: "hero-1", name: "Hero", roleType: "hero", objective: null, fear: null, status: "active" }],
    relationships: [],
    arcs: [{ name: "Arc 1", summary: "Résumé arc", status: "open" }],
    recentChapters: [
      { chapterNumber: 2, title: "Chapitre 2", summary: "Résumé 2", cliffhanger: "Fin 2" },
      { chapterNumber: 1, title: "Chapitre 1", summary: "Résumé 1", cliffhanger: "Fin 1" },
    ],
    recentMemory: [],
    retrievedDocs: [],
    locations: [{ name: "Dojo", description: "Lieu" }],
  };
}

function makeBundle() {
  return {
    plotOptions: [{ id: "bold", title: "Intense", label: "bold", summary: "Résumé option" }],
    creativeDirection: { chapterGoal: "But", tone: "dark", whyNow: "Maintenant" },
    outline: {
      chapter_goal: "But",
      cliffhanger: "Fin",
      beats: Array.from({ length: 10 }, (_, index) => ({
        id: `beat_${index + 1}`,
        summary: `Beat ${index + 1}`,
        characters: ["Hero"],
        location: "Dojo",
        purpose: "progression",
        pageRole: index === 9 ? "cliffhanger" : "escalation",
        turn: `Turn ${index + 1}`,
        emotionalDelta: 1,
        structuredBeat: null,
      })),
    },
  };
}

function makePremiumBlueprint(beatId: string, panelNumber: number) {
  return {
    panelId: `${beatId}_p${panelNumber}`,
    beatId,
    pageNumber: 1,
    panelNumber,
    purpose: "action",
    shotType: "medium_shot",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [{ id: "prop-katana", canonicalName: "katana", mustBeVisible: true, narrativeRole: "weapon", visibilityMode: "foreground_insert" }],
    optionalProps: [],
    requiredLocationSignals: [],
    speakerAnchorCharacterId: null,
    dialogueCarrier: "speaker_visible" as const,
    cutawayType: "none" as const,
    heroCenterAllowed: true,
    criticality: "medium" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppUserMock.mockResolvedValue({ id: "user-1" });
  getOwnedProjectMock.mockResolvedValue({ id: "project-1", userId: "user-1" });
  estimateChapterTextTokensFromRulesMock.mockResolvedValue(321);
  buildProjectContextMock.mockResolvedValue(makeContext());
  generateChapterBundleMock.mockResolvedValue(makeBundle());
  prismaMock.character.findMany.mockResolvedValue([]);
  prismaMock.location.findMany.mockResolvedValue([]);
  prismaMock.npcGroup.findMany.mockResolvedValue([]);
  prismaMock.worldProp.findMany.mockResolvedValue([]);

  // Default premium mocks
  inferNarrativeFactsFromBeatMock.mockReturnValue([{ type: "action", confidence: 0.9, beatId: "beat_1", source: "heuristic" }]);
  inferRequiredPropsFromBeatMock.mockReturnValue([{ canonicalName: "katana", mustBeVisible: true, narrativeRole: "weapon", visibilityMode: "foreground_insert" }]);
  buildPanelBlueprintsFromBeatMock.mockImplementation((beat: { beatId: string }) =>
    [makePremiumBlueprint(beat.beatId, 1), makePremiumBlueprint(beat.beatId, 2)]
  );
  computeChapterFocusBudgetMock.mockReturnValue({
    focusDistribution: { hero: 12, environment: 4, enemy: 2, npc: 2 },
    shotDistribution: { medium_shot: 10, close_up: 6, wide_shot: 4 },
    violations: [],
    heroCenterRatio: 0.6,
    cutawayCount: 4,
    cutawayRatio: 0.2,
    enemyFocusPanels: 2,
    npcPanels: 2,
  });
  computePremiumReadinessScoreMock.mockReturnValue(0.85);
  indexVisualWorldPropsByBeatMock.mockReturnValue(undefined);
});

describe("chapter estimate route", () => {
  it("estime un nouveau chapitre quand chapterId est absent", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          userIntent: "Le héros se relève.",
          selectedPlotLabel: "bold",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.estimateMode).toBe("new_chapter");
    expect(payload.estimateContext?.canonicalProductionPlan).toMatchObject({
      format: expect.stringMatching(/manga|webtoon/),
      panelCount: expect.any(Number),
      beatCount: expect.any(Number),
    });
    expect(payload.estimateContext?.aiReadiness?.outline?.status).toBe("real");
    expect(Array.isArray(payload.estimateContext?.premiumBlockingReasons)).toBe(true);
    expect(typeof payload.estimateContext?.launchAlignedReady).toBe("boolean");
    expect(payload.estimateContext?.planStatus).toMatch(/ready|incomplete/);
    expect(payload.estimateContext?.continuityPreflight).toMatchObject({
      ok: expect.any(Boolean),
      blockers: expect.any(Array),
      panelCount: expect.any(Number),
    });
    expect(payload.targetChapter.chapterNumber).toBe(3);
    expect(buildProjectContextMock).toHaveBeenCalledWith(
      prismaMock,
      "project-1",
      "Le héros se relève.",
      expect.objectContaining({
        targetChapterId: null,
        targetChapterNumber: 3,
      }),
    );
    expect(generateChapterBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: undefined,
        chapterNumber: 3,
      }),
    );
  });

  it("estime un chapitre existant avec son vrai chapterNumber", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-3",
      chapterNumber: 3,
      title: "Chapitre 3",
      status: "draft",
    });

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          chapterId: "chapter-3",
          chapterNumber: 3,
          userIntent: "Régénérer le chapitre 3.",
          selectedPlotLabel: "safe",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.estimateMode).toBe("existing_chapter");
    expect(payload.targetChapter.chapterNumber).toBe(3);
    expect(generateChapterBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: "chapter-3",
        chapterNumber: 3,
        chapterTitle: "Chapitre 3",
      }),
    );
    expect(buildProjectContextMock).toHaveBeenCalledWith(
      prismaMock,
      "project-1",
      "Régénérer le chapitre 3.",
      expect.objectContaining({
        targetChapterId: "chapter-3",
        targetChapterNumber: 3,
      }),
    );
  });

  it("propage réellement les creativityControls jusqu'au bundle", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-3",
      chapterNumber: 3,
      title: "Chapitre 3",
      status: "draft",
    });
    const creativityControls = {
      noveltyLevel: 91,
      worldStrictness: 88,
      visualExoticism: 72,
      npcVariety: 67,
      environmentRichness: 95,
    };

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          chapterId: "chapter-3",
          chapterNumber: 3,
          userIntent: "Régénérer le chapitre 3 avec plus de densité.",
          selectedPlotLabel: "shock",
          creativityControls,
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.creativityControls).toEqual(creativityControls);
    expect(generateChapterBundleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        creativityControls,
      }),
    );
  });

  it("renvoie les champs premium dans productionPlan", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userIntent: "Le héros affronte son rival." }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionPlan).toBeDefined();
    expect(Array.isArray(payload.productionPlan.panelBlueprints)).toBe(true);
    expect(payload.productionPlan.panelBlueprints.length).toBeGreaterThan(0);
    expect(payload.productionPlan.focusDistribution).toBeDefined();
    expect(payload.productionPlan.propCoverage).toBeDefined();
    expect(payload.productionPlan.dialogueAnchorCoverage).toBeDefined();
    expect(typeof payload.productionPlan.dialogueAnchorCoverage.anchored).toBe("number");
    expect(typeof payload.productionPlan.dialogueAnchorCoverage.floating).toBe("number");
    expect(typeof payload.productionPlan.heroCenterRatio).toBe("number");
    expect(typeof payload.productionPlan.premiumReadinessScore).toBe("number");
  });

  it("productionOutline contient tous les beats (non tronqué à 5)", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userIntent: "Chapitre épique avec 10 beats." }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // makeBundle() génère 10 beats — productionOutline doit tous les contenir
    expect(payload.productionOutline).toBeDefined();
    expect(Array.isArray(payload.productionOutline.beats)).toBe(true);
    expect(payload.productionOutline.beats.length).toBe(10);
    // outlinePreview est limité à 5 pour l'affichage UI
    expect(payload.outlinePreview.beats.length).toBeLessThanOrEqual(5);
  });

  it("appelle les fonctions premium pour chaque beat", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 1 });

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userIntent: "Test appel fonctions premium." }),
      }),
      ctx,
    );

    // makeBundle() a 10 beats → chaque fonction doit être appelée 10 fois
    expect(inferNarrativeFactsFromBeatMock).toHaveBeenCalledTimes(10);
    expect(inferRequiredPropsFromBeatMock).toHaveBeenCalledTimes(10);
    expect(buildPanelBlueprintsFromBeatMock).toHaveBeenCalledTimes(10);
    expect(computeChapterFocusBudgetMock).toHaveBeenCalledTimes(1);
    expect(computePremiumReadinessScoreMock).toHaveBeenCalledTimes(1);
  });

  it("P8 — count natif sous la range 70-75 : densification déterministe vers 70 (réparable)", async () => {
    // Fix — au lieu de bloquer un chapitre à 20 panels, l'estimate densifie
    // DÉTERMINISTEMENT (pas de random) vers la range premium 70–75 en ajoutant
    // des cutaways/reactions/inserts dérivés des beats existants.
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-3",
      chapterNumber: 3,
      title: "Chapitre 3",
      status: "draft",
      minimumImages: 75,
    });
    buildPanelBlueprintsFromBeatMock.mockImplementation((beat: { beatId: string }) => [
      makePremiumBlueprint(beat.beatId, 1),
      makePremiumBlueprint(beat.beatId, 2),
    ]);

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          chapterId: "chapter-3",
          chapterNumber: 3,
          userIntent: "Régénérer le plan.",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.planStatus).toBe("ready");
    expect(payload.panelCountStatus).toBe("ok");
    expect(payload.rawBlueprintCount).toBe(20);
    expect(payload.enrichedBlueprintCount).toBe(72);
    // Plan canonique : le count « enrichi » vient de canonicalPlan→blueprints, pas du flag legacy densify.
    expect(payload.enrichmentApplied).toBe(false);
    expect(payload.enrichmentAddedCount).toBe(0);
    expect(payload.premiumPanelRange).toEqual({ min: 70, target: 72, max: 75 });
  });

  it("P1/P8 — densifie si nécessaire pour rester dans 70–75", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-4",
      chapterNumber: 4,
      title: "Chapitre 4",
      status: "draft",
      minimumImages: 10,
    });
    buildPanelBlueprintsFromBeatMock.mockImplementation((beat: { beatId: string }) => [
      makePremiumBlueprint(beat.beatId, 1),
      makePremiumBlueprint(beat.beatId, 2),
    ]);

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          chapterId: "chapter-4",
          chapterNumber: 4,
          userIntent: "Plan suffisant.",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rawBlueprintCount).toBe(20);
    expect(payload.enrichedBlueprintCount).toBe(72);
    expect(payload.enrichmentApplied).toBe(false);
    expect(payload.enrichmentAddedCount).toBe(0);
  });

  it("productionPlan contient cutawayCoverage (cutawayComplianceScore calculable)", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });
    // Blueprint avec cutaway pour vérifier que cutawayCoverage est bien calculé
    buildPanelBlueprintsFromBeatMock.mockImplementation((beat: { beatId: string }) => [
      { ...makePremiumBlueprint(beat.beatId, 1), cutawayType: "environment_establishing" },
      { ...makePremiumBlueprint(beat.beatId, 2), cutawayType: "none" },
    ]);

    const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
    const response = await mod.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userIntent: "Scène avec cutaway décor." }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionPlan.cutawayCoverage).toBeDefined();
    expect(typeof payload.productionPlan.cutawayCoverage.count).toBe("number");
    expect(typeof payload.productionPlan.cutawayCoverage.ratio).toBe("number");
  });

  it("PIPELINE_V3_PREMIUM_ONLY : launchAlignedReady false si preflight continuité bloque (DNA manquant)", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    const origMerge = studioCore.mergeRawBlueprintsWithCanonicalRhythm;
    const mergeSpy = vi.spyOn(studioCore, "mergeRawBlueprintsWithCanonicalRhythm").mockImplementation((raw, plan) => {
      const merged = origMerge(raw, plan);
      const first = merged[0];
      if (first) {
        merged[0] = {
          ...first,
          criticality: "critical",
          requiredCharacterIds: ["hero-1", "not-in-project-db"],
          characterVisualDna: [],
        };
      }
      return merged;
    });
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });
    try {
      const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
      const response = await mod.POST(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ userIntent: "Scène duo héros + allié absent de la base." }),
        }),
        ctx,
      );
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.estimateContext?.continuityPreflight?.blockers?.length).toBeGreaterThan(0);
      expect(payload.estimateContext?.continuityPreflight?.valid).toBe(false);
      expect(payload.estimateContext?.launchAlignedReady).toBe(false);
      expect(payload.estimateContext?.planStatus).toBe("incomplete");
    } finally {
      mergeSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("PIPELINE_V3_PREMIUM_ONLY : propage flags + index VW vers inferRequiredPropsFromBeat", async () => {
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    indexVisualWorldPropsByBeatMock.mockReturnValue({
      beat_1: [
        {
          id: "vw-key",
          canonicalName: "Clé du sanctuaire",
          category: "key",
          visualDescription: "bronze oxydé",
          ownerCharacterId: null,
          locationId: null,
          requiredBeatIds: ["beat_1"],
          continuityPolicy: "symbolic" as const,
        },
      ],
    });
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 2 });

    try {
      const mod = await import("../app/api/projects/[id]/chapters/estimate/route");
      const response = await mod.POST(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ userIntent: "Vérifier le contexte props premium." }),
        }),
        ctx,
      );
      const payload = await response.json();

      expect(indexVisualWorldPropsByBeatMock).toHaveBeenCalled();
      expect(inferRequiredPropsFromBeatMock).toHaveBeenCalled();
      expect(inferRequiredPropsFromBeatMock).toHaveBeenCalledWith(
        expect.objectContaining({ beatId: "beat_1" }),
        expect.any(Array),
        expect.objectContaining({
          premiumStrictChapterSourcing: true,
          suppressUniverseTemplateProps: true,
          visualWorldContractActive: false,
          premiumOnly: true,
          visualWorldContract: null,
          visualWorldPropsForBeat: expect.objectContaining({
            beat_1: expect.arrayContaining([
              expect.objectContaining({ canonicalName: "Clé du sanctuaire" }),
            ]),
          }),
        }),
      );
      expect(payload.estimateContext?.launchAlignedReady).toBe(
        payload.planStatus === "ready",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
