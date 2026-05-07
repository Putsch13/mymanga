import { describe, expect, it } from "vitest";
import { validateRenderSpec, assertValidRenderSpec, RenderSpecValidationError } from "./render-spec-validator";
import { createDefaultChapterStyleBible } from "../contracts/chapter-style-bible";
import type { PanelRenderSpec } from "../contracts/panel-render-spec";

function makeSpec(overrides: Partial<PanelRenderSpec> = {}): PanelRenderSpec {
  return {
    panelId: "p1",
    pageNumber: 1,
    panelNumberInPage: 1,
    // COMMIT C — panelPurpose est maintenant requis sur le spec.
    panelPurpose: "reaction_closeup",
    renderMode: "reaction_closeup",
    shotType: "closeup",
    cameraAngle: "eye_level",
    subjectFocus: "reaction",
    cutawayType: "reaction",
    locationName: "salle",
    actionLine: "a",
    emotionLine: "e",
    dialogueIntent: null,
    visibleCharacters: [
      { characterId: "c1", name: "Hero", role: "hero", poseIntent: null, expressionIntent: null },
    ],
    styleBible: createDefaultChapterStyleBible(),
    continuityLocks: {
      outfitLocks: [],
      bodyStateLocks: [],
      propLocks: [],
      environmentLocks: [],
    },
    imageReferences: {
      characterRefs: [{ characterId: "c1", url: "https://x/f.png", weight: 1 }],
      environmentRefs: [],
      panelRefs: [],
      styleRefs: [],
    },
    constraints: {
      mustShow: [],
      mustNotShow: [],
      forbiddenDrift: [],
      noTextInsideImage: true,
    },
    ...overrides,
  };
}

