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

  it("inclut visualCanonExcerpt depuis stableVisualDNA", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [minimalBp({ requiredCharacterIds: ["c1"] })],
      characters: [
        {
          id: "c1",
          name: "A",
          hairColor: null,
          eyeColor: null,
          stableVisualDNA: { faceShape: "oval", skinTone: "tan", scars: ["left cheek"] },
        },
      ],
    });
    const excerpt = out.characterVisualDna?.find((x) => x.characterId === "c1")?.visualCanonExcerpt;
    expect(excerpt).toBeTruthy();
    expect(excerpt).toMatch(/faceShape/i);
    expect(excerpt).toMatch(/skinTone/i);
  });

  it("remplit les champs CharacterVisualDna depuis stableVisualDNA (PR8)", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [minimalBp({ requiredCharacterIds: ["c1"] })],
      characters: [
        {
          id: "c1",
          name: "A",
          hairColor: null,
          eyeColor: null,
          stableVisualDNA: {
            hairStyle: "undercut",
            jawline: "square",
            silhouetteType: "athletic",
            accessories: ["ear cuff"],
            fixedAccessories: ["glasses"],
          },
        },
      ],
    });
    const d = out.characterVisualDna?.find((x) => x.characterId === "c1");
    expect(d?.hairStyle).toBe("undercut");
    expect(d?.jawline).toBe("square");
    expect(d?.silhouetteType).toBe("athletic");
    expect(d?.accessoriesLine).toMatch(/ear cuff/);
    expect(d?.accessoriesLine).toMatch(/glasses/);
  });

  it("hydrate le locuteur speaker_visible et le co‑protagoniste quand un slot personnage est actif", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [
        minimalBp({
          requiredCharacterIds: ["hero-1"],
          dialogueCarrier: "speaker_visible",
          speakerAnchorCharacterId: "hero-1",
        }),
      ],
      characters: [
        { id: "hero-1", name: "H1", hairColor: "noir", eyeColor: "vert" },
        { id: "hero-2", name: "H2", hairColor: "blond", eyeColor: "bleu" },
      ],
      coProtagonistCharacterIds: ["hero-2"],
    });
    const ids = new Set((out.characterVisualDna ?? []).map((d) => d.characterId));
    expect(ids.has("hero-1")).toBe(true);
    expect(ids.has("hero-2")).toBe(true);
  });

  it("hydrate aussi les IDs listés dans requiredCharacters (sans requiredCharacterIds)", () => {
    const [out] = hydrateBlueprintsWithCharacterDna({
      blueprints: [
        minimalBp({
          requiredCharacterIds: [],
          requiredCharacters: ["side-9"],
        }),
      ],
      characters: [{ id: "side-9", name: "Sidekick", hairColor: "roux", eyeColor: null }],
    });
    const d = out.characterVisualDna?.find((x) => x.characterId === "side-9");
    expect(d?.displayName).toBe("Sidekick");
    expect(d?.hairColor).toBe("roux");
  });
});
