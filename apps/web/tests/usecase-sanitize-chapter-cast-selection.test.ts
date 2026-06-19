import { describe, expect, it } from "vitest";
import type { ChapterCharacterSelection } from "@manga-ai-studio/core";
import { sanitizeChapterCastSelectionUsecase } from "@/server/usecases";

const projectCharacters = [
  { id: "char_hero", name: "Akira", displayName: "Akira" },
  { id: "char_mentor", name: "Sensei Tetsuo", displayName: "Tetsuo" },
  { id: "char_rival", name: "Hideo", displayName: "Le Rival" },
];

function emptySelection(overrides: Partial<ChapterCharacterSelection> = {}): ChapterCharacterSelection {
  return {
    heroCharacterId: null,
    secondaryHeroCharacterId: null,
    deuteragonistCharacterId: null,
    coreCastCharacterIds: [],
    activeCharacterIds: [],
    lockedCharacterIds: [],
    speakingCharacterIds: [],
    evolvingCharacterIds: [],
    antagonistCharacterIds: [],
    recurringNpcIds: [],
    ...overrides,
  };
}

describe("sanitizeChapterCastSelectionUsecase", () => {
  it("résout les noms vers les IDs catalogue", async () => {
    const out = await sanitizeChapterCastSelectionUsecase.execute({
      selection: emptySelection({
        heroCharacterId: "Akira",
        activeCharacterIds: ["Tetsuo", "Le Rival"],
      }),
      projectCharacters,
    });

    expect(out.selection.heroCharacterId).toBe("char_hero");
    expect(out.selection.activeCharacterIds).toEqual(["char_mentor", "char_rival"]);
    expect(out.fullyResolved).toBe(true);
    expect(out.unresolvedLabels).toHaveLength(0);
  });

  it("retire les noms inconnus et expose des suggestions", async () => {
    const out = await sanitizeChapterCastSelectionUsecase.execute({
      selection: emptySelection({
        heroCharacterId: "Akira",
        activeCharacterIds: ["Akira", "Personnage Inconnu"],
      }),
      projectCharacters,
    });

    expect(out.selection.activeCharacterIds).toContain("char_hero");
    expect(out.strippedLabels).toContain("Personnage Inconnu");
    expect(out.fullyResolved).toBe(false);
    const inconnu = out.suggestions.find((s) => s.label === "Personnage Inconnu");
    expect(inconnu).toBeTruthy();
  });

  it("conserve les IDs catalogue déjà valides sans casser", async () => {
    const out = await sanitizeChapterCastSelectionUsecase.execute({
      selection: emptySelection({
        heroCharacterId: "char_hero",
        activeCharacterIds: ["char_mentor", "char_rival"],
      }),
      projectCharacters,
    });

    expect(out.selection.heroCharacterId).toBe("char_hero");
    expect(out.selection.activeCharacterIds).toEqual(["char_mentor", "char_rival"]);
    expect(out.fullyResolved).toBe(true);
  });
});
