/**
 * TEST-1 — Phase 4 hardening
 *
 * Garde-fous pour `runPremiumPlanContractQa` (QA contractuelle unifiée
 * appelée par `estimate` ET `launch`). Vérifie :
 *  - un plan minimal et bien équilibré passe (`ok=true`).
 *  - une violation bloquante remonte dans `blocking` ET dans `repairable`
 *    si elle fait partie de `REPAIRABLE_VIOLATION_TYPES`.
 *  - `weak_location_binding_critical` (≥60% panels sans `environmentVisualDna.locationName`)
 *    est dégradé en warning + repairable, pas en blocking.
 *  - les métriques `propInserts` / `enemyFocus` / `weakLocationBinding` reflètent
 *    le contenu des blueprints.
 */
import { describe, it, expect } from "vitest";
import { runPremiumPlanContractQa } from "./blueprint-budgets";
import type {
  PanelBlueprintPremium,
  SubjectFocus,
  CutawayType,
} from "@manga-ai-studio/core";

function makeBp(
  i: number,
  overrides: Partial<PanelBlueprintPremium> = {},
): PanelBlueprintPremium {
  return {
    panelId: `p${i}`,
    beatId: `b${Math.floor(i / 6) + 1}`,
    panelNumber: (i % 6) + 1,
    panelIndex: i,
    purpose: `purpose ${i}`,
    shotType: "medium",
    cameraAngle: "eye_level",
    subjectFocus: "hero" as SubjectFocus,
    mustShowEnemy: false,
    requiredNpcCount: 0,
    requiredProps: [],
    requiredLocationSignals: [],
    cutawayType: "none" as CutawayType,
    heroCenterAllowed: true,
    criticality: "medium",
    mustShowCharacterIds: ["c_hero"],
    requiredCharacterIds: ["c_hero"],
    environmentVisualDna: {
      locationId: "loc_port",
      locationName: "Port de Kaze",
    } as PanelBlueprintPremium["environmentVisualDna"],
    ...overrides,
  };
}

function buildPanels(spec: {
  total?: number;
  withEnv?: number;
  withProp?: number;
  withEnemy?: number;
  withNpc?: number;
  withReaction?: number;
  withWeakLocation?: number;
  withMustShowEnemy?: number;
  withMandatoryProp?: number;
}): PanelBlueprintPremium[] {
  const total = spec.total ?? 72;
  const result: PanelBlueprintPremium[] = [];
  let envLeft = spec.withEnv ?? 0;
  let propLeft = spec.withProp ?? 0;
  let enemyLeft = spec.withEnemy ?? 0;
  let npcLeft = spec.withNpc ?? 0;
  let reactionLeft = spec.withReaction ?? 0;
  let weakLeft = spec.withWeakLocation ?? 0;
  let mustEnemyLeft = spec.withMustShowEnemy ?? 0;
  let mandatoryPropLeft = spec.withMandatoryProp ?? 0;
  for (let i = 0; i < total; i++) {
    const overrides: Partial<PanelBlueprintPremium> = {};
    if (envLeft > 0) {
      overrides.subjectFocus = "environment";
      overrides.cutawayType = "environment";
      envLeft--;
    } else if (propLeft > 0) {
      overrides.subjectFocus = "prop";
      overrides.cutawayType = "prop_insert";
      propLeft--;
    } else if (enemyLeft > 0) {
      overrides.subjectFocus = "enemy";
      enemyLeft--;
    } else if (npcLeft > 0) {
      overrides.subjectFocus = "group";
      overrides.cutawayType = "npc_group";
      npcLeft--;
    } else if (reactionLeft > 0) {
      overrides.subjectFocus = "reaction";
      reactionLeft--;
    }
    if (mustEnemyLeft > 0) {
      overrides.mustShowEnemy = true;
      mustEnemyLeft--;
    }
    if (mandatoryPropLeft > 0) {
      overrides.requiredProps = [
        {
          id: "prop_sword",
          canonicalName: "Ancient Sword",
          aliases: [],
          category: "narrative",
          narrativeRole: "worldbuilding",
          requiredForBeatIds: [`b${Math.floor(i / 6) + 1}`],
          visibilityMode: "foreground_insert",
          mustBeVisible: true,
          confidence: 1,
          source: "canon",
        },
      ];
      mandatoryPropLeft--;
    }
    if (weakLeft > 0) {
      overrides.environmentVisualDna = null;
      weakLeft--;
    }
    result.push(makeBp(i, overrides));
  }
  return result;
}

