import { describe, expect, it } from "vitest";
import { inferPropOwnerCategory } from "./prop-owner-resolver";

const weaponTpl = {
  canonicalName: "rifle",
  category: "weapon",
  narrativeRole: "threat" as const,
  defaultVisibilityMode: "in_hand" as const,
};

const ambientTpl = {
  canonicalName: "debris",
  category: "set",
  narrativeRole: "worldbuilding" as const,
  defaultVisibilityMode: "background_support" as const,
};

describe("inferPropOwnerCategory", () => {
  it("retourne enemy quand le texte décrit l'ennemi qui utilise l'arme", () => {
    expect(
      inferPropOwnerCategory(
        weaponTpl,
        "L'ennemi tire avec son fusil sur le héros.",
        { universeType: null, heroCharacterId: "h1" },
        false,
      ),
    ).toBe("enemy");
  });

  it("retourne hero quand le héros utilise explicitement l'arme", () => {
    expect(
      inferPropOwnerCategory(
        weaponTpl,
        "Le héros brandit son épée face à la menace.",
        { universeType: null, heroCharacterId: "h1" },
        false,
      ),
    ).toBe("hero");
  });

  it("retourne ambient pour worldbuilding + background_support", () => {
    expect(
      inferPropOwnerCategory(
        ambientTpl,
        "La salle est vide.",
        { universeType: null, heroCharacterId: null },
        false,
      ),
    ).toBe("ambient");
  });

  it("retourne guard pour arme + mention de soldats", () => {
    expect(
      inferPropOwnerCategory(
        weaponTpl,
        "Les soldats alignent leurs fusils sur la ligne.",
        { universeType: "military", heroCharacterId: null },
        false,
      ),
    ).toBe("guard");
  });
});
