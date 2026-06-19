/**
 * P0.2 — Contrats cast chapitre (studio + launch).
 */
import { describe, expect, it } from "vitest";
import {
  applyHeroInvariant,
  buildChapterCastContract,
  assertValidChapterCastContract,
  validateStudioCastHeroInvariants,
} from "@manga-ai-studio/core";

describe("chapter cast contract (P0.2 contracts)", () => {
  it("applyHeroInvariant + buildChapterCastContract produisent un contrat valide", () => {
    const sel = applyHeroInvariant(
      {
        heroCharacterId: "hero-1",
        activeCharacterIds: ["side-1"],
        coreCastCharacterIds: [],
        lockedCharacterIds: [],
      },
      "hero-1",
    );
    const contract = buildChapterCastContract({
      chapterId: "ch-1",
      heroCharacterId: "hero-1",
      characters: [
        { id: "hero-1", name: "Ken", roleType: "Héros" },
        { id: "side-1", name: "Maya", roleType: "support" },
      ],
      activeCharacterIds: sel.activeCharacterIds as string[],
    });
    expect(() => assertValidChapterCastContract(contract)).not.toThrow();
  });

  it("validateStudioCastHeroInvariants détecte un héros absent du core cast", () => {
    const r = validateStudioCastHeroInvariants({
      heroCharacterId: "h1",
      activeCharacterIds: ["h1"],
      coreCastCharacterIds: [],
      lockedCharacterIds: ["h1"],
    });
    expect(r.ok).toBe(false);
  });
});
