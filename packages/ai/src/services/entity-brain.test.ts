import { describe, it, expect } from "vitest";
import { parseIntentEntities } from "./entity-brain";

describe("parseIntentEntities", () => {
  it("detects a named NPC from a meeting verb", () => {
    const result = parseIntentEntities("Le héros rencontre Suko dans la forêt", ["Akira"]);
    expect(result.some((e) => e.name === "Suko" && e.entityKind === "named_npc")).toBe(true);
  });

  it("ignores known character names", () => {
    const result = parseIntentEntities("Le héros rencontre Akira", ["Akira"]);
    expect(result.some((e) => e.name === "Akira")).toBe(false);
  });

  it("detects a dragon as a monster", () => {
    const result = parseIntentEntities("Un dragon attaque le village", []);
    expect(result.some((e) => e.entityKind === "monster" && e.speciesLabel === "dragon")).toBe(true);
  });

  describe("T4 — Group NPC detection", () => {
    it("detects 'gardes' as an npc_group", () => {
      const result = parseIntentEntities("Les gardes patrouillent dans la cité", []);
      const group = result.find((e) => e.entityKind === "npc_group");
      expect(group).toBeDefined();
      expect(group!.name).toBe("Garde");
    });

    it("detects 'pêcheurs' as an npc_group with maritime domain", () => {
      const result = parseIntentEntities("Les pêcheurs rentrent au port", []);
      const group = result.find((e) => e.entityKind === "npc_group");
      expect(group).toBeDefined();
      expect(group!.roleHint).toContain("maritime");
    });

    it("promotes recurrencePolicy to story_locked when warning verb is present", () => {
      const result = parseIntentEntities("Les gardes préviennent le héros d'un danger", []);
      const group = result.find((e) => e.entityKind === "npc_group");
      expect(group).toBeDefined();
      expect(group!.recurrencePolicy).toBe("story_locked");
      expect(group!.roleHint).toContain("dialogue requis");
    });

    it("detects multiple groups in one intent", () => {
      const result = parseIntentEntities(
        "Les marchands fuient tandis que les bandits pillent le village",
        [],
      );
      const groups = result.filter((e) => e.entityKind === "npc_group");
      expect(groups.length).toBe(2);
      const labels = groups.map((g) => g.name);
      expect(labels).toContain("Marchand");
      expect(labels).toContain("Bandit");
    });

    it("does not create duplicate groups", () => {
      const result = parseIntentEntities(
        "Les gardes bloquent l'entrée. Les gardes interrogent les passants.",
        [],
      );
      const groups = result.filter((e) => e.entityKind === "npc_group" && e.name === "Garde");
      expect(groups.length).toBe(1);
    });
  });
});
