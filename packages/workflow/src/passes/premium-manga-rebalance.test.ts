import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  isPremiumMangaCutawayBlueprint,
  rebalancePremiumBlueprintsForManga,
} from "./premium-manga-rebalance";
import { runMangaStructureQaOnBlueprints } from "./manga-structure-qa";
import type { VisualEntity } from "./visual-entity-registry";

function bp(overrides: Partial<PanelBlueprintPremium> & { panelId: string; panelNumber: number }): PanelBlueprintPremium {
  return {
    beatId: "b1",
    purpose: "panel",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "environment",
    cutawayType: "environment",
    requiredProps: [],
    requiredLocationSignals: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    heroCenterAllowed: false,
    criticality: "low",
    mustShowCharacterIds: [],
    ...overrides,
  } as PanelBlueprintPremium;
}

const heroEntity: VisualEntity = {
  id: "h1",
  name: "Miya",
  kind: "hero",
  role: "protagonist",
  importance: "primary",
  visualTags: [],
  beatIds: [],
  canAppearAsGroup: false,
};

describe("premium-manga-rebalance", () => {
  it("réduit les cutaways au-delà de 35%", () => {
    const blueprints: PanelBlueprintPremium[] = Array.from({ length: 20 }, (_, i) =>
      bp({
        panelId: `p-${i}`,
        panelNumber: i + 1,
        subjectFocus: "environment",
        cutawayType: "environment",
        purpose: "atmospheric filler",
        criticality: "low",
      }),
    );

    const out = rebalancePremiumBlueprintsForManga({
      blueprints,
      visualEntities: [heroEntity],
      projectFormat: "manga",
      maxCutawayRatio: 0.35,
      minActorDrivenRatio: 0.55,
      fallbackHeroId: "h1",
    });

    const ratio = out.blueprints.filter(isPremiumMangaCutawayBlueprint).length / out.blueprints.length;
    expect(ratio).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(out.convertedCount).toBeGreaterThan(0);
  });

  it("runMangaStructureQaOnBlueprints accepte un plan équilibré", () => {
    const blueprints: PanelBlueprintPremium[] = [
      bp({ panelId: "p1", panelNumber: 1, subjectFocus: "hero", cutawayType: "none", purpose: "hero beat" }),
      bp({ panelId: "p2", panelNumber: 2, subjectFocus: "hero", cutawayType: "none", purpose: "hero beat 2" }),
      bp({
        panelId: "p3",
        panelNumber: 3,
        subjectFocus: "environment",
        cutawayType: "environment",
        purpose: "establishing",
        contractualCritical: true,
        criticality: "high",
      }),
    ];
    const qa = runMangaStructureQaOnBlueprints({
      blueprints,
      maxCutawayRatio: 0.35,
      minActorDrivenRatio: 0.55,
    });
    expect(qa.ok).toBe(true);
  });
});
