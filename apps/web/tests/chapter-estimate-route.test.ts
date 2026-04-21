import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  chapter: { findFirst: vi.fn() },
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

vi.mock("@manga-ai-studio/ai", () => ({
  generateChapterBundle: generateChapterBundleMock,
  inferNarrativeFactsFromBeat: inferNarrativeFactsFromBeatMock,
  inferRequiredPropsFromBeat: inferRequiredPropsFromBeatMock,
  buildPanelBlueprintsFromBeat: buildPanelBlueprintsFromBeatMock,
  computeChapterFocusBudget: computeChapterFocusBudgetMock,
  computePremiumReadinessScore: computePremiumReadinessScoreMock,
  // Couche LLM — retourne null en test (pas de clé API)
  enrichNarrativeFactsWithLLM: vi.fn().mockResolvedValue(null),
  mergeNarrativeFacts: vi.fn().mockImplementation((heuristic: unknown[]) => heuristic),
  // P2.1bis — route estimate appelle désormais `expandBlueprintsToMinimum`
  // pour garantir un contrat complet (panelBlueprints.length >= minimumImages).
  // Mock : retourne le tableau d'origine, padded à `minimumPanels` en clonant
  // le premier élément (comportement équivalent à l'implémentation réelle
  // pour les besoins du test — sans les variations shotType détaillées).
  expandBlueprintsToMinimum: vi.fn().mockImplementation((blueprints: unknown[], minimumPanels: number) => {
    if (!Array.isArray(blueprints) || blueprints.length === 0) return blueprints ?? [];
    if (blueprints.length >= minimumPanels) return blueprints;
    const padded = [...blueprints];
    while (padded.length < minimumPanels) {
      padded.push({ ...(blueprints[0] as Record<string, unknown>), panelNumber: padded.length + 1 });
    }
    return padded;
  }),
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
    requiredProps: [{ canonicalName: "katana", mustBeVisible: true, narrativeRole: "weapon", visibilityMode: "foreground_insert" }],
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

  it("P2.1bis — sort un productionPlan avec panelBlueprints.length >= minimumImages (pas 55/75 ni 30/75)", async () => {
    // Cas utilisateur reel : "Régénérer le plan" sortait avec 55 blueprints
    // pour un minimum de 75, ce qui bloquait immédiatement le launch côté
    // studio avec `contractStatus=incomplete_blueprints`. La route estimate
    // doit maintenant appeler `expandBlueprintsToMinimum` en respectant
    // `chapter.minimumImages` pour éviter cette divergence.
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-3",
      chapterNumber: 3,
      title: "Chapitre 3",
      status: "draft",
      minimumImages: 75,
    });
    // Le builder de blueprints sort intentionnellement peu (2 par beat × 10 beats = 20),
    // comme ça se produit en prod avec certains chapitres.
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
          userIntent: "Régénérer le plan (cas bug utilisateur)",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionPlan).toBeDefined();
    expect(payload.productionPlan.minimumImages).toBe(75);
    // Cœur du fix : le contrat renvoyé doit honorer le minimum du chapitre.
    expect(payload.productionPlan.panelBlueprints.length).toBeGreaterThanOrEqual(75);
  });

  it("P2.1bis — respecte un minimumImages custom > 75 (ex. chapitre exigeant 100)", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "chapter-special",
      chapterNumber: 5,
      title: "Chapitre spécial",
      status: "draft",
      minimumImages: 100,
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
          chapterId: "chapter-special",
          chapterNumber: 5,
          userIntent: "Chapitre long avec contrat images 100.",
        }),
      }),
      ctx,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.productionPlan.minimumImages).toBe(100);
    expect(payload.productionPlan.panelBlueprints.length).toBeGreaterThanOrEqual(100);
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
});
