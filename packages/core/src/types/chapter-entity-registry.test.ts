import { describe, expect, it } from "vitest";
import {
  chapterEntityRegistrySchema,
  chapterEntityEntrySchema,
  chapterStudioDataSchema,
} from "./chapter-studio";

describe("chapterEntityRegistry", () => {
  it("parse un registry vide correctement", () => {
    const registry = chapterEntityRegistrySchema.parse({});
    expect(registry.namedEntities).toEqual([]);
    expect(registry.temporaryEntities).toEqual([]);
    expect(registry.backgroundExtras).toEqual([]);
    expect(registry.crowdGroups).toEqual([]);
  });

  it("parse une entité nommée avec promotionStatus promoted", () => {
    const entry = chapterEntityEntrySchema.parse({
      name: "Tanaka",
      kind: "named_story_npc",
      introductionReason: "Mentor du héros",
      allowedRecurrence: "recurring",
      promotionStatus: "promoted",
      dramaticFunction: "Guide le héros",
    });

    expect(entry.name).toBe("Tanaka");
    expect(entry.kind).toBe("named_story_npc");
    expect(entry.promotionStatus).toBe("promoted");
    expect(entry.allowedRecurrence).toBe("recurring");
  });

  it("défaut promotionStatus à temporary", () => {
    const entry = chapterEntityEntrySchema.parse({
      name: "Garde",
      kind: "functional_unnamed",
    });

    expect(entry.promotionStatus).toBe("temporary");
    expect(entry.allowedRecurrence).toBe("single_chapter");
  });

  it("parse un registry complet avec toutes les catégories", () => {
    const registry = chapterEntityRegistrySchema.parse({
      namedEntities: [
        { name: "Sensei", kind: "named_story_npc", promotionStatus: "promoted" },
      ],
      temporaryEntities: [
        { name: "Inconnu", kind: "functional_unnamed" },
      ],
      backgroundExtras: [
        { name: "Spectateur", kind: "background_extra" },
      ],
      crowdGroups: [
        { label: "Foule de l'arène", size: "large" },
      ],
    });

    expect(registry.namedEntities).toHaveLength(1);
    expect(registry.temporaryEntities).toHaveLength(1);
    expect(registry.backgroundExtras).toHaveLength(1);
    expect(registry.crowdGroups).toHaveLength(1);
    expect(registry.crowdGroups[0].size).toBe("large");
  });

  it("chapterStudioDataSchema accepte entityRegistry optionnel", () => {
    const data = chapterStudioDataSchema.parse({
      entityRegistry: {
        namedEntities: [
          { name: "Rival", kind: "recurring_supporting", promotionStatus: "pending_review" },
        ],
      },
    });

    expect(data.entityRegistry?.namedEntities[0].name).toBe("Rival");
    expect(data.entityRegistry?.namedEntities[0].promotionStatus).toBe("pending_review");
  });

  it("chapterStudioDataSchema fonctionne sans entityRegistry", () => {
    const data = chapterStudioDataSchema.parse({});
    expect(data.entityRegistry).toBeUndefined();
  });

  it("rejette un kind invalide", () => {
    expect(() => chapterEntityEntrySchema.parse({
      name: "Test",
      kind: "invalid_kind",
    })).toThrow();
  });
});
