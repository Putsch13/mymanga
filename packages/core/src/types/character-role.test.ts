import { describe, expect, it } from "vitest";
import {
  CHARACTER_ROLE_CANONICAL,
  canonicalizeCharacterRoleType,
  isAntagonistRole,
  isHeroRole,
  isNpcRole,
  isSecondaryHeroRole,
  isSupportingRole,
  normalizeCharacterRoleType,
} from "./character-role";

/**
 * P2.1 — tests du normaliseur roleType.
 */

describe("normalizeCharacterRoleType (P2.1)", () => {
  it("accepte les valeurs canoniques sans alteration", () => {
    for (const value of Object.values(CHARACTER_ROLE_CANONICAL)) {
      const n = normalizeCharacterRoleType(value);
      expect(n.role).toBe(value);
      expect(n.confidence).toBe("canonical");
    }
  });

  it("reconnait les variantes hero (main_hero / protagonist / MAIN_CHARACTER)", () => {
    for (const alias of ["main_hero", "protagonist", "MAIN_CHARACTER", "main-hero", "main"]) {
      const n = normalizeCharacterRoleType(alias);
      expect(n.role).toBe("hero");
      expect(n.confidence).toBe("aliased");
    }
  });

  it("reconnait les variantes antagonist (villain / enemy / boss)", () => {
    for (const alias of ["villain", "enemy", "boss", "ANTAGONIST"]) {
      const n = normalizeCharacterRoleType(alias);
      expect(n.role).toBe("antagonist");
    }
  });

  it("distingue rival d'antagonist", () => {
    expect(canonicalizeCharacterRoleType("rival")).toBe("rival");
    expect(canonicalizeCharacterRoleType("antagonist")).toBe("antagonist");
  });

  it("mappe pnj / npc / recurring_npc correctement", () => {
    expect(canonicalizeCharacterRoleType("pnj")).toBe("npc");
    expect(canonicalizeCharacterRoleType("NPC")).toBe("npc");
    expect(canonicalizeCharacterRoleType("recurring_npc")).toBe("recurring_npc");
    expect(canonicalizeCharacterRoleType("recurring")).toBe("recurring_npc");
  });

  it("mappe support/secondary/ally dans leurs familles", () => {
    expect(canonicalizeCharacterRoleType("SECONDARY_CORE")).toBe("secondary");
    expect(canonicalizeCharacterRoleType("companion")).toBe("ally");
    expect(canonicalizeCharacterRoleType("important_supporting_character")).toBe(
      "support",
    );
  });

  it("retourne unknown + fallback pour valeur inconnue ou vide", () => {
    const n1 = normalizeCharacterRoleType("foo_bar_baz");
    expect(n1.role).toBe("unknown");
    expect(n1.confidence).toBe("fallback");
    expect(n1.raw).toBe("foo_bar_baz");

    const n2 = normalizeCharacterRoleType(null);
    expect(n2.role).toBe("unknown");
    expect(n2.confidence).toBe("fallback");
    expect(n2.raw).toBeNull();
  });

  it("les predicats (isHero/isAntagonist/isSupporting/isNpc) sont coherents", () => {
    expect(isHeroRole("MAIN_CHARACTER")).toBe(true);
    expect(isHeroRole("villain")).toBe(false);
    expect(isAntagonistRole("boss")).toBe(true);
    expect(isSupportingRole("support")).toBe(true);
    expect(isSupportingRole("SECONDARY_CORE")).toBe(true);
    expect(isSupportingRole("ally")).toBe(true);
    expect(isSupportingRole("hero")).toBe(false);
    expect(isNpcRole("pnj")).toBe(true);
    expect(isNpcRole("recurring_npc")).toBe(true);
    expect(isNpcRole("hero")).toBe(false);
    expect(isSecondaryHeroRole("deuteragonist")).toBe(true);
    expect(isSecondaryHeroRole("hero_2")).toBe(true);
    expect(isSecondaryHeroRole("secondary")).toBe(true);
    expect(isSecondaryHeroRole("MAIN_CHARACTER")).toBe(false);
  });
});
