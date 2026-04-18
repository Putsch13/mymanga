/**
 * P6.6 — Routing de l'auto-réparation premium.
 *
 * Un type d'issue doit être routé vers le bon `PremiumRepairMode` pour que
 * l'orchestrateur de retry sache comment traiter le panel cassé.
 */
import { describe, expect, it } from "vitest";
import {
  PREMIUM_BREACH_TYPES,
  classifyPremiumBreach,
  planPremiumRepair,
} from "@/lib/retry/classify-premium-repair";

describe("classifyPremiumBreach", () => {
  it("route missing_weapon vers prop", () => {
    expect(classifyPremiumBreach("missing_weapon")).toBe("prop");
    expect(classifyPremiumBreach("missing_device")).toBe("prop");
    expect(classifyPremiumBreach("missing_prop")).toBe("prop");
    expect(classifyPremiumBreach("object_used_but_not_visible")).toBe("prop");
  });

  it("route wrong_subject_focus vers subject_focus", () => {
    expect(classifyPremiumBreach("wrong_subject_focus")).toBe("subject_focus");
  });

  it("route cutaway_not_respected / wrong_cutaway_target / cutaway_collapsed_to_hero vers cutaway", () => {
    expect(classifyPremiumBreach("cutaway_not_respected")).toBe("cutaway");
    expect(classifyPremiumBreach("cutaway_collapsed_to_hero")).toBe("cutaway");
    expect(classifyPremiumBreach("wrong_cutaway_target")).toBe("cutaway");
  });

  it("route npc_population_missing vers npc_population", () => {
    expect(classifyPremiumBreach("npc_population_missing")).toBe("npc_population");
  });

  it("route missing_enemy_presence vers enemy_presence", () => {
    expect(classifyPremiumBreach("missing_enemy_presence")).toBe("enemy_presence");
  });

  it("route missing_dialogue_anchor vers speaker", () => {
    expect(classifyPremiumBreach("missing_dialogue_anchor")).toBe("speaker");
  });

  it("route missing_environment_establishing vers environment", () => {
    expect(classifyPremiumBreach("missing_environment_establishing")).toBe("environment");
  });

  it("traite tous les PREMIUM_BREACH_TYPES sans panic (exhaustive switch)", () => {
    for (const t of PREMIUM_BREACH_TYPES) {
      expect(typeof classifyPremiumBreach(t)).toBe("string");
    }
  });
});

describe("planPremiumRepair", () => {
  it("priorise 'prop' quand il coexiste avec d'autres breaches", () => {
    const plan = planPremiumRepair({
      breachTypes: ["wrong_subject_focus", "missing_weapon", "cutaway_not_respected"],
      contractualCritical: true,
    });
    expect(plan.primary).toBe("prop");
    expect(plan.modes).toContain("prop");
    expect(plan.modes).toContain("subject_focus");
    expect(plan.modes).toContain("cutaway");
    expect(plan.contractualCritical).toBe(true);
  });

  it("retourne primary=null si aucun breach premium reconnu", () => {
    const plan = planPremiumRepair({
      breachTypes: ["unknown_random_type"],
      contractualCritical: false,
    });
    expect(plan.primary).toBeNull();
    expect(plan.modes).toEqual([]);
  });

  it("gère un seul breach", () => {
    const plan = planPremiumRepair({
      breachTypes: ["npc_population_missing"],
      contractualCritical: false,
    });
    expect(plan.primary).toBe("npc_population");
    expect(plan.modes).toEqual(["npc_population"]);
  });
});
