/**
 * P4.2 — Tests non-régression pour les schémas Zod de frontière.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseEntityRegistry,
  parseObjectStateTimeline,
  parseCharacterFingerprint,
} from "../src/schemas/pipeline-contracts";

describe("parseEntityRegistry", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("accepte un registry valide avec tous les champs", () => {
    const r = parseEntityRegistry({
      namedEntities: [{ name: "Alice", promotionStatus: "promoted" }],
      temporaryEntities: [{ name: "Passant" }],
      backgroundExtras: [{ name: "Foule" }],
    });
    expect(r?.namedEntities?.[0].name).toBe("Alice");
    expect(r?.temporaryEntities?.[0].name).toBe("Passant");
  });

  it("accepte un registry avec clés inconnues (passthrough forward-compat)", () => {
    const r = parseEntityRegistry({
      namedEntities: [{ name: "Alice", extraField: "ignored-but-kept" }],
      futureFeature: { lorem: "ipsum" },
    });
    expect(r).not.toBeNull();
    expect(r?.namedEntities?.[0].name).toBe("Alice");
  });

  it("retourne null pour un registry invalide (pas de throw)", () => {
    const r = parseEntityRegistry({ namedEntities: "not-an-array" });
    expect(r).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("retourne null pour un input null/undefined", () => {
    expect(parseEntityRegistry(null)).toBeNull();
    expect(parseEntityRegistry(undefined)).toBeNull();
  });
});

describe("parseObjectStateTimeline", () => {
  it("accepte un tableau vide", () => {
    expect(parseObjectStateTimeline([])).toEqual([]);
  });

  it("accepte une timeline avec champs partiels (tous optionnels)", () => {
    const r = parseObjectStateTimeline([
      { objectName: "sabre", state: "sheathed", panelNumber: 1 },
      { objectId: "obj_42", state: "drawn" },
    ]);
    expect(r).toHaveLength(2);
  });

  it("retourne [] quand ce n'est pas un tableau", () => {
    expect(parseObjectStateTimeline("not-array")).toEqual([]);
    expect(parseObjectStateTimeline(null)).toEqual([]);
    expect(parseObjectStateTimeline({})).toEqual([]);
  });
});

describe("parseCharacterFingerprint", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("accepte un fingerprint valide", () => {
    const r = parseCharacterFingerprint({
      characterId: "char_1",
      hardTraits: ["red left eye"],
      softTraits: ["scar cheek"],
    });
    expect(r?.hardTraits).toEqual(["red left eye"]);
  });

  it("retourne null pour un objet vide", () => {
    expect(parseCharacterFingerprint({})).toBeNull();
  });

  it("retourne null pour input non-objet", () => {
    expect(parseCharacterFingerprint(null)).toBeNull();
    expect(parseCharacterFingerprint([])).toBeNull();
    expect(parseCharacterFingerprint("string")).toBeNull();
  });

  it("retourne null si hardTraits n'est pas un array (malformed)", () => {
    const r = parseCharacterFingerprint({
      hardTraits: "not-an-array",
    });
    expect(r).toBeNull();
  });
});
