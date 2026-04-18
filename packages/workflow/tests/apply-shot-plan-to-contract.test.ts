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

  it("applique shotType + cameraAngle + subjectFocus sans muter la source", () => {
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
    expect((out as { cameraAngle?: string }).cameraAngle).toBe("low");
    expect((out as { subjectFocus?: string }).subjectFocus).toBe("hero");
    expect((out as { heroCenterAllowed?: boolean }).heroCenterAllowed).toBe(true);

    expect(base.shotType).toBe("medium");
    expect(base.cameraAngle).toBe("eye_level");
  });

  it("coerce les undefined en null", () => {
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
    expect((out as { cameraAngle?: string | null }).cameraAngle ?? null).toBeNull();
    expect((out as { subjectFocus?: string | null }).subjectFocus ?? null).toBeNull();
    expect((out as { cutawayType?: string | null }).cutawayType ?? null).toBeNull();
  });
});