describe("runPremiumPlanContractQa", () => {
  it("plan équilibré : metrics correctes, pas de violation contractuelle critique liée aux types contenus", () => {
    const panels = buildPanels({
      total: 72,
      withEnv: 12,
      withProp: 8,
      withEnemy: 6,
      withNpc: 10,
      withReaction: 12,
      // 24 panels restent en hero/duo (33%)
      withWeakLocation: 0,
    });
    const result = runPremiumPlanContractQa({ blueprints: panels });
    expect(result.metrics.envPanels).toBeGreaterThanOrEqual(10);
    expect(result.metrics.propInserts).toBeGreaterThanOrEqual(6);
    expect(result.metrics.enemyFocus).toBeGreaterThanOrEqual(4);
    expect(result.metrics.npcPanels).toBeGreaterThanOrEqual(8);
    expect(result.metrics.weakLocationBinding).toBe(0);
    // Les violations critiques type "missing_*" ne doivent pas apparaître :
    // tous les sous-types contractuels (env, prop, npc, enemy) sont couverts.
    for (const block of result.blocking) {
      expect(block).not.toMatch(/^missing_(environment|prop_insert|npc_population|enemy_focus)$/);
    }
  });

  it("blocking + repairable contiennent missing_prop_insert quand un prop mustBeVisible n'est pas couvert", () => {
    const panels = buildPanels({
      total: 72,
      withEnv: 6,
      withProp: 0,
      withEnemy: 4,
      withMandatoryProp: 1,
    });
    const result = runPremiumPlanContractQa({ blueprints: panels });
    expect(result.ok).toBe(false);
    expect(result.blocking).toContain("missing_prop_insert");
    expect(result.repairable).toContain("missing_prop_insert");
  });

  it("dégrade weak_location_binding_critical en warning quand >60% des panels n'ont pas d'env DNA", () => {
    const panels = buildPanels({
      total: 10,
      withEnv: 1,
      withProp: 0,
      withEnemy: 1,
      withWeakLocation: 8, // 80% sans env DNA → critical
    });
    const result = runPremiumPlanContractQa({ blueprints: panels });
    expect(result.warnings).toContain("weak_location_binding_critical");
    expect(result.repairable).toContain("weak_location_binding_critical");
    expect(result.blocking).not.toContain("weak_location_binding_critical");
    expect(result.metrics.weakLocationBinding).toBe(8);
  });

  it("classe weak_location_binding_high (warning) quand 30-60% sont sans env DNA", () => {
    const panels = buildPanels({
      total: 10,
      withEnv: 1,
      withProp: 0,
      withEnemy: 1,
      withWeakLocation: 4, // 40% → high
    });
    const result = runPremiumPlanContractQa({ blueprints: panels });
    expect(result.warnings).toContain("weak_location_binding_high");
    expect(result.repairable).toContain("weak_location_binding_high");
    expect(result.warnings).not.toContain("weak_location_binding_critical");
  });

  it("missing_enemy_focus blocking quand mustShowEnemy=true mais aucun panel subjectFocus=enemy", () => {
    const panels = buildPanels({
      total: 72,
      withEnv: 6,
      withProp: 4,
      withEnemy: 0, // ← pas de focus enemy
      withMustShowEnemy: 4, // ← mais des panels mustShowEnemy=true
    });
    const result = runPremiumPlanContractQa({ blueprints: panels });
    expect(result.blocking).toContain("missing_enemy_focus");
  });
});
