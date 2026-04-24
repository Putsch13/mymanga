import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  isHardCriticalCutawayBlueprint,
  isPremiumMangaCutawayBlueprint,
  rebalancePremiumBlueprintsForManga,
} from "./premium-manga-rebalance";
import { buildReadingOrderIndexMap } from "./premium-manga-cutaway";
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

function minimalEntity(p: Partial<VisualEntity> & Pick<VisualEntity, "id" | "name">): VisualEntity {
  const dna = p.visualDna ?? { colors: [], props: [], symbols: [], forbiddenDrift: [] };
  return {
    projectId: p.projectId ?? "test-proj",
    aliases: p.aliases ?? [],
    id: p.id,
    name: p.name,
    userDefinedKind: p.userDefinedKind ?? "story character",
    semanticTags: p.semanticTags ?? [],
    role: p.role ?? "neutral",
    scale: p.scale ?? "individual",
    isOpponent: p.isOpponent ?? false,
    isSentient: p.isSentient ?? true,
    isNamed: p.isNamed ?? true,
    isFaction: p.isFaction ?? false,
    canAppearAsGroup: p.canAppearAsGroup ?? false,
    groupCountHint: p.groupCountHint,
    canonicalDescription: p.canonicalDescription ?? p.name,
    visualDna: dna,
    referenceImageUrls: p.referenceImageUrls ?? [],
    consistencyLevel: p.consistencyLevel ?? "medium",
    createdFrom: p.createdFrom ?? "character_sheet",
    beatIds: p.beatIds ?? [],
  };
}

const heroEntity: VisualEntity = minimalEntity({
  id: "h1",
  name: "Miya",
  role: "protagonist",
  userDefinedKind: "main protagonist",
  isOpponent: false,
  consistencyLevel: "strict",
});

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
      minActorDrivenRatio: 0.58,
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
      minActorDrivenRatio: 0.58,
    });
    expect(qa.ok).toBe(true);
  });

  it("ne marque pas tout reveal comme hard-critical (évite keptCritical massif)", () => {
    const bps: PanelBlueprintPremium[] = [
      bp({
        panelId: "p1",
        panelNumber: 5,
        subjectFocus: "environment",
        cutawayType: "environment",
        purpose: "minor reveal of a door",
        criticality: "high",
      }),
    ];
    const order = buildReadingOrderIndexMap(bps);
    expect(isHardCriticalCutawayBlueprint(bps[0]!, order.get("p1") ?? 0)).toBe(false);
  });

  it("ajoute un panel adversaire sur un beat de combat sans ennemi visible", () => {
    const villain: VisualEntity = minimalEntity({
      id: "v1",
      name: "Shade",
      role: "antagonist",
      userDefinedKind: "shadow antagonist",
      isOpponent: true,
    });

    const blueprints: PanelBlueprintPremium[] = [
      bp({
        panelId: "p1",
        panelNumber: 1,
        beatId: "beat_fight",
        subjectFocus: "environment",
        cutawayType: "environment",
        purpose: "combat begins — atmospheric tension",
        mustShowEnemy: true,
      }),
    ];

    const out = rebalancePremiumBlueprintsForManga({
      blueprints,
      visualEntities: [heroEntity, villain],
      projectFormat: "manga",
      maxCutawayRatio: 0.35,
      minActorDrivenRatio: 0.58,
      fallbackHeroId: "h1",
    });

    const qa = runMangaStructureQaOnBlueprints({
      blueprints: out.blueprints,
      maxCutawayRatio: 0.35,
      minActorDrivenRatio: 0.58,
      visualEntities: [heroEntity, villain],
    });
    expect(qa.ok).toBe(true);
    expect(out.blueprints[0]?.subjectFocus).toBe("visual_entity");
  });
});
