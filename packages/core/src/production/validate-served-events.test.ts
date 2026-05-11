/**
 * TODO-30 (MAJEUR) — Tests de la validation des `servedEventIds` premium.
 */
import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "../types/narrative-facts";
import {
  PremiumServedEventsViolationError,
  validatePremiumBlueprintsServeRequiredEvents,
} from "./validate-served-events";

function makeBp(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    panelId: overrides.panelId ?? "p1",
    beatId: overrides.beatId ?? "b1",
    panelNumber: overrides.panelNumber ?? 1,
    purpose: overrides.purpose ?? "test panel",
    shotType: overrides.shotType ?? "medium",
    cameraAngle: overrides.cameraAngle ?? "eye_level",
    subjectFocus: overrides.subjectFocus ?? "speaker",
    mustShowEnemy: overrides.mustShowEnemy ?? false,
    requiredNpcCount: overrides.requiredNpcCount ?? 0,
    requiredProps: overrides.requiredProps ?? [],
    requiredLocationSignals: overrides.requiredLocationSignals ?? [],
    cutawayType: overrides.cutawayType ?? "none",
    heroCenterAllowed: overrides.heroCenterAllowed ?? true,
    criticality: overrides.criticality ?? "medium",
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("validatePremiumBlueprintsServeRequiredEvents (TODO-30)", () => {
  it("ne throw pas quand chaque requiredEvent est servi par au moins un panel", () => {
    const blueprints = [
      makeBp({ panelId: "p1", servedEventIds: ["evt_1", "evt_2"] }),
      makeBp({ panelId: "p2", servedEventIds: ["evt_3"] }),
    ];
    expect(() =>
      validatePremiumBlueprintsServeRequiredEvents({
        blueprints,
        requiredEventIds: ["evt_1", "evt_2", "evt_3"],
      }),
    ).not.toThrow();
  });

  it("throw quand un requiredEvent n'est servi par aucun panel", () => {
    const blueprints = [
      makeBp({ panelId: "p1", servedEventIds: ["evt_1"] }),
    ];
    expect(() =>
      validatePremiumBlueprintsServeRequiredEvents({
        blueprints,
        requiredEventIds: ["evt_1", "evt_2"],
      }),
    ).toThrow(PremiumServedEventsViolationError);
  });

  it("throw quand un panel speaker-ish n'a aucun servedEventId", () => {
    const blueprints = [
      makeBp({
        panelId: "p1",
        subjectFocus: "duo",
        dialogueCarrier: "speaker_visible",
        servedEventIds: [],
      }),
    ];
    expect(() =>
      validatePremiumBlueprintsServeRequiredEvents({
        blueprints,
        requiredEventIds: [],
      }),
    ).toThrow(PremiumServedEventsViolationError);
  });

  it("ne throw pas pour un panel d'environnement / transition même sans servedEventId", () => {
    const blueprints = [
      makeBp({
        panelId: "p1",
        subjectFocus: "environment",
        dialogueCarrier: "narration",
        servedEventIds: [],
      }),
    ];
    expect(() =>
      validatePremiumBlueprintsServeRequiredEvents({
        blueprints,
        requiredEventIds: [],
      }),
    ).not.toThrow();
  });

  it("retourne un rapport diagnostic en mode non strict (sans throw)", () => {
    const blueprints = [
      makeBp({
        panelId: "p1",
        subjectFocus: "duo",
        dialogueCarrier: "speaker_visible",
        servedEventIds: [],
      }),
    ];
    const report = validatePremiumBlueprintsServeRequiredEvents({
      blueprints,
      requiredEventIds: ["evt_1"],
      strict: false,
    });
    expect(report.unservedRequiredEventIds).toEqual(["evt_1"]);
    expect(report.blueprintsMissingServedEvents).toHaveLength(1);
    expect(report.blueprintsMissingServedEvents[0]?.panelId).toBe("p1");
  });

  it("liste tous les requiredEvents non servis (pas seulement le premier)", () => {
    const blueprints = [
      makeBp({ panelId: "p1", servedEventIds: ["evt_1"] }),
    ];
    const report = validatePremiumBlueprintsServeRequiredEvents({
      blueprints,
      requiredEventIds: ["evt_1", "evt_2", "evt_3"],
      strict: false,
    });
    expect(report.unservedRequiredEventIds).toEqual(["evt_2", "evt_3"]);
  });
});
