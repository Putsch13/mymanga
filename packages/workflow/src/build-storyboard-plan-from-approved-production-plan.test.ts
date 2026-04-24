import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { buildStoryboardPlanFromApprovedProductionPlan } from "./build-storyboard-plan-from-approved-production-plan";

function minimalBp(overrides: Record<string, unknown> = {}): PanelBlueprintPremium & Record<string, unknown> {
  return {
    panelId: "panel-1",
    beatId: "beat-1",
    panelNumber: 1,
    pageNumber: 1,
    purpose: "Établir la scène",
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
    ...overrides,
  } as unknown as PanelBlueprintPremium & Record<string, unknown>;
}

describe("buildStoryboardPlanFromApprovedProductionPlan", () => {
  it("rejette un productionPlan sans panelBlueprints", () => {
    expect(() =>
      buildStoryboardPlanFromApprovedProductionPlan({
        chapterId: "c1",
        projectId: "p1",
        chapterNumber: 1,
        projectFormat: "manga",
        productionPlan: {},
      }),
    ).toThrow(/approved_production_plan_missing_blueprints/);
  });

  it("conserve renderMode et subjectFocus storyboard présents sur le blueprint", () => {
    const bp = minimalBp({
      panelId: "p-a",
      panelNumber: 1,
      renderMode: "creature_reveal",
      subjectFocus: "creature",
      shotType: "closeup",
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 2,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
    });
    const panel = plan.pages[0]!.panels[0]!;
    expect(panel.renderMode).toBe("creature_reveal");
    expect(panel.subjectFocus).toBe("creature");
    expect(panel.shotType).toBe("closeup");
    expect(panel.targetAspectRatio).toBe("landscape");
    expect(panel.slotType).toBe("creature_reveal");
    expect(panel.layoutHint).toBe("wide_stage");
  });

  it("PATCH 8 — insert_object → square + slot insert_object", () => {
    const bp = minimalBp({
      panelId: "p-insert",
      panelNumber: 1,
      renderMode: "insert_object",
      cutawayType: "prop_insert",
      subjectFocus: "prop",
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
    });
    const panel = plan.pages[0]!.panels[0]!;
    expect(panel.targetAspectRatio).toBe("square");
    expect(panel.slotType).toBe("insert_object");
    expect(panel.layoutHint).toBe("object_square");
  });

  it("mappe subjectFocus core npc -> important_npc sans champ étendu", () => {
    const bp = minimalBp({
      panelId: "p-b",
      panelNumber: 1,
      subjectFocus: "npc",
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
    });
    expect(plan.pages[0]!.panels[0]!.subjectFocus).toBe("important_npc");
  });

  it("fusionne mustShow (contrat + champs extra sur le JSON)", () => {
    const bp = minimalBp({
      panelId: "p-c",
      panelNumber: 1,
      requiredLocationSignals: ["dojo"],
      mustShow: ["épée", "creature_alpha", "pnj_marchand"],
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
    });
    const must = plan.pages[0]!.panels[0]!.mustShow;
    expect(must).toContain("épée");
    expect(must).toContain("dojo");
    expect(must).toContain("creature_alpha");
    expect(must).toContain("pnj_marchand");
  });

  it("utilise layoutTemplate / layoutHint du premier blueprint de la page", () => {
    const bp1 = minimalBp({
      panelId: "p1",
      panelNumber: 1,
      pageNumber: 1,
      layoutHint: "grid_2x2",
    });
    const bp2 = minimalBp({
      panelId: "p2",
      panelNumber: 2,
      pageNumber: 1,
      beatId: "beat-2",
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp1, bp2] },
    });
    expect(plan.pages[0]!.layoutTemplate).toBe("grid_2x2");
    expect(plan.pages[0]!.panels).toHaveLength(2);
  });

  it("recopie mustShowCharacterIds dans characters et visualAnchors.characterIds", () => {
    const bp = minimalBp({
      panelId: "p-d",
      panelNumber: 1,
      mustShowCharacterIds: ["char-hero", "char-npc"],
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
    });
    const panel = plan.pages[0]!.panels[0]!;
    expect(panel.characters).toEqual(["char-hero", "char-npc"]);
    expect(panel.visualAnchors.characterIds).toEqual(["char-hero", "char-npc"]);
  });

  it("expose totalTargetPanels = nombre de blueprints valides", () => {
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: {
        panelBlueprints: [
          minimalBp({ panelId: "a", panelNumber: 1 }),
          minimalBp({ panelId: "b", panelNumber: 2, beatId: "beat-2" }),
          {}, // ignoré
        ],
      },
    });
    expect(plan.totalTargetPanels).toBe(2);
    expect(plan.pages.flatMap((p) => p.panels)).toHaveLength(2);
  });

  it("redistribue 70 blueprints pageNumber=1 et splitte les pages qui dépassent la capacité max (6 panels/page manga)", () => {
    const blueprints = Array.from({ length: 70 }, (_, i) =>
      minimalBp({
        panelId: `panel-${i + 1}`,
        beatId: `beat-${Math.floor(i / 7) + 1}`,
        panelNumber: i + 1,
        pageNumber: 1,
      }),
    );

    // 10 pages explicites demandant 7 panels chacune
    // Mais manga max = 6, donc chaque page sera splitée en 2 (6 + 1)
    const pages = Array.from({ length: 10 }, (_, i) => ({
      pageNumber: i + 1,
      panelCount: 7,
      beatIds: [`beat-${i + 1}`],
    }));

    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: {
        panelBlueprints: blueprints,
        pages,
      },
    });

    // 10 pages * 7 panels → 10 * 2 = 20 pages (chaque page de 7 splitée en 6 + 1)
    expect(plan.pages).toHaveLength(20);
    expect(plan.totalTargetPanels).toBe(70);

    // Toutes les pages doivent respecter la capacité max (6)
    for (const page of plan.pages) {
      expect(page.panels.length).toBeLessThanOrEqual(6);
    }

    // Tous les 70 panels sont distribués
    expect(plan.pages.flatMap((p) => p.panels)).toHaveLength(70);
  });

  it("utilise resolveBlueprintLocationName au lieu de 'unknown'", () => {
    const bp = minimalBp({
      panelId: "p-loc",
      panelNumber: 1,
      requiredLocationSignals: ["Clairière magique"],
    });
    const plan = buildStoryboardPlanFromApprovedProductionPlan({
      chapterId: "c1",
      projectId: "proj-1",
      chapterNumber: 1,
      projectFormat: "manga",
      productionPlan: { panelBlueprints: [bp] },
      chapterLocationName: "unknown",
    });
    const panel = plan.pages[0]!.panels[0]!;
    expect(panel.locationName).toBe("Clairière magique");
    expect(panel.locationName).not.toBe("unknown");
  });
});
