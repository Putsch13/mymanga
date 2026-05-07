/**
 * Tests robustesse — classification cutaway / actor-driven et runs.
 * Garantit que la pass cutaway reste fiable face aux placeholders et aux
 * subjectFocus ambigus.
 */

import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  blueprintTextBlob,
  containsBannedPlaceholder,
  isPremiumMangaActorDrivenBlueprint,
  isPremiumMangaCutawayBlueprint,
  maxConsecutiveCutawaysInOrder,
  stripBannedPlaceholdersFromBlueprint,
} from "./premium-manga-cutaway";

function bp(overrides: Partial<PanelBlueprintPremium> & { panelId: string; panelNumber: number }): PanelBlueprintPremium {
  return {
    beatId: "b1",
    purpose: "panel",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    cutawayType: "none",
    requiredProps: [],
    requiredLocationSignals: [],
    mustShowEnemy: false,
    requiredNpcCount: 0,
    heroCenterAllowed: true,
    criticality: "medium",
    mustShowCharacterIds: ["h1"],
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("premium-manga-cutaway / classification", () => {
  it("classifie environment / prop / location / aftermath comme cutaway", () => {
    expect(isPremiumMangaCutawayBlueprint(bp({ panelId: "p1", panelNumber: 1, subjectFocus: "environment" }))).toBe(true);
    expect(isPremiumMangaCutawayBlueprint(bp({ panelId: "p2", panelNumber: 2, subjectFocus: "prop" }))).toBe(true);
    expect(isPremiumMangaCutawayBlueprint(bp({ panelId: "p3", panelNumber: 3, subjectFocus: "location" }))).toBe(true);
    expect(isPremiumMangaCutawayBlueprint(bp({ panelId: "p4", panelNumber: 4, subjectFocus: "aftermath" }))).toBe(true);
  });

  it("classifie hero / enemy / npc comme actor-driven", () => {
    expect(isPremiumMangaActorDrivenBlueprint(bp({ panelId: "p1", panelNumber: 1, subjectFocus: "hero" }))).toBe(true);
    expect(isPremiumMangaActorDrivenBlueprint(bp({ panelId: "p2", panelNumber: 2, subjectFocus: "enemy" }))).toBe(true);
    expect(isPremiumMangaActorDrivenBlueprint(bp({ panelId: "p3", panelNumber: 3, subjectFocus: "npc" }))).toBe(true);
  });

  it("détecte les placeholders interdits via blob", () => {
    const cutaway = bp({
      panelId: "p1",
      panelNumber: 1,
      subjectFocus: "hero",
      purpose: "atmospheric scene without a dominant identifiable face",
    });
    expect(containsBannedPlaceholder(cutaway)).toBe(true);
    expect(blueprintTextBlob(cutaway)).toContain("atmospheric scene");
  });

  it("strip les placeholders et restaure un purpose sain", () => {
    const tainted = bp({
      panelId: "p1",
      panelNumber: 1,
      subjectFocus: "hero",
      purpose: "story-consistent interior densified_to_meet_premium_range",
      narrationText: "environment only, prop insert as primary",
      notes: ["without a dominant identifiable face"],
    } as Partial<PanelBlueprintPremium>);

    stripBannedPlaceholdersFromBlueprint(tainted);

    expect(containsBannedPlaceholder(tainted)).toBe(false);
    expect(tainted.purpose.length).toBeGreaterThan(0);
    expect(tainted.narrationText ?? "").not.toMatch(/environment only/i);
    expect((tainted.notes ?? []).every((n) => n.length > 0)).toBe(true);
  });

  it("compte correctement le run de cutaways consécutifs en ordre de lecture", () => {
    const blueprints: PanelBlueprintPremium[] = [
      bp({ panelId: "p1", panelNumber: 1, subjectFocus: "hero" }),
      bp({ panelId: "p2", panelNumber: 2, subjectFocus: "environment", cutawayType: "environment" }),
      bp({ panelId: "p3", panelNumber: 3, subjectFocus: "prop", cutawayType: "prop_insert" } as Partial<PanelBlueprintPremium>),
      bp({ panelId: "p4", panelNumber: 4, subjectFocus: "location", cutawayType: "establishing_environment" } as Partial<PanelBlueprintPremium>),
      bp({ panelId: "p5", panelNumber: 5, subjectFocus: "hero" }),
      bp({ panelId: "p6", panelNumber: 6, subjectFocus: "environment", cutawayType: "environment" }),
    ];

    expect(maxConsecutiveCutawaysInOrder(blueprints)).toBe(3);
  });

  it("détecte cutawayType explicite même sur subjectFocus non cutaway", () => {
    const insert = bp({
      panelId: "p1",
      panelNumber: 1,
      subjectFocus: "hero",
      cutawayType: "prop_insert",
    } as Partial<PanelBlueprintPremium>);
    expect(isPremiumMangaCutawayBlueprint(insert)).toBe(true);
  });
});
