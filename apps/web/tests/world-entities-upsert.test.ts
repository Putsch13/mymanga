import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Prisma BEFORE importing the SUT.
vi.mock("@manga-ai-studio/db", () => {
  const npcGroupTable = new Map<string, Record<string, unknown>>();
  const worldPropTable = new Map<string, Record<string, unknown>>();

  function key(projectId: string, slug: string) {
    return `${projectId}:${slug}`;
  }

  const prisma = {
    npcGroup: {
      findUnique: vi.fn(async ({ where }: { where: { projectId_slug: { projectId: string; slug: string } } }) => {
        const k = key(where.projectId_slug.projectId, where.projectId_slug.slug);
        return npcGroupTable.get(k) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const k = key(data.projectId as string, data.slug as string);
        const row = { id: `npc_${npcGroupTable.size + 1}`, ...data, userEdited: false };
        npcGroupTable.set(k, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        for (const [k, row] of npcGroupTable.entries()) {
          if (row.id === where.id) {
            const next = { ...row };
            for (const [field, value] of Object.entries(data)) {
              if (value && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
                next[field] = (next[field] as number ?? 0) + ((value as { increment: number }).increment);
              } else {
                next[field] = value;
              }
            }
            npcGroupTable.set(k, next);
            return next;
          }
        }
        throw new Error("not_found");
      }),
    },
    worldProp: {
      findUnique: vi.fn(async ({ where }: { where: { projectId_slug: { projectId: string; slug: string } } }) => {
        const k = key(where.projectId_slug.projectId, where.projectId_slug.slug);
        return worldPropTable.get(k) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const k = key(data.projectId as string, data.slug as string);
        const row = { id: `prop_${worldPropTable.size + 1}`, ...data, userEdited: false };
        worldPropTable.set(k, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        for (const [k, row] of worldPropTable.entries()) {
          if (row.id === where.id) {
            const next = { ...row };
            for (const [field, value] of Object.entries(data)) {
              if (value && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
                next[field] = (next[field] as number ?? 0) + ((value as { increment: number }).increment);
              } else {
                next[field] = value;
              }
            }
            worldPropTable.set(k, next);
            return next;
          }
        }
        throw new Error("not_found");
      }),
    },
    __reset: () => {
      npcGroupTable.clear();
      worldPropTable.clear();
    },
    __setUserEdited: (entity: "npc" | "prop", id: string, val: boolean) => {
      const table = entity === "npc" ? npcGroupTable : worldPropTable;
      for (const [k, row] of table.entries()) {
        if (row.id === id) {
          table.set(k, { ...row, userEdited: val });
          return;
        }
      }
    },
    __snapshot: () => ({
      npcGroups: Array.from(npcGroupTable.values()),
      worldProps: Array.from(worldPropTable.values()),
    }),
  };
  return { prisma };
});

vi.mock("@manga-ai-studio/ai", () => ({
  slugifyLabel: (label: string) =>
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80),
}));

import { upsertWorldEntities } from "@/lib/world-entities/upsert-world-entities";
import { prisma } from "@manga-ai-studio/db";

describe("upsertWorldEntities (USER-WINS persistence)", () => {
  beforeEach(() => {
    (prisma as unknown as { __reset: () => void }).__reset();
  });

  it("creates new NpcGroups and WorldProps with the AI label as initial value", async () => {
    const result = await upsertWorldEntities({
      projectId: "p1",
      chapterId: "c1",
      npcGroups: [
        { label: "Clan des Profondeurs", description: "Guerriers marins", visualProfile: null, outfit: null, silhouette: null },
      ],
      worldProps: [
        { label: "Talisman pourpre", description: "Artefact ancien", visualDescription: null, kind: "artefact", narrativeWeight: "key" },
      ],
    });

    expect(result.npcGroupsCreated).toBe(1);
    expect(result.worldPropsCreated).toBe(1);
    const snap = (prisma as unknown as { __snapshot: () => { npcGroups: Array<{ label: string }>; worldProps: Array<{ label: string }> } }).__snapshot();
    expect(snap.npcGroups[0].label).toBe("Clan des Profondeurs");
    expect(snap.worldProps[0].label).toBe("Talisman pourpre");
  });

  it("USER-WINS: never overwrites a userEdited NpcGroup label/description", async () => {
    await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [{ label: "Pêcheurs", description: "Travailleurs du port", visualProfile: null, outfit: null, silhouette: null }],
      worldProps: [],
    });

    // Simulate user editing
    const snap1 = (prisma as unknown as { __snapshot: () => { npcGroups: Array<{ id: string; label: string }> } }).__snapshot();
    (prisma as unknown as { __setUserEdited: (e: "npc", id: string, v: boolean) => void }).__setUserEdited("npc", snap1.npcGroups[0].id, true);
    // User also renamed in DB:
    (prisma as unknown as {
      npcGroup: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
      };
    }).npcGroup.update({
      where: { id: snap1.npcGroups[0].id },
      data: { label: "Pêcheurs du port d'Aralth", description: "Mon texte custom" },
    });

    // Re-run AI extraction with same slug but different label/description
    const result = await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [{ label: "Pêcheurs", description: "Description IA générique", visualProfile: "Tenue bleue", outfit: null, silhouette: null }],
      worldProps: [],
    });

    expect(result.npcGroupsSkippedUserEdited).toBe(1);
    expect(result.npcGroupsUpdated).toBe(0);
    const snap2 = (prisma as unknown as { __snapshot: () => { npcGroups: Array<{ label: string; description: string; visualProfile: string | null; appearanceCount: number }> } }).__snapshot();
    expect(snap2.npcGroups[0].label).toBe("Pêcheurs du port d'Aralth");
    expect(snap2.npcGroups[0].description).toBe("Mon texte custom");
    expect(snap2.npcGroups[0].visualProfile).toBeNull();
    expect(snap2.npcGroups[0].appearanceCount).toBe(2);
  });

  it("when not userEdited, enriches empty fields without overwriting existing differences", async () => {
    await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [{ label: "Gardes", description: "Surveillent les portes", visualProfile: null, outfit: null, silhouette: null }],
      worldProps: [],
    });

    const result = await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [
        {
          label: "Gardes",
          description: "Surveillent les portes",
          visualProfile: "Armure noire",
          outfit: "Cuir rivetée",
          silhouette: "Massive",
        },
      ],
      worldProps: [],
    });

    expect(result.npcGroupsUpdated).toBe(1);
    const snap = (prisma as unknown as { __snapshot: () => { npcGroups: Array<{ visualProfile: string | null; outfit: string | null }> } }).__snapshot();
    expect(snap.npcGroups[0].visualProfile).toBe("Armure noire");
    expect(snap.npcGroups[0].outfit).toBe("Cuir rivetée");
  });

  it("slugifies labels with French accents to match across runs", async () => {
    await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [{ label: "Pêcheurs du port", description: null, visualProfile: null, outfit: null, silhouette: null }],
      worldProps: [],
    });

    // Same slug should hit existing row
    const result = await upsertWorldEntities({
      projectId: "p1",
      npcGroups: [{ label: "Pêcheurs du port", description: "Bis", visualProfile: null, outfit: null, silhouette: null }],
      worldProps: [],
    });

    expect(result.npcGroupsCreated).toBe(0);
    expect(result.npcGroupsUpdated).toBe(1);
  });
});
