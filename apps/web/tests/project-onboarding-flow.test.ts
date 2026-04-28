import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
  character: { findMany: vi.fn() },
  chapter: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

const getAppUserMock = vi.fn();
const trackServerEventMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@/lib/analytics", () => ({
  trackServerEvent: trackServerEventMock,
}));

vi.mock("@/lib/api-response", () => ({
  notFound: () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
}));

vi.mock("@/lib/chapter-studio", () => ({
  buildChapterStudioListItem: (c: Record<string, unknown>) => c,
  buildChapterStructuredRuntimeCreateFields: () => ({}),
  patchChapterStudioSnapshot: (_existing: unknown, patch: unknown) => ({
    currentStep: "intent",
    status: "DRAFT",
    data: patch,
    version: 1,
    autosaveVersion: 1,
  }),
}));

vi.mock("@manga-ai-studio/core", async () => {
  const z = await import("zod");
  return {
    approvedOutlineSchema: z.z.object({}).passthrough(),
    chapterStudioDataSchema: z.z.object({}).passthrough(),
    buildApprovedOutlineFromProductionOutline: () => null,
    PREMIUM_PANEL_RANGE: { min: 70, target: 72, max: 75 },
  };
});

describe("POST /api/projects/[id]/chapters — parcours onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppUserMock.mockResolvedValue({ id: "user-1" });
    prismaMock.project.findFirst.mockResolvedValue({ id: "proj-1", userId: "user-1" });
    prismaMock.chapter.findFirst.mockResolvedValue(null);
    prismaMock.chapter.findMany.mockResolvedValue([]);
    prismaMock.chapter.create.mockResolvedValue({
      id: "chap-1",
      chapterNumber: 1,
      title: "Chapitre 1",
      projectId: "proj-1",
      status: "draft",
      outline: {},
    });
    prismaMock.chapter.update.mockResolvedValue({});
    prismaMock.character.findMany.mockResolvedValue([]);
    trackServerEventMock.mockResolvedValue(undefined);
  });

  it("crée un chapitre 1 avec le body minimal d'onboarding", async () => {
    const { POST } = await import("../app/api/projects/[id]/chapters/route");
    const req = new Request("http://localhost/api/projects/proj-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Chapitre 1",
        userIntent: "Un héros découvre ses pouvoirs.",
        studioDraft: {
          intent: {
            chapterNumber: 1,
            workingTitle: "Chapitre 1",
            shortPitch: "Un héros découvre ses pouvoirs.",
            arcPosition: "",
            emotionalGoal: "",
            mainConflict: "",
            endingMode: null,
            arcImportance: null,
          },
        },
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "proj-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chapter).toBeDefined();
    expect(json.chapter.id).toBe("chap-1");
  });

  it("retourne 401 si non authentifié", async () => {
    getAppUserMock.mockResolvedValue(null);
    const { POST } = await import("../app/api/projects/[id]/chapters/route");
    const req = new Request("http://localhost/api/projects/proj-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chapitre 1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "proj-1" }) });
    expect(res.status).toBe(401);
  });

  it("retourne 404 si le projet n'appartient pas à l'utilisateur", async () => {
    prismaMock.project.findFirst.mockResolvedValue(null);
    const { POST } = await import("../app/api/projects/[id]/chapters/route");
    const req = new Request("http://localhost/api/projects/proj-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chapitre 1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "proj-1" }) });
    expect(res.status).toBe(404);
  });

  it("numérote automatiquement le chapitre en fonction des chapitres existants", async () => {
    prismaMock.chapter.findFirst.mockResolvedValue({ chapterNumber: 3 });
    const { POST } = await import("../app/api/projects/[id]/chapters/route");
    const req = new Request("http://localhost/api/projects/proj-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chapitre 4" }),
    });
    await POST(req, { params: Promise.resolve({ id: "proj-1" }) });
    const createCall = prismaMock.chapter.create.mock.calls[0]?.[0];
    expect(createCall?.data?.chapterNumber).toBe(4);
  });
});
