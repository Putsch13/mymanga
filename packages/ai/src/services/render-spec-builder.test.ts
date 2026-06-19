import { describe, expect, it } from "vitest";
import type { StoryboardPanel } from "../contracts/storyboard-plan";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import { addCharacterEntry, createEmptyChapterVisualMemory } from "./chapter-visual-memory";
import { buildPanelRenderSpec, environmentVisualDnaToRenderEnvironmentRecord } from "./render-spec-builder";

function makePanel(overrides: Partial<StoryboardPanel> = {}): StoryboardPanel {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    globalPanelIndex: 0,
    sourceBeatId: "b1",
    panelPurpose: "reaction_closeup",
    renderMode: "reaction_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    cutawayType: "reaction",
    characters: ["h1"],
    locationId: null,
    locationName: "corridor",
    actionLine: "recoil",
    emotionLine: "shock",
    dialogue: [],
    narration: null,
    sfx: [],
    mustShow: [],
    mustNotShow: [],
    continuityNotes: [],
    visualAnchors: { characterIds: [], environmentAnchorId: null, previousPanelAnchorId: null },
    ...overrides,
  };
}

describe("environmentVisualDnaToRenderEnvironmentRecord", () => {
  it("retourne null sans entrée", () => {
    expect(environmentVisualDnaToRenderEnvironmentRecord(undefined)).toBeNull();
    expect(environmentVisualDnaToRenderEnvironmentRecord(null)).toBeNull();
  });

  it("mappe les champs vers le record attendu par formatEnvironmentDnaForPrompt", () => {
    const rec = environmentVisualDnaToRenderEnvironmentRecord({
      locationName: "cargo bay",
      visualAnchors: ["dim floodlights"],
      architectureHints: ["rusted gantries"],
      atmosphere: ["humid", "ozone"],
      propAnchors: ["sealed crates"],
      lightingHints: ["cyan spill"],
      forbiddenDrift: ["no earth sky"],
      anchorId: "loc-9",
    });
    expect(rec).not.toBeNull();
    expect(String(rec!.description)).toContain("cargo bay");
    expect(rec!.visualAnchors).toEqual(["dim floodlights"]);
    expect(rec!.recurringProps).toEqual(["sealed crates"]);
    expect(rec!.lightingHints).toEqual(["cyan spill"]);
    expect(rec!.negativeConstraints).toEqual(["no earth sky"]);
    expect(rec!.anchorId).toBe("loc-9");
  });
});

describe("buildPanelRenderSpec — PR7 environment + DNA personnage", () => {
  it("propage environmentVisualDna vers spec.environmentDNA", () => {
    const panel = makePanel({
      environmentVisualDna: {
        locationName: "cargo bay",
        visualAnchors: ["dim floodlights", "stacked containers"],
        lightingHints: ["rim light from hatch"],
      },
    });
    const mem = createEmptyChapterVisualMemory("ch1");
    addCharacterEntry(mem, {
      characterId: "h1",
      name: "Hero",
      role: "hero",
      faceRefUrl: "https://example.com/face.png",
      silhouetteRefUrl: null,
      outfitRefUrl: null,
      defaultWeight: 1,
    });
    const spec = buildPanelRenderSpec({
      panel,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: mem,
      characters: [
        {
          id: "h1",
          name: "Hero",
          hairColor: null,
          eyeColor: null,
          characterVisualDna: {
            characterId: "h1",
            hairColor: "silver",
            faceShape: "oval",
            jawline: "soft",
          },
        },
      ],
      mainCharacterIds: ["h1"],
    });
    expect(spec.environmentDNA?.description).toContain("cargo bay");
    expect(spec.environmentDNA?.visualAnchors).toEqual(["dim floodlights", "stacked containers"]);
    const vdna = spec.visibleCharacters[0]?.visualDNA;
    expect(vdna?.faceShape).toBe("oval");
    expect(vdna?.jawline).toBe("soft");
    expect(vdna?.hairColor).toBe("silver");
  });

  it("fusionne characterVisualDna du blueprint panel (prioritaire sur la fiche perso)", () => {
    const panel = makePanel({
      characterVisualDna: [
        {
          characterId: "h1",
          hairColor: "crimson streak",
          faceShape: "angular",
        },
      ],
    });
    const mem = createEmptyChapterVisualMemory("ch1");
    addCharacterEntry(mem, {
      characterId: "h1",
      name: "Hero",
      role: "hero",
      faceRefUrl: "https://example.com/face.png",
      silhouetteRefUrl: null,
      outfitRefUrl: null,
      defaultWeight: 1,
    });
    const spec = buildPanelRenderSpec({
      panel,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: mem,
      characters: [
        {
          id: "h1",
          name: "Hero",
          roleType: "hero",
          hairColor: "navy",
          eyeColor: "green",
          characterVisualDna: { characterId: "h1", hairColor: "navy", jawline: "sharp" },
        },
      ],
      mainCharacterIds: ["h1"],
    });
    const vdna = spec.visibleCharacters[0]?.visualDNA;
    expect(vdna?.hairColor).toBe("crimson streak");
    expect(vdna?.jawline).toBe("sharp");
    expect(vdna?.faceShape).toBe("angular");
  });

  it("premiumOnly : refuse un héros sans ADN visuel substantiel", () => {
    const panel = makePanel({ characters: ["h1"], characterVisualDna: [] });
    const mem = createEmptyChapterVisualMemory("ch1");
    addCharacterEntry(mem, {
      characterId: "h1",
      name: "Hero",
      role: "hero",
      faceRefUrl: "https://example.com/face.png",
      silhouetteRefUrl: null,
      outfitRefUrl: null,
      defaultWeight: 1,
    });
    expect(() =>
      buildPanelRenderSpec({
        panel,
        styleBible: createDefaultChapterStyleBible(),
        visualMemory: mem,
        characters: [
          {
            id: "h1",
            name: "Hero",
            roleType: "hero",
            hairColor: null,
            eyeColor: null,
            characterVisualDna: null,
          },
        ],
        mainCharacterIds: [],
        premiumOnly: true,
      }),
    ).toThrow("premium_missing_character_visual_dna_for_render");
  });

  it("premiumOnly : accepte l’ADN issu uniquement du blueprint panel", () => {
    const panel = makePanel({
      characters: ["h1"],
      characterVisualDna: [{ characterId: "h1", hairColor: "white" }],
    });
    const mem = createEmptyChapterVisualMemory("ch1");
    addCharacterEntry(mem, {
      characterId: "h1",
      name: "Hero",
      role: "hero",
      faceRefUrl: "https://example.com/face.png",
      silhouetteRefUrl: null,
      outfitRefUrl: null,
      defaultWeight: 1,
    });
    const spec = buildPanelRenderSpec({
      panel,
      styleBible: createDefaultChapterStyleBible(),
      visualMemory: mem,
      characters: [
        {
          id: "h1",
          name: "Hero",
          roleType: "hero",
          hairColor: null,
          eyeColor: null,
          characterVisualDna: null,
        },
      ],
      mainCharacterIds: [],
      premiumOnly: true,
    });
    expect(spec.visibleCharacters[0]?.visualDNA?.hairColor).toBe("white");
  });
});
