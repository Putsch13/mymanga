import { describe, expect, it } from "vitest";
import { createProjectCharacterResolver, normalizeCharName } from "@/lib/retry/resolve-project-characters";

describe("normalizeCharName", () => {
  it("lowercase + trim", () => {
    expect(normalizeCharName("  Kaori  ")).toBe("kaori");
    expect(normalizeCharName("KAORI")).toBe("kaori");
  });
});

describe("createProjectCharacterResolver (P0.5 + P5.1)", () => {
  const chars = [
    { id: "c-hero", name: "Kaori" },
    { id: "c-twin-a", name: "Ren" },
    { id: "c-twin-b", name: "Ren" },
    { id: "c-villain", name: "Asuka" },
  ];

  it("résout par focus_id en priorité, même sur duplicate names", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: {
        focus: { characterId: "c-twin-b", name: "Ren" },
        supporting: [],
      },
      metadataCharacterIds: [],
    });
    const res = resolveCharacterFromName("Ren");
    expect(res?.resolvedBy).toBe("focus_id");
    expect(res?.character.id).toBe("c-twin-b");
  });

  it("résout par supporting_id pour un nom supporting", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: {
        focus: { characterId: "c-hero", name: "Kaori" },
        supporting: [{ characterId: "c-twin-a", name: "Ren" }],
      },
      metadataCharacterIds: [],
    });
    const res = resolveCharacterFromName("Ren");
    expect(res?.resolvedBy).toBe("supporting_id");
    expect(res?.character.id).toBe("c-twin-a");
  });

  it("résout par metadata_id quand panelCast ne le couvre pas", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: null,
      metadataCharacterIds: ["c-twin-a"],
    });
    const res = resolveCharacterFromName("Ren");
    expect(res?.resolvedBy).toBe("metadata_id");
    expect(res?.character.id).toBe("c-twin-a");
  });

  it("fallback name_fallback uniquement en dernier recours", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: null,
      metadataCharacterIds: [],
    });
    const res = resolveCharacterFromName("Asuka");
    expect(res?.resolvedBy).toBe("name_fallback");
    expect(res?.character.id).toBe("c-villain");
  });

  it("retourne null si nom totalement inconnu", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: null,
      metadataCharacterIds: [],
    });
    expect(resolveCharacterFromName("GhostCharacter")).toBeNull();
  });

  it("normalise casse/espaces sur le nom recherché", () => {
    const { resolveCharacterFromName } = createProjectCharacterResolver({
      projectChars: chars,
      panelCastData: null,
      metadataCharacterIds: [],
    });
    expect(resolveCharacterFromName("  KAORI  ")?.character.id).toBe("c-hero");
  });
});
