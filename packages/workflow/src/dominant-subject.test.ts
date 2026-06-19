/**
 * P1.3 — Tests de `resolveDominantSubject`.
 *
 * Le sujet dominant doit refléter l'intention du blueprint (subjectFocus /
 * cutawayType) et, à défaut, déduire depuis le cast SANS biais héros.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDominantSubject,
  isNonHeroCharacterDominant,
  isNonCharacterDominant,
  isAnonymousGroupDominant,
  shouldExcludeHeroFromComposition,
} from "./dominant-subject";

describe("resolveDominantSubject — priorité cutawayType", () => {
  it("cutawayType environment_establishing → kind=environment", () => {
    const d = resolveDominantSubject({
      subjectFocus: "hero",
      cutawayType: "environment_establishing",
      shotType: "wide",
      panelCharacterRoles: ["hero", "antagonist"],
    });
    expect(d.kind).toBe("environment");
    expect(d.characterIndex).toBeNull();
    expect(d.provenance).toBe("explicit");
  });

  it("cutawayType prop_insert → kind=prop", () => {
    const d = resolveDominantSubject({
      subjectFocus: "hero",
      cutawayType: "prop_insert",
      shotType: "closeup",
    });
    expect(d.kind).toBe("prop");
    expect(d.characterIndex).toBeNull();
  });

  it("cutawayType aftermath → kind=aftermath", () => {
    const d = resolveDominantSubject({
      cutawayType: "aftermath",
      shotType: "medium",
    });
    expect(d.kind).toBe("aftermath");
  });
});

describe("resolveDominantSubject — subjectFocus explicite", () => {
  it("hero → kind=hero et pointe le bon index de perso", () => {
    const d = resolveDominantSubject({
      subjectFocus: "hero",
      shotType: "closeup",
      panelCharacterRoles: ["antagonist", "hero", "npc"],
      panelCharacterImportanceTiers: ["SECONDARY_CORE", "MAIN_HERO", "RECURRING_NPC"],
    });
    expect(d.kind).toBe("hero");
    expect(d.characterIndex).toBe(1);
    expect(d.characterTier).toBe("MAIN_HERO");
  });

  it("enemy → kind=enemy et pointe l'antagoniste", () => {
    const d = resolveDominantSubject({
      subjectFocus: "antagonist",
      shotType: "closeup",
      panelCharacterRoles: ["hero", "antagonist"],
      panelCharacterImportanceTiers: ["MAIN_HERO", "IMPORTANT_SUPPORTING_CHARACTER"],
    });
    expect(d.kind).toBe("enemy");
    expect(d.characterIndex).toBe(1);
    expect(d.characterTier).toBe("IMPORTANT_SUPPORTING_CHARACTER");
  });

  it("important_npc → kind=npc et pointe un perso non-hero non-enemy", () => {
    const d = resolveDominantSubject({
      subjectFocus: "important_npc",
      shotType: "closeup",
      panelCharacterRoles: ["hero", "mentor"],
      panelCharacterImportanceTiers: ["MAIN_HERO", "IMPORTANT_SUPPORTING_CHARACTER"],
    });
    expect(d.kind).toBe("npc");
    expect(d.characterIndex).toBe(1);
  });

  it("reaction → cible un non-hero en priorité", () => {
    const d = resolveDominantSubject({
      subjectFocus: "reaction",
      shotType: "closeup",
      panelCharacterRoles: ["hero", "villain"],
    });
    expect(d.kind).toBe("reaction");
    expect(d.characterIndex).toBe(1);
  });

  it("group → pas de character lock même si des persos sont présents", () => {
    const d = resolveDominantSubject({
      subjectFocus: "group",
      shotType: "wide",
      panelCharacterRoles: ["hero", "ally", "npc"],
    });
    expect(d.kind).toBe("group");
    expect(d.characterIndex).toBeNull();
  });

  it("environment → pas de perso, même si le cast contient le hero", () => {
    const d = resolveDominantSubject({
      subjectFocus: "environment",
      shotType: "wide",
      panelCharacterRoles: ["hero"],
    });
    expect(d.kind).toBe("environment");
    expect(d.characterIndex).toBeNull();
  });
});

describe("resolveDominantSubject — fallback inféré (sans subjectFocus)", () => {
  it("0 perso + wide → environment", () => {
    const d = resolveDominantSubject({
      shotType: "wide",
      panelCharacterRoles: [],
    });
    expect(d.kind).toBe("environment");
    expect(d.provenance).toBe("inferred");
  });

  it("1 perso hero → kind=hero", () => {
    const d = resolveDominantSubject({
      shotType: "closeup",
      panelCharacterRoles: ["hero"],
    });
    expect(d.kind).toBe("hero");
    expect(d.characterIndex).toBe(0);
    expect(d.provenance).toBe("inferred");
  });

  it("1 perso ennemi (pas le hero) → kind=enemy, PAS de fallback hero", () => {
    const d = resolveDominantSubject({
      shotType: "closeup",
      panelCharacterRoles: ["antagonist"],
      panelCharacterImportanceTiers: ["IMPORTANT_SUPPORTING_CHARACTER"],
    });
    expect(d.kind).toBe("enemy");
    expect(d.characterIndex).toBe(0);
  });

  it("1 perso npc → kind=npc", () => {
    const d = resolveDominantSubject({
      shotType: "medium",
      panelCharacterRoles: ["garde"],
    });
    expect(d.kind).toBe("npc");
  });

  it("2+ persos sans focus → group (pas de biais hero)", () => {
    const d = resolveDominantSubject({
      shotType: "medium",
      panelCharacterRoles: ["hero", "ally"],
    });
    expect(d.kind).toBe("group");
    expect(d.characterIndex).toBeNull();
  });

  it("aucun cast, pas de shot wide → none", () => {
    const d = resolveDominantSubject({
      shotType: "closeup",
      panelCharacterRoles: [],
    });
    expect(d.kind).toBe("none");
    expect(d.provenance).toBe("default");
  });
});

describe("resolveDominantSubject — helpers", () => {
  it("isNonHeroCharacterDominant détecte un NPC/ennemi dominant", () => {
    const ennemi = resolveDominantSubject({
      subjectFocus: "enemy",
      panelCharacterRoles: ["hero", "villain"],
    });
    expect(isNonHeroCharacterDominant(ennemi)).toBe(true);

    const hero = resolveDominantSubject({
      subjectFocus: "hero",
      panelCharacterRoles: ["hero"],
    });
    expect(isNonHeroCharacterDominant(hero)).toBe(false);
  });

  it("isNonCharacterDominant détecte un decor / prop / group", () => {
    const env = resolveDominantSubject({
      subjectFocus: "environment",
      shotType: "wide",
    });
    expect(isNonCharacterDominant(env)).toBe(true);

    const hero = resolveDominantSubject({
      subjectFocus: "hero",
      panelCharacterRoles: ["hero"],
    });
    expect(isNonCharacterDominant(hero)).toBe(false);
  });
});

describe("P3.1 — catégories guard_focus/soldier_group", () => {
  describe("cutawayType guard/soldier/crowd (using canonical values)", () => {
    it("cutawayType npc_group → kind=guard_group", () => {
      const d = resolveDominantSubject({
        cutawayType: "npc_group",
        shotType: "medium",
        panelCharacterRoles: ["hero"],
      });
      expect(d.kind).toBe("guard_group");
      expect(d.characterIndex).toBeNull();
      expect(d.provenance).toBe("explicit");
    });

    it("cutawayType surveillance → kind=guard_group", () => {
      const d = resolveDominantSubject({
        cutawayType: "surveillance",
        shotType: "wide",
      });
      expect(d.kind).toBe("guard_group");
    });

    it("cutawayType crowd → kind=crowd", () => {
      const d = resolveDominantSubject({
        cutawayType: "crowd",
        shotType: "wide",
      });
      expect(d.kind).toBe("crowd");
    });

    it("cutawayType reaction → kind=reaction", () => {
      const d = resolveDominantSubject({
        cutawayType: "reaction",
        shotType: "closeup",
      });
      expect(d.kind).toBe("reaction");
    });

    it("cutawayType reaction_insert → kind=reaction", () => {
      const d = resolveDominantSubject({
        cutawayType: "reaction_insert",
        shotType: "closeup",
      });
      expect(d.kind).toBe("reaction");
    });
  });

  describe("subjectFocus group maps to group kind (guards/soldiers/crowd normalized)", () => {
    it("subjectFocus group → kind=group", () => {
      const d = resolveDominantSubject({
        subjectFocus: "group",
        shotType: "medium",
      });
      expect(d.kind).toBe("group");
    });

    it("subjectFocus duo → kind=group", () => {
      const d = resolveDominantSubject({
        subjectFocus: "duo",
        shotType: "medium",
      });
      expect(d.kind).toBe("group");
    });
  });

  describe("helper functions P3.1", () => {
    it("isAnonymousGroupDominant détecte guard_group via npc_group cutaway", () => {
      const d = resolveDominantSubject({
        cutawayType: "npc_group",
      });
      expect(isAnonymousGroupDominant(d)).toBe(true);
    });

    it("isAnonymousGroupDominant détecte guard_group via surveillance cutaway", () => {
      const d = resolveDominantSubject({
        cutawayType: "surveillance",
      });
      expect(isAnonymousGroupDominant(d)).toBe(true);
    });

    it("isAnonymousGroupDominant détecte crowd", () => {
      const d = resolveDominantSubject({
        cutawayType: "crowd",
      });
      expect(isAnonymousGroupDominant(d)).toBe(true);
    });

    it("isAnonymousGroupDominant renvoie false pour hero", () => {
      const d = resolveDominantSubject({
        subjectFocus: "hero",
        panelCharacterRoles: ["hero"],
      });
      expect(isAnonymousGroupDominant(d)).toBe(false);
    });

    it("shouldExcludeHeroFromComposition pour guard_group", () => {
      const d = resolveDominantSubject({
        cutawayType: "npc_group",
      });
      expect(shouldExcludeHeroFromComposition(d)).toBe(true);
    });

    it("shouldExcludeHeroFromComposition pour environment", () => {
      const d = resolveDominantSubject({
        subjectFocus: "environment",
      });
      expect(shouldExcludeHeroFromComposition(d)).toBe(true);
    });

    it("shouldExcludeHeroFromComposition pour crowd", () => {
      const d = resolveDominantSubject({
        cutawayType: "crowd",
      });
      expect(shouldExcludeHeroFromComposition(d)).toBe(true);
    });

    it("shouldExcludeHeroFromComposition renvoie false pour hero", () => {
      const d = resolveDominantSubject({
        subjectFocus: "hero",
        panelCharacterRoles: ["hero"],
      });
      expect(shouldExcludeHeroFromComposition(d)).toBe(false);
    });

    it("isNonCharacterDominant inclut guard_group et crowd", () => {
      const guard = resolveDominantSubject({ cutawayType: "npc_group" });
      expect(isNonCharacterDominant(guard)).toBe(true);

      const surveillance = resolveDominantSubject({ cutawayType: "surveillance" });
      expect(isNonCharacterDominant(surveillance)).toBe(true);

      const crowd = resolveDominantSubject({ cutawayType: "crowd" });
      expect(isNonCharacterDominant(crowd)).toBe(true);
    });
  });
});
