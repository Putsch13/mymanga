/**
 * TODO-30 — Tests pour la validation de couverture des events dialogue.
 *
 * Vérifie que le pipeline bloque en premium si un event dialogue requis
 * n'est servi par aucun blueprint.
 */
import { describe, expect, it } from "vitest";

/**
 * Helper pur qui extrait la logique de validation TODO-30 pour faciliter
 * les tests. La vraie implémentation dans run-full-chapter-pipeline.ts
 * utilise cette même logique inline.
 */
function assertDialogueEventsCovered(args: {
  dialogueEventIds: Set<string>;
  beatBlueprints: Array<{ beatId?: string; servedEventIds?: string[] }>;
  premiumV3OnlyEnabled: boolean;
}): { unservedDialogueEvents: string[]; threw: boolean } {
  const { dialogueEventIds, beatBlueprints, premiumV3OnlyEnabled } = args;

  const servedEventIdsAll = new Set(
    beatBlueprints.flatMap((bp) =>
      Array.isArray(bp.servedEventIds) ? bp.servedEventIds : [],
    ),
  );

  const unservedDialogueEvents = [...dialogueEventIds].filter(
    (id) => !servedEventIdsAll.has(id),
  );

  if (unservedDialogueEvents.length > 0 && premiumV3OnlyEnabled) {
    return { unservedDialogueEvents, threw: true };
  }

  return { unservedDialogueEvents, threw: false };
}

describe("assertDialogueEventsCovered (TODO-30)", () => {
  it("bloque en premium si un event dialogue n'est servi par aucun blueprint", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_lux_kai_aveu"]),
      beatBlueprints: [
        { beatId: "b1", servedEventIds: ["evt_fight"] }, // ne couvre pas l'aveu
      ],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(true);
    expect(result.unservedDialogueEvents).toContain("evt_lux_kai_aveu");
  });

  it("ne bloque pas en non-premium (warning seulement)", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_lux_kai_aveu"]),
      beatBlueprints: [],
      premiumV3OnlyEnabled: false,
    });

    expect(result.threw).toBe(false);
    expect(result.unservedDialogueEvents).toContain("evt_lux_kai_aveu");
  });

  it("ne bloque pas si tous les events dialogue sont servis", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_lux_kai_aveu", "evt_warning"]),
      beatBlueprints: [
        { beatId: "b1", servedEventIds: ["evt_lux_kai_aveu"] },
        { beatId: "b2", servedEventIds: ["evt_warning", "evt_other"] },
      ],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(false);
    expect(result.unservedDialogueEvents).toHaveLength(0);
  });

  it("ne bloque pas si aucun event dialogue n'est requis", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(), // pas d'events dialogue
      beatBlueprints: [{ beatId: "b1", servedEventIds: ["evt_action"] }],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(false);
    expect(result.unservedDialogueEvents).toHaveLength(0);
  });

  it("gère les blueprints sans servedEventIds", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_dialogue_1"]),
      beatBlueprints: [
        { beatId: "b1" }, // pas de servedEventIds
        { beatId: "b2", servedEventIds: undefined },
        { beatId: "b3", servedEventIds: [] },
      ],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(true);
    expect(result.unservedDialogueEvents).toContain("evt_dialogue_1");
  });

  it("détecte plusieurs events non servis", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_1", "evt_2", "evt_3"]),
      beatBlueprints: [
        { beatId: "b1", servedEventIds: ["evt_2"] }, // seul evt_2 est servi
      ],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(true);
    expect(result.unservedDialogueEvents).toHaveLength(2);
    expect(result.unservedDialogueEvents).toContain("evt_1");
    expect(result.unservedDialogueEvents).toContain("evt_3");
  });

  it("un même event servi par plusieurs blueprints ne pose pas de problème", () => {
    const result = assertDialogueEventsCovered({
      dialogueEventIds: new Set(["evt_aveu"]),
      beatBlueprints: [
        { beatId: "b1", servedEventIds: ["evt_aveu"] },
        { beatId: "b2", servedEventIds: ["evt_aveu"] }, // doublon OK
      ],
      premiumV3OnlyEnabled: true,
    });

    expect(result.threw).toBe(false);
    expect(result.unservedDialogueEvents).toHaveLength(0);
  });
});
