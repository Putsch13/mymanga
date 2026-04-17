import { describe, expect, it } from "vitest";
import {
  computeChapterFocusBudget,
  buildPanelBlueprintsFromBeat,
  inferNarrativeFactsFromBeat,
  inferRequiredPropsFromBeat,
} from "@manga-ai-studio/ai";
import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";

function makeBeat(overrides: Partial<ProductionBeat> = {}): ProductionBeat {
  return {
    beatId: `beat-${Math.random().toString(36).slice(2)}`,
    summary: overrides.summary ?? "Un beat de test",
    narrativeFunction: overrides.narrativeFunction ?? "test",
    whyThisBeatExists: "test",
    dramaticChange: "test",
    involvedCharacters: ["hero-1"],
    activeCanonConstraints: [],
    environmentContext: ["lieu de test"],
    visualPriority: "medium",
    estimatedPanels: 4,
    criticality: "medium",
    continuityDependencies: [],
    infoGained: null,
    emotionProduced: null,
    indispensabilityScore: 60,
    redundancyRisk: 20,
    ...overrides,
  };
}

function makeHeroCentricBlueprints(count: number): PanelBlueprintPremium[] {
  return Array.from({ length: count }, (_, i) => ({
    panelId: `panel-hero-${i}`,
    beatId: "beat-1",
    pageNumber: 1,
    panelNumber: i + 1,
    purpose: "character medium",
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero" as const,
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    optionalProps: [],
    requiredLocationSignals: [],
    cutawayType: "none" as const,
    heroCenterAllowed: true,
    criticality: "medium" as const,
  }));
}

describe("focus-budget — détection hero overload", () => {
  it("détecte une violation hero_overload si plus de 70% des panels sont héros-centriques", () => {
    // 8 panels héros sur 10 = 80% → violation
    const heroPanels = makeHeroCentricBlueprints(8);
    const envPanel: PanelBlueprintPremium = {
      panelId: "panel-env-1",
      beatId: "beat-1",
      pageNumber: 1,
      panelNumber: 9,
      purpose: "establishing",
      shotType: "wide",
      cameraAngle: "eye_level",
      subjectFocus: "environment",
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      optionalProps: [],
      requiredLocationSignals: [],
      cutawayType: "environment",
      heroCenterAllowed: false,
      criticality: "low",
    };
    const envPanel2 = { ...envPanel, panelId: "panel-env-2", panelNumber: 10 };
    const blueprints = [...heroPanels, envPanel, envPanel2];

    const budget = computeChapterFocusBudget(blueprints);
    const heroOverload = budget.violations.find((v) => v.type === "hero_overload");
    expect(heroOverload).toBeDefined();
    expect(heroOverload?.severity).toBe("blocking");
    expect(budget.heroCenterRatio).toBeGreaterThan(0.7);
  });

  it("ne génère pas de violation hero_overload si le ratio héros est sous 30% (MANGA_SHOT_BUDGET)", () => {
    // 2 héros sur 10 = 20% → sous MAX_HERO_CENTER_RATIO (0.30)
    const heroPanels = makeHeroCentricBlueprints(2);
    const envPanels: PanelBlueprintPremium[] = Array.from({ length: 8 }, (_, i) => ({
      panelId: `panel-env-${i}`,
      beatId: "beat-1",
      pageNumber: 1,
      panelNumber: 3 + i,
      purpose: "establishing",
      shotType: "wide",
      cameraAngle: "eye_level",
      subjectFocus: "environment" as const,
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      optionalProps: [],
      requiredLocationSignals: [],
      cutawayType: "environment" as const,
      heroCenterAllowed: false,
      criticality: "low" as const,
    }));
    const blueprints = [...heroPanels, ...envPanels];

    const budget = computeChapterFocusBudget(blueprints);
    const heroOverload = budget.violations.find((v) => v.type === "hero_overload");
    expect(heroOverload).toBeUndefined();
  });

  it("émet un warning (pas un blocking) si le ratio héros est entre 30% et 70%", () => {
    // 6 héros sur 10 = 60% → warning (au-dessus de 30%, sous 70%)
    const heroPanels = makeHeroCentricBlueprints(6);
    const envPanels: PanelBlueprintPremium[] = Array.from({ length: 4 }, (_, i) => ({
      panelId: `panel-env-${i}`,
      beatId: "beat-1",
      pageNumber: 1,
      panelNumber: 7 + i,
      purpose: "establishing",
      shotType: "wide",
      cameraAngle: "eye_level",
      subjectFocus: "environment" as const,
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      optionalProps: [],
      requiredLocationSignals: [],
      cutawayType: "environment" as const,
      heroCenterAllowed: false,
      criticality: "low" as const,
    }));
    const blueprints = [...heroPanels, ...envPanels];

    const budget = computeChapterFocusBudget(blueprints);
    const heroOverload = budget.violations.find((v) => v.type === "hero_overload");
    expect(heroOverload).toBeDefined();
    expect(heroOverload?.severity).toBe("warning");
  });
});

