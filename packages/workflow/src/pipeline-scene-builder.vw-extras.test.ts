import { describe, expect, it } from "vitest";
import {
  inferRequiredSceneExtras,
  inferRequiredSceneExtrasWithVisualWorld,
} from "./pipeline-scene-builder";
import type { VisualWorldContract } from "@manga-ai-studio/core";

const minimalScene = {
  summary: "Calme sur la place du village.",
  location: "Place",
  characters: ["Hero"],
};

function minimalVw(overrides: Partial<VisualWorldContract> = {}): VisualWorldContract {
  return {
    chapterId: "ch1",
    source: "ai_generated",
    locations: [],
    props: [],
    npcGroups: [],
    creatures: [],
    vehicles: [],
    factions: [],
    beatBindings: [],
    ...overrides,
  } as VisualWorldContract;
}

describe("inferRequiredSceneExtrasWithVisualWorld", () => {
  it("retourne les npcGroups du contrat quand le beatId matche", () => {
    const vw = minimalVw({
      npcGroups: [
        {
          id: "g-vendors",
          label: "Marchands",
          role: "crowd",
          visualProfile: "stands colorés",
          outfit: "tabliers",
          silhouette: "variée",
          relationToLocation: "bord de allée",
          requiredBeatIds: ["beat-2"],
          recurrencePolicy: "background",
        },
      ],
    });
    const r = inferRequiredSceneExtrasWithVisualWorld(vw, minimalScene, "beat-2");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      archetypeId: "g-vendors",
      archetypeLabel: "Marchands",
      source: "ai_generated",
      anchorSlot: "bord-de-allee",
    });
  });

  it("plafonne à 4 groupes", () => {
    const groups = Array.from({ length: 6 }, (_, i) => ({
      id: `g-${i}`,
      label: `G${i}`,
      role: "crowd",
      visualProfile: "x",
      outfit: "y",
      silhouette: "z",
      relationToLocation: null,
      requiredBeatIds: ["b1"],
      recurrencePolicy: "background" as const,
    }));
    const vw = minimalVw({ npcGroups: groups });
    expect(inferRequiredSceneExtrasWithVisualWorld(vw, minimalScene, "b1")).toHaveLength(4);
  });

  it("retombe sur inferRequiredSceneExtras sans vw ou sans beatId", () => {
    const legacy = inferRequiredSceneExtras({
      summary: "Scène à la taverne",
      location: "Taverne",
      characters: ["A", "B"],
    });
    expect(
      inferRequiredSceneExtrasWithVisualWorld(null, {
        summary: "Scène à la taverne",
        location: "Taverne",
        characters: ["A", "B"],
      }, "beat-x"),
    ).toEqual(legacy);
  });

  it("retombe sur legacy si aucun groupe pour ce beat", () => {
    const vw = minimalVw({
      npcGroups: [
        {
          id: "g1",
          label: "X",
          role: "crowd",
          visualProfile: "x",
          outfit: "y",
          silhouette: "z",
          relationToLocation: null,
          requiredBeatIds: ["other"],
          recurrencePolicy: "background",
        },
      ],
    });
    const r = inferRequiredSceneExtrasWithVisualWorld(
      vw,
      {
        summary: "Scène à la taverne",
        location: "Taverne",
        characters: ["A", "B"],
      },
      "beat-x",
    );
    expect(r.some((x) => x.source === "legacy")).toBe(true);
  });
});
