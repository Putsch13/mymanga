/**
 * Tests Sprint B — ChapterShotPlan
 *
 * Invariants :
 *   - un plan vide est bloquant
 *   - un plan 100% héros est bloquant (HERO_OVERLOAD)
 *   - un plan sans cutaway sur > 10 panels est bloquant (MISSING_CUTAWAYS)
 *   - un plan monotone (1 type de cadrage) est bloquant (SHOT_MONOTONY)
 *   - un plan équilibré passe sans blocker
 *   - le human-readable est généré et contient stats + entries
 *   - streaks héros ≥ 6 déclenchent un warning non bloquant
 */

import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  buildChapterShotPlan,
  SHOT_PLAN_THRESHOLDS,
} from "./chapter-shot-plan";

function bp(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  const base: PanelBlueprintPremium = {
    panelId: "p",
    beatId: "b",
    panelNumber: 1,
    pageNumber: 1,
    purpose: "hero walks",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero",
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none",
    heroCenterAllowed: true,
    criticality: "medium",
  };
  return { ...base, ...overrides };
}

function buildHeroOnly(count: number): PanelBlueprintPremium[] {
  return Array.from({ length: count }, (_, i) =>
    bp({
      panelId: `p${i}`,
      panelNumber: i + 1,
      pageNumber: Math.floor(i / 4) + 1,
      purpose: `hero action ${i}`,
      subjectFocus: "hero",
      shotType: "medium",
    }),
  );
}

function buildBalanced(): PanelBlueprintPremium[] {
  // 12 panels : 5 hero, 2 env, 2 prop insert, 1 npc, 1 reaction, 1 duo
  return [
    bp({ panelNumber: 1, shotType: "wide", subjectFocus: "environment", cutawayType: "environment_establishing", purpose: "wide market at dawn" }),
    bp({ panelNumber: 2, shotType: "medium", subjectFocus: "hero", purpose: "hero enters market" }),
    bp({ panelNumber: 3, shotType: "medium", subjectFocus: "npc", purpose: "merchant notices hero" }),
    bp({ panelNumber: 4, shotType: "closeup", subjectFocus: "hero", purpose: "hero looks around" }),
    bp({ panelNumber: 5, shotType: "closeup", subjectFocus: "prop", cutawayType: "prop_insert", purpose: "insert amulet glow" }),
    bp({ panelNumber: 6, shotType: "medium", subjectFocus: "duo", purpose: "hero and ally talk" }),
    bp({ panelNumber: 7, shotType: "wide", subjectFocus: "environment", purpose: "wide street with crowd" }),
    bp({ panelNumber: 8, shotType: "closeup", subjectFocus: "reaction", cutawayType: "reaction_insert", purpose: "merchant reacts" }),
    bp({ panelNumber: 9, shotType: "medium", subjectFocus: "hero", purpose: "hero draws sword" }),
    bp({ panelNumber: 10, shotType: "wide", subjectFocus: "group", purpose: "crowd scatters" }),
    bp({ panelNumber: 11, shotType: "closeup", subjectFocus: "enemy", purpose: "enemy reveal" }),
    bp({ panelNumber: 12, shotType: "over_shoulder", subjectFocus: "hero", purpose: "hero faces enemy" }),
  ];
}

describe("ChapterShotPlan — launch verdicts", () => {
  it("plan vide est bloquant (EMPTY_PLAN)", () => {
    const plan = buildChapterShotPlan({ blueprints: [] });
    expect(plan.reliability.launchAllowed).toBe(false);
    expect(plan.reliability.blockers.some((b) => b.code === "EMPTY_PLAN")).toBe(true);
  });

  it("plan 100% héros sur 20 panels est bloquant (HERO_OVERLOAD)", () => {
    const plan = buildChapterShotPlan({ blueprints: buildHeroOnly(20) });
    expect(plan.reliability.launchAllowed).toBe(false);
    expect(plan.reliability.blockers.some((b) => b.code === "HERO_OVERLOAD")).toBe(true);
  });

  it("plan héros 100% sur 20 panels cumule aussi MISSING_CUTAWAYS, SHOT_MONOTONY, MISSING_ENVIRONMENT", () => {
    const plan = buildChapterShotPlan({ blueprints: buildHeroOnly(20) });
    const codes = plan.reliability.blockers.map((b) => b.code);
    expect(codes).toContain("MISSING_CUTAWAYS");
    expect(codes).toContain("SHOT_MONOTONY");
    expect(codes).toContain("MISSING_ENVIRONMENT");
  });

  it("plan équilibré sur 12 panels passe sans blocker", () => {
    const plan = buildChapterShotPlan({ blueprints: buildBalanced() });
    expect(plan.reliability.launchAllowed, JSON.stringify(plan.reliability.blockers)).toBe(true);
    expect(plan.reliability.blockers).toEqual([]);
  });

  it("petit plan (< 10 panels) ne déclenche pas les blockers structurels (tolérance)", () => {
    const plan = buildChapterShotPlan({ blueprints: buildHeroOnly(6) });
    // Sur 6 panels 100% héros, on a HERO_OVERLOAD mais pas MISSING_CUTAWAYS (smallPlan exempté)
    const codes = plan.reliability.blockers.map((b) => b.code);
    expect(codes).toContain("HERO_OVERLOAD");
    expect(codes).not.toContain("MISSING_CUTAWAYS");
    expect(codes).not.toContain("MISSING_ENVIRONMENT");
  });
});

