import { describe, expect, it } from "vitest";
import { resolveCharacterRefsToIds } from "./resolve-character-refs";

describe("resolveCharacterRefsToIds", () => {
  const catalog = [
    { id: "char-marius", name: "Marius", displayName: null, roleType: "hero" },
    { id: "char-maya", name: null, displayName: "Maya", roleType: "supporting" },
  ];

  it("résout par id exact", () => {
    const r = resolveCharacterRefsToIds(["char-marius"], catalog);
    expect(r.ids).toEqual(["char-marius"]);
    expect(r.unresolved).toEqual([]);
  });

  it("résout par nom insensible à la casse", () => {
    const r = resolveCharacterRefsToIds(["marius", "MAYA"], catalog);
    expect(r.ids.sort()).toEqual(["char-marius", "char-maya"].sort());
    expect(r.unresolved).toEqual([]);
  });

  it("ne fabrique pas d’id et liste les refs non résolues", () => {
    const r = resolveCharacterRefsToIds(["Inconnu", "marius"], catalog);
    expect(r.ids).toEqual(["char-marius"]);
    expect(r.unresolved).toEqual(["Inconnu"]);
  });

  it("dédoublonne ids et unresolved", () => {
    const r = resolveCharacterRefsToIds(["Marius", "marius", "Inconnu", "Inconnu"], catalog);
    expect(r.ids).toEqual(["char-marius"]);
    expect(r.unresolved).toEqual(["Inconnu"]);
  });

  describe("résolution NPC groups (collectifs FR)", () => {
    const npcGroups = [
      { id: "npc-pecheurs", label: "Pêcheurs" },
      { id: "npc-gardes-port", label: "Gardes du port" },
      { id: "npc-villageois", label: "Villageois" },
    ];

    it("résout 'Groupe de pêcheurs' → npc-pecheurs (strip préfixe + accents)", () => {
      const r = resolveCharacterRefsToIds(["Groupe de pêcheurs"], catalog, npcGroups);
      expect(r.ids).toEqual([]);
      expect(r.unresolved).toEqual([]);
      expect(r.npcGroupIds).toEqual(["npc-pecheurs"]);
    });

    it("résout 'Les gardes du port' → npc-gardes-port", () => {
      const r = resolveCharacterRefsToIds(["Les gardes du port"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-gardes-port"]);
      expect(r.unresolved).toEqual([]);
    });

    it("résout 'Bande de pêcheurs' → npc-pecheurs", () => {
      const r = resolveCharacterRefsToIds(["Bande de pêcheurs"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-pecheurs"]);
    });

    it("résout 'Foule de villageois' → npc-villageois", () => {
      const r = resolveCharacterRefsToIds(["Foule de villageois"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-villageois"]);
    });

    it("résout 'pêcheurs' (sans préfixe, casse différente) → npc-pecheurs", () => {
      const r = resolveCharacterRefsToIds(["pêcheurs"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-pecheurs"]);
    });

    it("résout par sous-chaîne : ref 'pêcheurs du village' inclut groupe 'pêcheurs'", () => {
      const r = resolveCharacterRefsToIds(["pêcheurs du village"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-pecheurs"]);
    });

    it("priorise un personnage du catalogue avant un NPC group homonyme", () => {
      const r = resolveCharacterRefsToIds(
        ["Marius"],
        catalog,
        [{ id: "npc-marius-fans", label: "Marius" }],
      );
      expect(r.ids).toEqual(["char-marius"]);
      expect(r.npcGroupIds).toEqual([]);
    });

    it("ne résout pas un libellé totalement différent", () => {
      const r = resolveCharacterRefsToIds(["Aliens du futur"], catalog, npcGroups);
      expect(r.unresolved).toEqual(["Aliens du futur"]);
      expect(r.npcGroupIds).toEqual([]);
    });

    it("résout un id npc group exact", () => {
      const r = resolveCharacterRefsToIds(["npc-pecheurs"], catalog, npcGroups);
      expect(r.npcGroupIds).toEqual(["npc-pecheurs"]);
      expect(r.unresolved).toEqual([]);
    });
  });
});
