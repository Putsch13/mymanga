import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  chapter: { findFirst: vi.fn() },
};

const getAppUserMock = vi.fn();
const getOwnedProjectMock = vi.fn();
const buildProjectContextMock = vi.fn();
const runChapterAutofillMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@/lib/ownership", () => ({
  getOwnedProject: getOwnedProjectMock,
}));

vi.mock("@manga-ai-studio/memory", () => ({
  buildProjectContext: buildProjectContextMock,
}));

vi.mock("@manga-ai-studio/ai", () => ({
  runChapterAutofill: runChapterAutofillMock,
}));

vi.mock("@manga-ai-studio/core", () => ({
  chapterStudioDataSchema: {
    parse: (v: unknown) => {
      const rec = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { intent: rec.intent ?? null, ...rec };
    },
    safeParse: (v: unknown) => {
      const rec = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return { success: true, data: { intent: rec.intent ?? null, ...rec } };
    },
  },
  chapterStudioSnapshotSchema: {
    parse: (v: unknown) => v,
  },
}));

async function callAutofill(body: Record<string, unknown>, chapterId = "ch1", projectId = "proj1") {
  const { POST } = await import(
    "../app/api/projects/[id]/chapters/[chapterId]/autofill/route"
  );
  const req = new Request("http://localhost/api/projects/proj1/chapters/ch1/autofill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id: projectId, chapterId }) };
  return POST(req, ctx);
}

describe("autofill/route — feedback clair", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAppUserMock.mockResolvedValue({ id: "user1" });
    getOwnedProjectMock.mockResolvedValue({ id: "proj1" });
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: {},
    });
    buildProjectContextMock.mockResolvedValue({
      project: { id: "proj1", title: "Mon Manga" },
      characters: [{ id: "c1", name: "Ryuu", roleType: "MAIN_CHARACTER" }],
      recentChapters: [],
    });
  });

  it("bloque l'autofill all_missing si le pitch est vide", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: { studio: { data: { intent: { shortPitch: "" } } } },
    });

    const res = await callAutofill({ mode: "all_missing", force: false });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.blocked).toBe(true);
    expect(json.blockedReason).toBe("pitch_too_short");
    expect(json.blockedMessage).toContain("pitch");
  });

  it("bloque l'autofill all_missing si le pitch est trop court (< 5 chars)", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: { studio: { data: { intent: { shortPitch: "abc" } } } },
    });

    const res = await callAutofill({ mode: "all_missing", force: false });
    const json = await res.json();

    expect(json.blocked).toBe(true);
  });

  it("retourne emptyPatch=true avec raison si appliedFields est vide", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: {
        studio: {
          data: {
            intent: { shortPitch: "Ryuu affronte son ennemi dans le donjon" },
          },
        },
      },
    });
    runChapterAutofillMock.mockResolvedValue({
      suggestedPatch: {},
      appliedFields: [],
      assumptions: [],
      confidence: 0,
      unresolvedQuestions: [],
      provenance: null,
      meta: null,
    });

    const res = await callAutofill({ mode: "all_missing", force: false });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.emptyPatch).toBe(true);
    expect(typeof json.emptyPatchReason).toBe("string");
    expect(json.emptyPatchReason.length).toBeGreaterThan(0);
  });

  it("retourne debug.hadSnapshot et debug.contextCharacters", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: {
        studio: {
          data: {
            intent: { shortPitch: "Ryuu affronte son ennemi dans le donjon mystérieux" },
          },
        },
      },
    });
    runChapterAutofillMock.mockResolvedValue({
      suggestedPatch: { intent: { shortPitch: "Ryuu affronte son ennemi" } },
      appliedFields: ["intent.shortPitch"],
      assumptions: [],
      confidence: 0.8,
      unresolvedQuestions: [],
      provenance: null,
      meta: { confidence: 0.8 },
    });

    const res = await callAutofill({ mode: "all_missing", force: false });
    const json = await res.json();

    expect(json.debug).toBeDefined();
    expect(typeof json.debug.hadSnapshot).toBe("boolean");
    expect(typeof json.debug.contextCharacters).toBe("number");
    expect(json.debug.contextCharacters).toBe(1);
  });

  it("ne bloque pas repair_readiness même si le pitch est court", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({
      id: "ch1",
      chapterNumber: 1,
      title: "Chapitre 1",
      outline: { studio: { data: { intent: { shortPitch: "" } } } },
    });
    runChapterAutofillMock.mockResolvedValue({
      suggestedPatch: {},
      appliedFields: [],
      assumptions: [],
      confidence: 0,
      unresolvedQuestions: [],
      provenance: null,
      meta: null,
    });

    const res = await callAutofill({ mode: "repair_readiness", force: false });
    const json = await res.json();

    // repair_readiness ne doit pas être bloqué par le pitch
    expect(json.blocked).toBeUndefined();
    expect(json.ok).toBe(true);
  });
});