describe("ChapterShotPlan — catégorisation et distribution", () => {
  it("distribue correctement par catégorie", () => {
    const plan = buildChapterShotPlan({ blueprints: buildBalanced() });
    const d = plan.distribution;
    expect(d.totalPanels).toBe(12);
    expect(d.byCategory.hero_lead).toBeGreaterThan(0);
    expect(d.byCategory.environment_insert + d.byCategory.environment_wide).toBeGreaterThanOrEqual(2);
    expect(d.byCategory.prop_insert).toBeGreaterThanOrEqual(1);
    expect(d.byCategory.reaction_cutaway).toBeGreaterThanOrEqual(1);
    expect(d.byCategory.npc_focus).toBeGreaterThanOrEqual(1);
  });

  it("compte correctement les cutaways et le ratio héros", () => {
    const plan = buildChapterShotPlan({ blueprints: buildBalanced() });
    expect(plan.distribution.cutawayRatio).toBeGreaterThan(0.15);
    expect(plan.distribution.heroLeadRatio).toBeLessThanOrEqual(SHOT_PLAN_THRESHOLDS.MAX_HERO_LEAD_RATIO);
  });
});

describe("ChapterShotPlan — streaks héros", () => {
  it("détecte un streak de 6+ panels héros consécutifs", () => {
    // 6 hero + 6 env : pas de blocker HERO_OVERLOAD (50%), mais streak warning
    const bps: PanelBlueprintPremium[] = [
      ...Array.from({ length: 6 }, (_, i) => bp({ panelNumber: i + 1, subjectFocus: "hero", shotType: "medium" })),
      bp({ panelNumber: 7, subjectFocus: "environment", shotType: "wide", cutawayType: "environment_establishing" }),
      bp({ panelNumber: 8, subjectFocus: "npc", shotType: "medium" }),
      bp({ panelNumber: 9, subjectFocus: "environment", shotType: "wide" }),
      bp({ panelNumber: 10, subjectFocus: "prop", shotType: "closeup", cutawayType: "prop_insert" }),
      bp({ panelNumber: 11, subjectFocus: "reaction", shotType: "closeup", cutawayType: "reaction" }),
      bp({ panelNumber: 12, subjectFocus: "group", shotType: "wide" }),
    ];
    const plan = buildChapterShotPlan({ blueprints: bps });
    expect(plan.reliability.warnings.some((w) => w.code === "HERO_STREAK")).toBe(true);
  });
});

describe("ChapterShotPlan — human-readable", () => {
  it("produit un texte contenant le total panels et les entries", () => {
    const plan = buildChapterShotPlan({
      projectTitle: "My Saga",
      chapterTitle: "Le sanctuaire",
      blueprints: buildBalanced(),
    });
    expect(plan.humanReadable).toContain("My Saga");
    expect(plan.humanReadable).toContain("Le sanctuaire");
    expect(plan.humanReadable).toContain("Total panels : 12");
    expect(plan.humanReadable).toContain("p1:#01");
    expect(plan.humanReadable).toContain("p1:#12");
  });

  it("affiche une section blockers quand il y en a", () => {
    const plan = buildChapterShotPlan({ blueprints: buildHeroOnly(20) });
    expect(plan.humanReadable).toContain("Blocages (launch interdite)");
    expect(plan.humanReadable).toContain("HERO_OVERLOAD");
  });
});

describe("ChapterShotPlan — headlines", () => {
  it("génère une headline compacte avec shot + catégorie + purpose", () => {
    const plan = buildChapterShotPlan({
      blueprints: [
        bp({
          panelNumber: 1,
          shotType: "wide",
          subjectFocus: "environment",
          cutawayType: "environment_establishing",
          purpose: "wide market at dawn, merchants setting up",
        }),
      ],
    });
    const entry = plan.entries[0];
    expect(entry.headline).toContain("wide");
    expect(entry.headline.toLowerCase()).toContain("décor");
    expect(entry.headline).toContain("wide market at dawn");
  });

  it("ajoute le badge ★ pour les panels contractualCritical", () => {
    const plan = buildChapterShotPlan({
      blueprints: [
        bp({
          panelNumber: 1,
          shotType: "closeup",
          subjectFocus: "prop",
          cutawayType: "prop_insert",
          purpose: "ancient amulet",
          contractualCritical: true,
        }),
      ],
    });
    expect(plan.entries[0].headline).toContain("★");
  });
});
