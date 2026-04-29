import { describe, expect, it } from "vitest";
import { hydrateBlueprintsWithCharacterDna } from "./hydrate-blueprints-with-character-dna";
import type { PanelBlueprintPremium } from "../types/narrative-facts";

function minimalBp(overrides: Partial<PanelBlueprintPremium>): PanelBlueprintPremium {
  return {
    panelId: "p1",
    beatId: "b1",
    panelNumber: 1,
    purpose: "test",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "critical",
    mustShowCharacterIds: [],
    requiredCharacterIds: [],
    ...overrides,
  };
}

describe("hydrateBlueprintsWithCharacterDna", () => {
  it("ajoute une entrée DNA pour chaque personnage requis", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [
        minimalBp({
          requiredCharacterIds: ["c1"],
          mustShowCharacterIds: ["c2"],
        }),
      ],
      characters: [
        { id: "c1", name: "A", hairColor: "noir", eyeColor: "vert" },
        { id: "c2", name: "B", hairColor: "roux", eyeColor: null },
      ],
    });
    const ids = new Set((out.characterVisualDna ?? []).map((d) => d.characterId));
    expect(ids.has("c1")).toBe(true);
    expect(ids.has("c2")).toBe(true);
    expect(out.characterVisualDna?.find((d) => d.characterId === "c1")?.hairColor).toBe("noir");
  });

  it("fusionne avec le DNA existant sans écraser les champs déjà renseignés", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [
        minimalBp({
          requiredCharacterIds: ["c1"],
          characterVisualDna: [{ characterId: "c1", hairColor: "argent", eyeColor: "bleu" }],
        }),
      ],
      characters: [{ id: "c1", name: "A", hairColor: "noir", eyeColor: "marron" }],
    });
    const d = out.characterVisualDna?.find((x) => x.characterId === "c1");
    expect(d?.hairColor).toBe("argent");
    expect(d?.eyeColor).toBe("bleu");
  });
});