describe("focus-budget — cutaway décor imposé", () => {
  it("génère une violation missing_environment si aucun panel décor n'est prévu", () => {
    const heroPanels = makeHeroCentricBlueprints(5);
    const budget = computeChapterFocusBudget(heroPanels);
    const missingEnv = budget.violations.find((v) => v.type === "missing_environment");
    expect(missingEnv).toBeDefined();
    expect(missingEnv?.severity).toBe("blocking");
  });

  it("ne génère pas de violation missing_environment si au moins un panel décor est présent", () => {
    const heroPanels = makeHeroCentricBlueprints(4);
    const envPanel: PanelBlueprintPremium = {
      panelId: "panel-env",
      beatId: "beat-1",
      pageNumber: 1,
      panelNumber: 5,
      purpose: "establishing",
      shotType: "wide",
      cameraAngle: "eye_level",
      subjectFocus: "environment",
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      optionalProps: [],
      requiredLocationSignals: [],
      cutawayType: "environment",
      heroCenterAllowed: false,
      criticality: "low",
    };
    const budget = computeChapterFocusBudget([...heroPanels, envPanel]);
    const missingEnv = budget.violations.find((v) => v.type === "missing_environment");
    expect(missingEnv).toBeUndefined();
  });
});

describe("focus-budget — ennemi obligatoire", () => {
  it("génère une violation missing_enemy_focus si mustShowEnemy est vrai mais aucun panel ennemi", () => {
    const heroPanels = makeHeroCentricBlueprints(3);
    // Ajouter un panel avec mustShowEnemy=true mais subjectFocus=hero
    const enemyRequiredPanel: PanelBlueprintPremium = {
      ...heroPanels[0],
      panelId: "panel-enemy-required",
      mustShowEnemy: true,
      subjectFocus: "hero", // Pas de focus ennemi malgré l'obligation
    };
    const envPanel: PanelBlueprintPremium = {
      panelId: "panel-env",
      beatId: "beat-1",
      pageNumber: 1,
      panelNumber: 5,
      purpose: "establishing",
      shotType: "wide",
      cameraAngle: "eye_level",
      subjectFocus: "environment",
      mustShowEnemy: false,
      requiredNpcCount: 0,
      requiredProps: [],
      optionalProps: [],
      requiredLocationSignals: [],
      cutawayType: "environment",
      heroCenterAllowed: false,
      criticality: "low",
    };
    const budget = computeChapterFocusBudget([...heroPanels, enemyRequiredPanel, envPanel]);
    const missingEnemy = budget.violations.find((v) => v.type === "missing_enemy_focus");
    expect(missingEnemy).toBeDefined();
  });
});

describe("focus-budget — intégration avec buildPanelBlueprintsFromBeat", () => {
  it("un chapitre combat génère des panels variés sans hero overload", () => {
    const beat = makeBeat({
      summary: "Le héros affronte l'ennemi dans un duel intense.",
      narrativeFunction: "combat",
    });
    const facts = inferNarrativeFactsFromBeat(beat, {});
    const props = inferRequiredPropsFromBeat(beat, facts, { universeType: "ninja" });
    const blueprints = buildPanelBlueprintsFromBeat(beat, facts, props, { heroCharacterId: "hero-1" });

    const budget = computeChapterFocusBudget(blueprints);
    // Un beat combat doit avoir au moins un panel ennemi
    expect(budget.enemyFocusPanels).toBeGreaterThan(0);
    // Et au moins un cutaway
    expect(budget.cutawayCount).toBeGreaterThan(0);
  });
});
