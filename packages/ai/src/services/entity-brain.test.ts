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

    it("TODO-27 ne flag PAS un groupe quand le verbe d'avertissement est dans une AUTRE phrase", () => {
      // Lux prévient Tess (phrase 1, contient le verbe). Les marchands
      // travaillent en silence (phrase 2, AUCUN verbe d'avertissement).
      // Avant TODO-27 : marchands flaggés "dialogue requis".
      // Après TODO-27 : marchands gardent leur baseline (pas de "dialogue requis").
      const result = parseIntentEntities(
        "Lux prévient Tess. Les marchands ouvrent leurs étals au lever du jour.",
        ["Lux", "Tess"],
      );
      const merchants = result.find(
        (e) => e.entityKind === "npc_group" && e.name === "Marchand",
      );
      expect(merchants).toBeDefined();
      expect(merchants!.roleHint).not.toContain("dialogue requis");
      // disposable est la baseline pour "marchands" — pas promue à story_locked
      expect(merchants!.recurrencePolicy).not.toBe("story_locked");
    });

    it("TODO-27 flag UN groupe quand le verbe d'avertissement est dans la MÊME phrase", () => {
      // Le verbe "prévient" est dans la même phrase que "pêcheurs" → flag.
      const result = parseIntentEntities(
        "Les pêcheurs préviennent Lux d'un danger imminent.",
        ["Lux"],
      );
      const fishermen = result.find(
        (e) => e.entityKind === "npc_group" && e.name === "Groupe de pêcheurs",
      );
      expect(fishermen).toBeDefined();
      expect(fishermen!.recurrencePolicy).toBe("story_locked");
      expect(fishermen!.roleHint).toContain("dialogue requis");
    });

    it("TODO-27 flag uniquement les groupes pertinents quand plusieurs groupes coexistent", () => {
      // Phrase 1 : "gardes préviennent" → gardes story_locked.
      // Phrase 2 : "marchands fuient" (pas de verbe d'avertissement) → marchands restent disposable.
      const result = parseIntentEntities(
        "Les gardes préviennent les voyageurs. Les marchands fuient la cité.",
        [],
      );
      const guards = result.find(
        (e) => e.entityKind === "npc_group" && e.name === "Garde",
      );
      const merchants = result.find(
        (e) => e.entityKind === "npc_group" && e.name === "Marchand",
      );
      expect(guards?.recurrencePolicy).toBe("story_locked");
      expect(merchants?.recurrencePolicy).not.toBe("story_locked");
    });
  });
});
