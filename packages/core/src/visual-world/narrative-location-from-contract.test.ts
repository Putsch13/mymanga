import { describe, expect, it } from "vitest";
import { parseVisualWorldContract, type VisualWorldLocation } from "./visual-world-contract";
import {
  beatLocationSceneStringFromVisualWorld,
  locationSceneStringsFromVisualWorldContract,
  requireVisualWorldLocationForBeat,
  sceneStringFromVisualWorldLocation,
} from "./narrative-location-from-contract";
import { selectBeatLocationFromVisualWorld } from "./select-beat-location";

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
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "beat_alpha",
          locationId: "loc-a",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    expect(beatLocationSceneStringFromVisualWorld(vw, "beat_alpha")).toBe("Hangar — Fuites de vapeur");
    expect(beatLocationSceneStringFromVisualWorld(vw, "missing")).toBeNull();
  });

  it("locationSceneStringsFromVisualWorldContract mappe tous les lieux", () => {
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "mixed",
      locations: [minimalLoc("1", "A", "d1"), minimalLoc("2", "B", "d2")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    });
    expect(locationSceneStringsFromVisualWorldContract(vw)).toEqual(["A — d1", "B — d2"]);
  });

  it("selectBeatLocationFromVisualWorld est un alias strict de require", () => {
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "beat_alpha",
          locationId: "loc-a",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    expect(selectBeatLocationFromVisualWorld({ visualWorld: vw, beatId: "beat_alpha" }).id).toBe("loc-a");
  });

  it("requireVisualWorldLocationForBeat retourne le lieu lié au beat", () => {
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "beat_alpha",
          locationId: "loc-a",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    expect(requireVisualWorldLocationForBeat(vw, "beat_alpha").label).toBe("Hangar");
  });

  it("requireVisualWorldLocationForBeat lève si binding ou lieu manquant", () => {
    const vw = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "ai_generated",
      locations: [minimalLoc("loc-a", "Hangar", "Fuites de vapeur")],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [],
    });
    expect(() => requireVisualWorldLocationForBeat(vw, "beat_x")).toThrow(/premium_missing_beat_location_binding/);
    const vw2 = parseVisualWorldContract({
      version: 1,
      chapterId: "c1",
      source: "ai_generated",
      locations: [],
      props: [],
      npcGroups: [],
      creatures: [],
      vehicles: [],
      factions: [],
      beatBindings: [
        {
          beatId: "b1",
          locationId: "missing-id",
          primaryPropIds: [],
          npcGroupIds: [],
          creatureIds: [],
          vehicleIds: [],
          factionIds: [],
          continuityObjectIds: [],
        },
      ],
    });
    expect(() => requireVisualWorldLocationForBeat(vw2, "b1")).toThrow(/premium_missing_beat_location:/);
  });
});
