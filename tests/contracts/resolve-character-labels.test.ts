/**
 * P0.3 — Résolution libellés / noms → IDs personnages (cast studio).
 */
import { describe, expect, it } from "vitest";
import {
  buildUnresolvedCharacterLabelsPayload,
  mapCharacterLabelsToIdsSequential,
  resolveCharacterLabelsToIds,
  sanitizeChapterCharacterSelectionIds,
} from "../../apps/web/lib/characters/resolve-character-labels";

const catalog = [
  { id: "char_kenji", name: "Kenji", displayName: null as string | null, roleType: "hero" },
  { id: "char_mira", name: "Mira", displayName: null as string | null, roleType: "supporting" },
] as const;

describe("resolveCharacterLabelsToIds (P0.3)", () => {
  it("résout un ID déjà valide et un nom exact (insensible à la casse)", () => {
    const r = resolveCharacterLabelsToIds({
      labels: ["char_kenji", "mira", "MIRA"],
      projectCharacters: [...catalog],
    });
    expect(r.resolvedIds.sort()).toEqual(["char_kenji", "char_mira"].sort());
    expect(r.unresolvedLabels).toEqual([]);
  });

  it("remonte les libellés inconnus et des suggestions partielles", () => {
    const r = resolveCharacterLabelsToIds({
      labels: ["Inconnu", "Ken"],
      projectCharacters: [...catalog],
    });
    expect(r.unresolvedLabels).toContain("Inconnu");
    expect(r.unresolvedLabels).toContain("Ken");
    const ken = r.suggestions.find((s) => s.label === "Ken");
    expect(ken?.possibleCharacterIds).toContain("char_kenji");
  });

  it("mapCharacterLabelsToIdsSequential déduplique les IDs et signale l’ordre des non résolus", () => {
    const m = mapCharacterLabelsToIdsSequential(
      ["char_kenji", "Kenji", "Fantôme", "char_mira"],
      [...catalog],
    );
    expect(m.sanitizedIds).toEqual(["char_kenji", "char_mira"]);
    expect(m.unresolvedLabels).toEqual(["Fantôme"]);
  });

  it("sanitizeChapterCharacterSelectionIds remplace les noms par des IDs et retire l’inconnu", () => {
    const { selection, strippedLabels } = sanitizeChapterCharacterSelectionIds(
      {
        heroCharacterId: "Kenji",
        secondaryHeroCharacterId: null,
        deuteragonistCharacterId: null,
        coreCastCharacterIds: ["Kenji", "Inconnu"],
        activeCharacterIds: ["char_mira"],
        lockedCharacterIds: [],
        speakingCharacterIds: [],
        evolvingCharacterIds: [],
        antagonistCharacterIds: [],
        recurringNpcIds: [],
      },
      [...catalog],
    );
    expect(selection.heroCharacterId).toBe("char_kenji");
    expect(selection.coreCastCharacterIds).toEqual(["char_kenji"]);
    expect(strippedLabels).toContain("Inconnu");
  });

  it("buildUnresolvedCharacterLabelsPayload déduplique les entrées", () => {
    const p = buildUnresolvedCharacterLabelsPayload(["X", "X", "Y"], [...catalog]);
    expect(p.unresolvedLabels).toEqual(["X", "Y"]);
  });
});
