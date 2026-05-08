/**
 * TEST-1 — Phase 4 hardening
 *
 * Garde-fous déterministes pour `repairProductionPlanContractualFocus` :
 *  - une violation `missing_prop_insert` doit convertir le 1er cutaway générique
 *    en `prop_insert` (subjectFocus="prop").
 *  - `missing_npc_population` → conversion en `group`.
 *  - `missing_environment` → conversion en `environment` + shotType="wide".
 *  - quand aucun cutaway générique n'est dispo, la réparation échoue (failed++).
 *  - quand plusieurs violations, chaque cutaway générique n'est utilisé qu'une fois.
 */
import { describe, it, expect } from "vitest";
import { repairProductionPlanContractualFocus } from "./repair-contractual-focus";
import type { PanelBlueprintPremium, SubjectFocus, CutawayType } from "../types/narrative-facts";

function makeBp(
  panelId: string,
  overrides: Partial<PanelBlueprintPremium> = {},
): PanelBlueprintPremium {
  return {
    panelId,
    beatId: "b1",
    panelNumber: 1,
    panelIndex: 0,
    purpose: "test",
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
    mustShowCharacterIds: ["c1"],
    requiredCharacterIds: ["c1"],
    ...overrides,
  };
}

describe("repairProductionPlanContractualFocus", () => {
  it("convertit le premier panel générique disponible en prop_insert (missing_prop_insert)", () => {
    // findFirstGenericCutaway considère tout panel cutawayType="environment"|"none"
    // dont le subjectFocus n'est pas déjà prop/enemy/group/npc — c'est-à-dire la
    // grande majorité des panels actor-driven (hero/duo/reaction…). Le 1er panel
    // disponible est donc consommé en priorité.
    const blueprints = [
      makeBp("p_hero_0", { subjectFocus: "prop", cutawayType: "prop_insert" }), // déjà prop → exclu
      makeBp("p_cutaway_1", { cutawayType: "environment" }), // 1er candidat
      makeBp("p_hero_2"),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_prop_insert", message: "no prop", severity: "blocking" },
    ]);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    const repaired = result.repaired[1]!;
    expect(repaired.subjectFocus).toBe("prop");
    expect(repaired.cutawayType).toBe("prop_insert");
    expect(repaired.heroCenterAllowed).toBe(false);
    expect(repaired.notes ?? []).toContain("repair:converted_to_prop_insert");
  });

  it("traite missing_weapon_insert comme un alias de missing_prop_insert", () => {
    const blueprints = [
      makeBp("p_npc_0", { subjectFocus: "npc", cutawayType: "npc_panel" }),
      makeBp("p_cutaway_1", { cutawayType: "environment" }),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_weapon_insert", message: "no weapon", severity: "blocking" },
    ]);
    expect(result.succeeded).toBe(1);
    expect(result.repaired[1]!.cutawayType).toBe("prop_insert");
  });

  it("convertit en npc panel quand missing_npc_population", () => {
    const blueprints = [
      makeBp("p_prop_0", { subjectFocus: "prop", cutawayType: "prop_insert" }), // exclu
      makeBp("p_cutaway_1", { cutawayType: "environment" }),
      makeBp("p_hero_2"),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_npc_population", message: "no npc", severity: "blocking" },
    ]);
    expect(result.succeeded).toBe(1);
    expect(result.repaired[1]!.subjectFocus).toBe("group");
    expect(result.repaired[1]!.notes ?? []).toContain("repair:converted_to_npc_panel");
  });

  it("convertit en environment + shotType=wide quand missing_environment", () => {
    const blueprints = [
      makeBp("p_prop_0", { subjectFocus: "prop", cutawayType: "prop_insert" }),
      makeBp("p_cutaway_1", { cutawayType: "none", shotType: "medium" }),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_environment", message: "no env", severity: "blocking" },
    ]);
    expect(result.succeeded).toBe(1);
    expect(result.repaired[1]!.subjectFocus).toBe("environment");
    expect(result.repaired[1]!.shotType).toBe("wide");
  });

  it("échoue silencieusement quand aucun panel candidat n'est disponible", () => {
    // Tous les panels sont déjà prop/enemy/group/npc → exclus de findFirstGenericCutaway
    const blueprints = [
      makeBp("p_prop_0", { cutawayType: "prop_insert", subjectFocus: "prop" }),
      makeBp("p_npc_1", { cutawayType: "npc_panel", subjectFocus: "npc" }),
      makeBp("p_enemy_2", { cutawayType: "none", subjectFocus: "enemy" }),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_prop_insert", message: "no prop", severity: "blocking" },
    ]);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("ne réutilise pas le même panel pour deux violations distinctes", () => {
    const blueprints = [
      makeBp("p_prop_0", { subjectFocus: "prop", cutawayType: "prop_insert" }),
      makeBp("p_cutaway_1", { cutawayType: "environment" }),
      makeBp("p_cutaway_2", { cutawayType: "environment" }),
    ];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_prop_insert", message: "p", severity: "blocking" },
      { type: "missing_npc_population", message: "n", severity: "blocking" },
    ]);
    expect(result.succeeded).toBe(2);
    expect(result.repaired[1]!.subjectFocus).toBe("prop");
    expect(result.repaired[2]!.subjectFocus).toBe("group");
  });

  it("ignore les violations non-bloquantes", () => {
    const blueprints = [makeBp("p_cutaway_0", { cutawayType: "environment" })];
    const result = repairProductionPlanContractualFocus(blueprints, [
      { type: "missing_prop_insert", message: "warn", severity: "warning" },
    ]);
    expect(result.attempted).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.repaired[0]!.subjectFocus).toBe("hero");
  });
});