describe("validateRenderSpec", () => {
  // P7.24 — Contradictions sont des erreurs non-fatales (warnings)
  it("détecte la contradiction establishing_environment + subjectFocus=hero comme non-fatale", () => {
    const r = validateRenderSpec(
      makeSpec({ renderMode: "establishing_environment", subjectFocus: "hero", shotType: "wide" }),
    );
    expect(r.issues.some((i) => i.includes("establishing_environment+hero"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("establishing_environment+hero"))).toBe(true);
  });

  it("détecte la contradiction insert_object + hero comme non-fatale", () => {
    const r = validateRenderSpec(
      makeSpec({ renderMode: "insert_object", subjectFocus: "hero", shotType: "extreme_closeup" }),
    );
    expect(r.issues.some((i) => i.includes("insert_object+hero"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("insert_object+hero"))).toBe(true);
  });

  it("détecte closeup + shotType=wide comme non-fatale", () => {
    const r = validateRenderSpec(makeSpec({ shotType: "wide" }));
    expect(r.issues.some((i) => i.includes("closeup+wide"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("closeup+wide"))).toBe(true);
  });

  it("détecte hero présent sans characterRefs comme non-fatale", () => {
    const r = validateRenderSpec(
      makeSpec({
        imageReferences: { characterRefs: [], environmentRefs: [], panelRefs: [], styleRefs: [] },
      }),
    );
    expect(r.issues.some((i) => i.includes("missing_character_refs_for_hero_or_support"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("missing_character_refs_for_hero_or_support"))).toBe(true);
  });

  // P7.24 — assertValidRenderSpec ne lève pas sur les erreurs non-fatales (mode non-strict)
  it("assertValidRenderSpec ne lève pas sur erreur non-fatale en mode non-strict", () => {
    expect(() => assertValidRenderSpec(makeSpec({ shotType: "wide" }))).not.toThrow();
  });

  it("assertValidRenderSpec lève sur erreur non-fatale en mode strict", () => {
    expect(() => assertValidRenderSpec(makeSpec({ shotType: "wide" }), true)).toThrow(
      RenderSpecValidationError,
    );
  });

  it("assertValidRenderSpec lève sur erreur fatale même en mode non-strict", () => {
    expect(() => assertValidRenderSpec(makeSpec({ renderMode: "unknown" as never }))).toThrow(
      RenderSpecValidationError,
    );
  });

  it("accepte un spec minimal valide", () => {
    expect(validateRenderSpec(makeSpec()).ok).toBe(true);
  });

  it("accepte character_focus avec un héros et des refs", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "character_focus",
        panelPurpose: "hero_focus",
        shotType: "medium",
        subjectFocus: "hero",
      }),
    );
    expect(r.ok).toBe(true);
  });

  // P7.24 — Ces erreurs sont non-fatales
  it("détecte un reaction_closeup sans personnage visible comme non-fatale", () => {
    const r = validateRenderSpec(makeSpec({ visibleCharacters: [] }));
    expect(r.issues.some((i) => i.includes("missing_visible_characters_for_renderMode=reaction_closeup"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("missing_visible_characters_for_renderMode=reaction_closeup"))).toBe(true);
  });

  it("détecte un dialogue_two_shot avec moins de deux personnages comme non-fatale", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "dialogue_two_shot",
        panelPurpose: "dialogue_anchor",
        shotType: "medium",
        subjectFocus: "group",
        visibleCharacters: [{ characterId: "c1", name: "Miya", role: "hero", poseIntent: null, expressionIntent: null }],
      }),
    );
    expect(r.issues.some((i) => i.includes("insufficient_visible_characters_for_renderMode=dialogue_two_shot"))).toBe(true);
    expect(r.nonFatalIssues.some((i) => i.includes("insufficient_visible_characters_for_renderMode=dialogue_two_shot"))).toBe(true);
  });

  // COMMIT G — tests bloquants (mission de refonte P11 §4).
  // Ces tests refusent les sentinelles legacy qui ont causé les logs
  // `panel=unknown subjectFocus=none → CHARACTER_IN_SCENE` en prod.

  it.each(["unknown", "none", "undefined", "null", "n/a", "tbd", "todo", ""])(
    "COMMIT G — refuse panelPurpose=%s (sentinelle legacy interdite)",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ panelPurpose: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("panelPurpose_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );

  // P7.24 — subjectFocus sentinelle est une erreur NON-FATALE (warning)
  it.each(["unknown", "none", "undefined", "null", "n/a", "tbd", "todo"])(
    "COMMIT G — détecte subjectFocus=%s comme erreur non-fatale",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ subjectFocus: sentinel as never }));
      expect(r.issues.some((i) => i.includes("subjectFocus_missing_or_sentinel"))).toBe(
        true,
      );
      expect(r.nonFatalIssues.some((i) => i.includes("subjectFocus_missing_or_sentinel"))).toBe(
        true,
      );
      // ok peut être true car ce n'est pas fatal
    },
  );

  // P7.24 — renderMode sentinelle est une erreur FATALE
  it.each(["unknown", "none"])(
    "COMMIT G — refuse renderMode=%s comme erreur fatale",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ renderMode: sentinel as never }));
      expect(r.ok).toBe(false);
      expect(r.issues.some((i) => i.includes("renderMode_missing_or_sentinel"))).toBe(
        true,
      );
      expect(r.fatalIssues.some((i) => i.includes("renderMode_missing_or_sentinel"))).toBe(
        true,
      );
    },
  );

  // P7.24 — shotType sentinelle est une erreur NON-FATALE (warning)
  it.each(["unknown", "none"])(
    "COMMIT G — détecte shotType=%s comme erreur non-fatale",
    (sentinel) => {
      const r = validateRenderSpec(makeSpec({ shotType: sentinel as never }));
      expect(r.issues.some((i) => i.includes("shotType_missing_or_sentinel"))).toBe(
        true,
      );
      expect(r.nonFatalIssues.some((i) => i.includes("shotType_missing_or_sentinel"))).toBe(
        true,
      );
      // ok peut être true car ce n'est pas fatal
    },
  );

  it("P0.12 — vehicle_reveal sans npcVisualDna category vehicle est fatal", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "vehicle_reveal",
        panelPurpose: "vehicle_reveal",
        shotType: "wide",
        subjectFocus: "vehicle",
        npcVisualDna: [{ continuityId: "g1", displayName: "Foule", category: "crowd", visualMarkers: [] }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.fatalIssues.some((i) => i.includes("vehicle_reveal_missing_vehicle_npcVisualDna"))).toBe(true);
  });

  it("P0.12 — vehicle_reveal avec vehicleVisualDna (sans npc category) évite l'erreur fatal", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "vehicle_reveal",
        panelPurpose: "vehicle_reveal",
        shotType: "wide",
        subjectFocus: "vehicle",
        npcVisualDna: undefined,
        vehicleVisualDna: [
          { id: "v1", label: "Van", visualDescription: "Noir", requiredBeatIds: [], scale: "medium" },
        ],
      }),
    );
    expect(r.fatalIssues.some((i) => i.includes("vehicle_reveal_missing_vehicle_npcVisualDna"))).toBe(false);
  });

  it("P0.12 — vehicle_reveal avec npcVisualDna vehicle évite l'erreur fatal associée (legacy)", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "vehicle_reveal",
        panelPurpose: "vehicle_reveal",
        shotType: "wide",
        subjectFocus: "vehicle",
        npcVisualDna: [{ continuityId: "v1", displayName: "Van", category: "vehicle", visualMarkers: ["noir"] }],
      }),
    );
    expect(r.fatalIssues.some((i) => i.includes("vehicle_reveal_missing_vehicle_npcVisualDna"))).toBe(false);
  });

  it("P0.12 — faction_reveal avec factionVisualDna évite l'erreur fatal", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "faction_reveal",
        panelPurpose: "faction_reveal",
        shotType: "wide",
        subjectFocus: "faction",
        npcVisualDna: undefined,
        factionVisualDna: [
          {
            id: "f1",
            label: "Syndicat",
            visualMarkers: ["violet"],
            visualMotifs: [],
            colors: [],
            requiredBeatIds: [],
          },
        ],
      }),
    );
    expect(r.fatalIssues.some((i) => i.includes("faction_reveal_missing_faction_npcVisualDna"))).toBe(false);
  });

  it("P0.12 — faction_reveal sans npcVisualDna faction est fatal", () => {
    const r = validateRenderSpec(
      makeSpec({
        renderMode: "faction_reveal",
        panelPurpose: "faction_reveal",
        shotType: "wide",
        subjectFocus: "faction",
        npcVisualDna: undefined,
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.fatalIssues.some((i) => i.includes("faction_reveal_missing_faction_npcVisualDna"))).toBe(true);
  });
});
