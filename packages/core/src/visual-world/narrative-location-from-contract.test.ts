import { describe, expect, it } from "vitest";
import type { VisualWorldContract, VisualWorldLocation } from "./visual-world-contract";
import {
  beatLocationSceneStringFromVisualWorld,
  locationSceneStringsFromVisualWorldContract,
  requireVisualWorldLocationForBeat,
  sceneStringFromVisualWorldLocation,
} from "./narrative-location-from-contract";

function minimalLoc(id: string, label: string, description: string): VisualWorldLocation {
  return {
    id,
    label,
    kind: "interior",
    description,
    visualAnchors: [],
    architecture: [],
    lighting: [],
    atmosphere: [],
    recurringProps: [],
    negativeConstraints: [],
    source: "ai_generated",
    canonPolicy: "temporary",
  };
}

describe("narrative-location-from-contract", () => {
  it("sceneStringFromVisualWorldLocation combine label et description", () => {
    expect(sceneStringFromVisualWorldLocation(minimalLoc("a", "Toit", "Néons au loin"))).toBe(
      "Toit — Néons au loin",
    );
  });

  it("beatLocationSceneStringFromVisualWorld résout via beatBindings", () => {
    const vw: VisualWorldContract = {
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [{ beatId: "beat_alpha", locationId: "loc-a", primaryPropIds: [], npcGroupIds: [] }],
    };
    expect(beatLocationSceneStringFromVisualWorld(vw, "beat_alpha")).toBe("Hangar — Fuites de vapeur");
    expect(beatLocationSceneStringFromVisualWorld(vw, "missing")).toBeNull();
  });

  it("locationSceneStringsFromVisualWorldContract mappe tous les lieux", () => {
    const vw: VisualWorldContract = {
      chapterId: "c1",
      source: "mixed",
      locations: [minimalLoc("1", "A", "d1"), minimalLoc("2", "B", "d2")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    };
    expect(locationSceneStringsFromVisualWorldContract(vw)).toEqual(["A — d1", "B — d2"]);
  });

  it("requireVisualWorldLocationForBeat retourne le lieu lié au beat", () => {
    const vw: VisualWorldContract = {
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [{ beatId: "beat_alpha", locationId: "loc-a", primaryPropIds: [], npcGroupIds: [] }],
    };
    expect(requireVisualWorldLocationForBeat(vw, "beat_alpha").label).toBe("Hangar");
  });

  it("requireVisualWorldLocationForBeat lève si binding ou lieu manquant", () => {
    const vw: VisualWorldContract = {
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    };
    expect(() => requireVisualWorldLocationForBeat(vw, "beat_x")).toThrow(/premium_missing_beat_location_binding/);
    const vw2: VisualWorldContract = {
      chapterId: "c1",
      source: "ai_generated",
      locations: [],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [{ beatId: "b1", locationId: "missing-id", primaryPropIds: [], npcGroupIds: [] }],
    };
    expect(() => requireVisualWorldLocationForBeat(vw2, "b1")).toThrow(/premium_missing_beat_location:/);
  });
});
