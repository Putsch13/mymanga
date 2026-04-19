/**
 * P4.3 — Test non-régression applyShotPlanToContract.
 *
 * Vérifie que la fonction pure transforme correctement un contrat +
 * un shotPlanPanel en un contrat enrichi, SANS muter l'original.
 */

import { describe, it, expect } from "vitest";
import { applyShotPlanToContract } from "../src/passes/narrative/apply-shot-plan-to-contract";
import type { PanelContract } from "@manga-ai-studio/core";

function makeBaseContract(): PanelContract {
  return {
    panelId: "panel_1",
    pageNumber: 1,
    panelNumber: 1,
    purpose: "action",
    shotType: "medium",
    cameraAngle: "eye_level",
    aspectRatio: "3:2",
    requiredCharacters: [],
    presentInScene: [],
    absentFromScene: [],
    subjectInteraction: null,
    textBoxPlan: {
      layoutType: "action_focus",
      reservedZones: [],
      density: "balanced",
    },
    renderHints: {
      colorPalette: [],
      mood: "neutral",
      lineWeight: "medium",
      screenTone: "light",
    },
  } as unknown as PanelContract;
}

describe("applyShotPlanToContract", () => {
  it("retourne le contrat inchangé si shotPlanPanel est undefined", () => {
    const base = makeBaseContract();
    const out = applyShotPlanToContract(base, undefined);
    expect(out.shotType).toBe(base.shotType);
    expect(out.cameraAngle).toBe(base.cameraAngle);
  });

  it("applique shotType + cameraAngle + subjectFocus sans muter la source (et normalise les enums)", () => {
    const base = makeBaseContract();
    const shotPlanPanel = {
      panelNumber: 1,
      shotType: "wide",
      cameraAngle: "low",
      subjectFocus: "hero",
      cutawayType: "none",
      heroCenterAllowed: true,
    } as Parameters<typeof applyShotPlanToContract>[1];

    const out = applyShotPlanToContract(base, shotPlanPanel);

    expect(out.shotType).toBe("wide");
    // P1.1 — "low" (shot-plan) est normalisé vers "low_angle" (PanelContract).
    expect((out as { cameraAngle?: string }).cameraAngle).toBe("low_angle");
    expect((out as { subjectFocus?: string }).subjectFocus).toBe("hero");
    expect((out as { heroCenterAllowed?: boolean }).heroCenterAllowed).toBe(true);

    expect(base.shotType).toBe("medium");
    expect(base.cameraAngle).toBe("eye_level");
  });

  it("P1.1 — normalise le vocabulaire shot-plan vers la grammaire narrative-facts", () => {
    const base = makeBaseContract();
    const shotPlanPanel = {
      panelNumber: 1,
      shotType: "establishing",
      cameraAngle: "birds_eye",
      subjectFocus: "antagonist",
      cutawayType: "crowd_reaction",
      heroCenterAllowed: false,
    } as unknown as Parameters<typeof applyShotPlanToContract>[1];

    const out = applyShotPlanToContract(base, shotPlanPanel);

    expect(out.shotType).toBe("wide");
    expect((out as { cameraAngle?: string }).cameraAngle).toBe("high_angle");
    expect((out as { subjectFocus?: string }).subjectFocus).toBe("enemy");
    expect((out as { cutawayType?: string }).cutawayType).toBe("npc_group");
  });

  it("fallback : shotType inconnu → on préserve la valeur du contract d'origine", () => {
    const base = makeBaseContract();
    const shotPlanPanel = {
      panelNumber: 1,
      shotType: "close",
      cameraAngle: undefined,
      subjectFocus: undefined,
      cutawayType: undefined,
      heroCenterAllowed: false,
    } as unknown as Parameters<typeof applyShotPlanToContract>[1];

    const out = applyShotPlanToContract(base, shotPlanPanel);
    expect(out.shotType).toBe("medium");
    expect((out as { cameraAngle?: string | null }).cameraAngle ?? null).toBeNull();
    expect((out as { subjectFocus?: string | null }).subjectFocus ?? null).toBeNull();
    expect((out as { cutawayType?: string | null }).cutawayType ?? null).toBeNull();
  });
});
