import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import { describe, expect, it } from "vitest";
import { computePremiumReadinessScore } from "./blueprint-budgets";

function minimalBlueprint(overrides: Partial<PanelBlueprintPremium> = {}): PanelBlueprintPremium {
  return {
    beatId: "b1",
    panelIndex: 0,
    subjectFocus: "environment",
    shotType: "wide",
    cutawayType: "none",
    dialogueCarrier: "narration",
    heroCenterAllowed: false,
    mustShowEnemy: false,
    requiredProps: [],
    requiredCharacterIds: [],
    mustShowCharacterIds: [],
    mayShowCharacterIds: [],
    requiredNpcCount: 0,
    ...overrides,
  } as PanelBlueprintPremium;
}

describe("computePremiumReadinessScore — cast secondaire (PR10)", () => {
  it("sans castContext : score de base inchangé pour un chapitre minimal valide", () => {
    const bps = Array.from({ length: 8 }, (_, i) =>
      minimalBlueprint({
        panelIndex: i,
        subjectFocus: i === 0 ? "environment" : "hero",
        mustShowCharacterIds: i > 0 ? ["hero-1"] : [],
      }),
    );
    const withCast = computePremiumReadinessScore(bps, {
      heroCharacterId: "hero-1",
      secondaryHeroCharacterId: null,
      deuteragonistCharacterId: null,
    });
    const noCast = computePremiumReadinessScore(bps);
    expect(withCast).toBe(noCast);
  });

  it("pénalise si héros 2 configuré mais absent de tous les blueprints", () => {
    const bps = Array.from({ length: 10 }, (_, i) =>
      minimalBlueprint({
        panelIndex: i,
        subjectFocus: i === 0 ? "environment" : "hero",
        mustShowCharacterIds: i > 0 ? ["hero-1"] : [],
        characterVisualDna: i > 0 ? [{ characterId: "hero-1", hairColor: "noir" }] : [],
      }),
    );
    const base = computePremiumReadinessScore(bps);
    const penalized = computePremiumReadinessScore(bps, {
      heroCharacterId: "hero-1",
      secondaryHeroCharacterId: "hero-2",
      deuteragonistCharacterId: null,
    });
    expect(penalized).toBeLessThan(base);
    expect(penalized).toBeGreaterThanOrEqual(0);
  });

  it("ne pénalise pas si le second lead apparaît dans characterVisualDna", () => {
    const bps = Array.from({ length: 10 }, (_, i) =>
      minimalBlueprint({
        panelIndex: i,
        subjectFocus: i === 0 ? "environment" : "hero",
        mustShowCharacterIds: i > 0 ? ["hero-1"] : [],
        characterVisualDna:
          i > 0
            ? [
                { characterId: "hero-1", hairColor: "noir" },
                ...(i === 3 ? [{ characterId: "hero-2", hairColor: "roux" }] : []),
              ]
            : [],
      }),
    );
    const base = computePremiumReadinessScore(bps);
    const withSecondary = computePremiumReadinessScore(bps, {
      secondaryHeroCharacterId: "hero-2",
    });
    expect(withSecondary).toBe(base);
  });

  it("accepte déuteragoniste seul (sans secondary) pour la pénalité", () => {
    const bps = Array.from({ length: 10 }, (_, i) =>
      minimalBlueprint({
        panelIndex: i,
        subjectFocus: i === 0 ? "environment" : "hero",
        mustShowCharacterIds: i > 0 ? ["hero-1"] : [],
      }),
    );
    const base = computePremiumReadinessScore(bps);
    const penalized = computePremiumReadinessScore(bps, {
      deuteragonistCharacterId: "deut-1",
    });
    expect(penalized).toBeLessThan(base);
  });
});
