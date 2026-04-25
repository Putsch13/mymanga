import { describe, expect, it } from "vitest";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";

import { buildStoryboardPlanFromPremiumBlueprints } from "./storyboard-from-premium-plan";

function makeBlueprint(panelNumber: number, pageNumber = 1): PanelBlueprintPremium {
  return {
    panelId: `panel-${panelNumber}`,
    beatId: `beat-${panelNumber}`,
    panelNumber,
    pageNumber,
    purpose: "Panel",
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
  };
}

describe("storyboard-from-premium-plan", () => {
  describe("assignBlueprintsToPages — redistribution", () => {
    it("distribue 70 blueprints sur les pages explicites quand tous ont pageNumber=1", () => {
      const blueprints = Array.from({ length: 70 }, (_, i) => makeBlueprint(i + 1, 1));
      const pages = Array.from({ length: 12 }, (_, i) => ({
        pageNumber: i + 1,
        panelCount: i < 10 ? 6 : 5,
      }));

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: blueprints,
        pages,
        chapterLocationName: "Clairière magique",
      });

      expect(plan.pages.every((p) => p.panels.length > 0)).toBe(true);
      const totalPanels = plan.pages.reduce((sum, p) => sum + p.panels.length, 0);
      expect(totalPanels).toBe(70);
      expect(plan.pages.length).toBeGreaterThanOrEqual(10);
    });

    it("ne crée pas de pages vides quand explicitPages en a plus que nécessaire", () => {
      const blueprints = Array.from({ length: 10 }, (_, i) => makeBlueprint(i + 1));
      const explicitPages = Array.from({ length: 20 }, (_, i) => ({
        pageNumber: i + 1,
        panelCount: 5,
      }));

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: blueprints,
        pages: explicitPages,
        chapterLocationName: "Dojo",
      });

      expect(plan.pages.every((p) => p.panels.length > 0)).toBe(true);
    });
  });

  describe("resolveBlueprintLocationName", () => {
    it("n'utilise jamais 'unknown' comme locationName", () => {
      const bp = makeBlueprint(1);
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "unknown",
      });

      expect(plan.pages[0]?.panels[0]?.locationName).not.toBe("unknown");
      expect(plan.pages[0]?.panels[0]?.locationName).toBe("story-consistent setting");
    });

    it("utilise chapterLocationName quand valide", () => {
      const bp = makeBlueprint(1);
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Clairière magique",
      });

      expect(plan.pages[0]?.panels[0]?.locationName).toBe("Clairière magique");
    });

    it("préfère sceneContextLabel sur le blueprint à chapterLocationName", () => {
      const bp = { ...makeBlueprint(1), sceneContextLabel: "Tour de garde" };
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Clairière magique",
      });

      expect(plan.pages[0]?.panels[0]?.locationName).toBe("Tour de garde");
    });
  });

  describe("P1.8 — environmentAnchorId branchement", () => {
    it("résout environmentAnchorId depuis les locations fournies", () => {
      const bp = { ...makeBlueprint(1), sceneContextLabel: "Port de Marseille" };
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Défaut",
        locations: [
          { id: "loc-port", name: "Port de Marseille" },
          { id: "loc-other", name: "Autre lieu" },
        ],
      });

      const panel = plan.pages[0]?.panels[0];
      expect(panel?.locationId).toBe("loc-port");
      expect(panel?.visualAnchors.environmentAnchorId).toBe("loc-port");
    });

    it("retourne null si aucune location ne correspond", () => {
      const bp = { ...makeBlueprint(1), sceneContextLabel: "Lieu inconnu" };
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Défaut",
        locations: [{ id: "loc-port", name: "Port de Marseille" }],
      });

      const panel = plan.pages[0]?.panels[0];
      expect(panel?.locationId).toBeNull();
      expect(panel?.visualAnchors.environmentAnchorId).toBeNull();
    });

    it("résout environmentAnchorId via chapterLocationName si pas de sceneContextLabel", () => {
      const bp = makeBlueprint(1);
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Plage d'Antibes",
        locations: [{ id: "loc-beach", name: "Plage d'Antibes" }],
      });

      const panel = plan.pages[0]?.panels[0];
      expect(panel?.locationId).toBe("loc-beach");
      expect(panel?.visualAnchors.environmentAnchorId).toBe("loc-beach");
    });
  });

  describe("deriveRenderMode — creatures", () => {
    it("détecte creature dans requiredSubjects et retourne creature_reveal", () => {
      const bp = {
        ...makeBlueprint(1),
        requiredSubjects: ["Loup géant"],
        purpose: "Révélation de la créature",
      } as PanelBlueprintPremium & { requiredSubjects: string[] };

      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp as PanelBlueprintPremium],
        chapterLocationName: "Forêt",
      });

      expect(plan.pages[0]?.panels[0]?.renderMode).toBe("creature_reveal");
    });

    it("détecte 'monstre' dans purpose et retourne creature_reveal", () => {
      const bp = { ...makeBlueprint(1), purpose: "Le monstre surgit" };
      const plan = buildStoryboardPlanFromPremiumBlueprints({
        chapterId: "ch-1",
        projectFormat: "manga",
        panelBlueprints: [bp],
        chapterLocationName: "Forêt",
      });

      expect(plan.pages[0]?.panels[0]?.renderMode).toBe("creature_reveal");
    });
  });
});
