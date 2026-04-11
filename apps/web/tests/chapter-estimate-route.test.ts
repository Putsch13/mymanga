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

vi.mock("@manga-ai-studio/ai", () => ({
  generateChapterBundle: generateChapterBundleMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  getAppUserMock.mockResolvedValue({ id: "user-1" });
  getOwnedProjectMock.mockResolvedValue({ id: "project-1", userId: "user-1" });
  estimateChapterTextTokensFromRulesMock.mockResolvedValue(321);
  buildProjectContextMock.mockResolvedValue(makeContext());
  generateChapterBundleMock.mockResolvedValue(makeBundle());
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
});
