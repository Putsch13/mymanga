import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  character: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  stylePack: { findMany: vi.fn() },
}));

vi.mock("@manga-ai-studio/db", () => ({ prisma: prismaMock }));

import { loadChapterVisualMemory } from "./load-chapter-visual-memory";

beforeEach(() => {
  prismaMock.character.findMany.mockReset();
  prismaMock.location.findMany.mockReset();
  prismaMock.stylePack.findMany.mockReset();
});

describe("loadChapterVisualMemory", () => {
  it("hydrate les entrées character à partir des visualRefs Prisma", async () => {
    prismaMock.character.findMany.mockResolvedValue([
      {
        id: "hero-1",
        name: "Hero",
        roleType: "main",
        outfitDefault: null,
        visualRefs: [
          { id: "r1", imageUrl: "https://face.png", isPrimary: false, metadata: { slotType: "closeup" } },
          { id: "r2", imageUrl: "https://body.png", isPrimary: true, metadata: {} },
        ],
      },
    ]);
    prismaMock.location.findMany.mockResolvedValue([]);
    prismaMock.stylePack.findMany.mockResolvedValue([]);

    const res = await loadChapterVisualMemory({
      chapterId: "ch-1",
      projectId: "proj-1",
      mainCharacterIds: ["hero-1"],
    });

    expect(res.stats.charactersLoaded).toBe(1);
    expect(res.stats.charactersMissingFaceRef).toBe(0);
    const entry = res.memory.characters.get("hero-1");
    expect(entry?.role).toBe("hero");
    expect(entry?.faceRefUrl).toBe("https://face.png");
    expect(entry?.silhouetteRefUrl).toBe("https://body.png");
  });

  it("log un warning quand un hero n'a pas de face ref", async () => {
    prismaMock.character.findMany.mockResolvedValue([
      {
        id: "hero-1",
        name: "Hero",
        roleType: "main",
        outfitDefault: null,
        visualRefs: [],
      },
    ]);
    prismaMock.location.findMany.mockResolvedValue([]);
    prismaMock.stylePack.findMany.mockResolvedValue([]);

    const res = await loadChapterVisualMemory({
      chapterId: "ch-1",
      projectId: "proj-1",
      mainCharacterIds: ["hero-1"],
    });

    expect(res.stats.charactersMissingFaceRef).toBe(1);
    expect(res.warnings[0]).toMatch(/missing_face_ref/);
  });

  it("hydrate les environments depuis Location.canonImageUrl", async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.location.findMany.mockResolvedValue([
      { id: "loc-1", name: "Rooftop", canonImageUrl: "https://loc.png" },
      { id: "loc-2", name: "Empty", canonImageUrl: null },
    ]);
    prismaMock.stylePack.findMany.mockResolvedValue([]);

    const res = await loadChapterVisualMemory({
      chapterId: "ch-1",
      projectId: "proj-1",
      mainCharacterIds: [],
    });

    expect(res.stats.environmentsLoaded).toBe(1);
    expect(res.memory.environments.get("loc-1")?.refUrl).toBe("https://loc.png");
    expect(res.memory.environments.has("loc-2")).toBe(false);
  });

  it("hydrate une style ref si le stylePack en fournit une", async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.location.findMany.mockResolvedValue([]);
    prismaMock.stylePack.findMany.mockResolvedValue([
      { id: "sp-1", styleRefImageUrl: "https://style.png" },
    ]);

    const res = await loadChapterVisualMemory({
      chapterId: "ch-1",
      projectId: "proj-1",
      mainCharacterIds: [],
    });
    expect(res.stats.styleRefsLoaded).toBe(1);
    expect(res.memory.styleRefs[0]?.refUrl).toBe("https://style.png");
  });
});
