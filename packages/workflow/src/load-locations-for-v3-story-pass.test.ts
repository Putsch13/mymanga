import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  location: { findMany: vi.fn() },
}));

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

import { loadLocationsForV3StoryPass } from "./load-locations-for-v3-story-pass";

describe("loadLocationsForV3StoryPass", () => {
  beforeEach(() => {
    prismaMock.location.findMany.mockReset();
  });

  it("retourne [] si aucun id", async () => {
    await expect(loadLocationsForV3StoryPass({ projectId: "p1", locationIds: [] })).resolves.toEqual([]);
    expect(prismaMock.location.findMany).not.toHaveBeenCalled();
  });

  it("préserve l’ordre des ids et mappe les lignes Prisma", async () => {
    prismaMock.location.findMany.mockResolvedValue([
      {
        id: "loc-b",
        name: "Dojo",
        metadata: { tone: "calme" },
        visualBrief: "Tatamis",
        establishedVisualBrief: null,
        description: "Intérieur",
      },
      {
        id: "loc-a",
        name: "Rue",
        metadata: {},
        visualBrief: null,
        establishedVisualBrief: "Pluie",
        description: null,
      },
    ]);
    const out = await loadLocationsForV3StoryPass({
      projectId: "proj-1",
      locationIds: ["loc-a", "loc-b"],
    });
    expect(prismaMock.location.findMany).toHaveBeenCalledWith({
      where: { projectId: "proj-1", id: { in: ["loc-a", "loc-b"] } },
      select: expect.any(Object),
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "loc-a", name: "Rue" });
    expect(out[1]).toMatchObject({ id: "loc-b", name: "Dojo" });
    expect(out[0]!.visualDNA).toMatchObject({
      visualBrief: null,
      establishedVisualBrief: "Pluie",
    });
  });

  it("dédoublonne les ids passés au findMany", async () => {
    prismaMock.location.findMany.mockResolvedValue([
      { id: "x", name: "Lieu X", metadata: null, visualBrief: null, establishedVisualBrief: null, description: null },
    ]);
    await loadLocationsForV3StoryPass({ projectId: "p1", locationIds: ["x", "x"] });
    expect(prismaMock.location.findMany.mock.calls[0]![0].where.id.in).toEqual(["x"]);
  });
});
