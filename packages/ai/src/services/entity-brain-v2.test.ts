import { describe, it, expect, beforeEach } from "vitest";
import { resolveEntity, resolveEntities, clearEntityCache } from "./entity-brain-v2";

describe("entity-brain-v2", () => {
  beforeEach(() => {
    clearEntityCache();
  });
  describe("resolveEntity (heuristic path, no LLM)", () => {
    it("résout dragon depuis le nom", async () => {
      const result = await resolveEntity({
        name: "Le dragon",
        projectId: "test",
      });
      expect(result.entityKind).toBe("monster");
      expect(result.speciesLabel).toBe("dragon");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.source).toBe("ontology");
    });

    it("résout golem depuis le contexte", async () => {
      const result = await resolveEntity({
        name: "Gardien",
        contextText: "Un golem d'obsidienne garde l'entrée",
        projectId: "test",
      });
      expect(result.entityKind).toBe("construct");
      expect(result.speciesLabel).toBe("golem");
    });

    it("résout yokai", async () => {
      const result = await resolveEntity({
        name: "Yōkai",
        projectId: "test",
      });
      expect(result.entityKind).toBe("spirit");
      expect(result.speciesLabel).toBe("yokai");
    });

    it("résout shinigami", async () => {
      const result = await resolveEntity({
        name: "Shinigami",
        projectId: "test",
      });
      expect(result.entityKind).toBe("spirit");
      expect(result.speciesLabel).toBe("shinigami");
    });

    it("résout kaiju", async () => {
      const result = await resolveEntity({
        name: "Le Kaiju",
        projectId: "test",
      });
      expect(result.entityKind).toBe("monster");
      expect(result.speciesLabel).toBe("kaiju");
    });

    it("résout kitsune/renard", async () => {
      const result = await resolveEntity({
        name: "Kitsune",
        projectId: "test",
      });
      expect(result.entityKind).toBe("spirit");
      expect(result.speciesLabel).toBe("kitsune");
    });

    it("résout vampire", async () => {
      const result = await resolveEntity({
        name: "Lord Vampire",
        projectId: "test",
      });
      expect(result.entityKind).toBe("monster");
      expect(result.speciesLabel).toBe("vampire");
    });

    it("Kuro-Hebi résolu par ontologie (hebi = serpent)", async () => {
      const result = await resolveEntity({
        name: "Kuro-Hebi",
        projectId: "test",
      });
      expect(result.entityKind).toBe("animal");
      expect(result.speciesLabel).toBe("serpent");
      expect(result.source).toBe("ontology");
    });

    it("fallback named_npc pour terme totalement inconnu (sans LLM)", async () => {
      const result = await resolveEntity({
        name: "Zylpharion",
        projectId: "test",
      });
      expect(result.entityKind).toBe("named_npc");
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("résout depuis le glossaire projet", async () => {
      const result = await resolveEntity({
        name: "Kuro-Hebi",
        projectId: "test",
        glossary: [
          { term: "Kuro-Hebi", description: "Serpent d'ombre géant", visualCore: "massive shadow serpent, obsidian scales", entityKind: "monster" },
        ],
      });
      expect(result.entityKind).toBe("monster");
      expect(result.source).toBe("glossary");
      expect(result.confidence).toBe(0.95);
      expect(result.canonicalVisualCore).toContain("shadow serpent");
    });
  });

  describe("resolveEntities (batch)", () => {
    it("résout plusieurs entités en parallèle", async () => {
      const results = await resolveEntities(
        ["Dragon", "Golem", "Inconnu"],
        { projectId: "test" },
      );
      expect(results.size).toBe(3);
      expect(results.get("dragon")?.entityKind).toBe("monster");
      expect(results.get("golem")?.entityKind).toBe("construct");
      expect(results.get("inconnu")?.entityKind).toBe("named_npc");
    });
  });
});
