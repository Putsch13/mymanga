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
});
