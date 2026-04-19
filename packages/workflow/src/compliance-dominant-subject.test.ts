/**
 * P0.4 (sprint 5) — Mapping canonique du `dominantSubject` pour shot
 * compliance. Aucun biais héros ne doit apparaître hors cas explicite.
 */
import { describe, it, expect } from "vitest";
import { mapCanonicalToComplianceDominantSubject } from "./compliance-dominant-subject";

describe("mapCanonicalToComplianceDominantSubject (P0.4)", () => {
  it("hero → hero", () => {
    expect(mapCanonicalToComplianceDominantSubject("hero", null)).toBe("hero");
  });

  it("enemy → enemy même si blueprintFocus=hero (le canon prime)", () => {
    expect(mapCanonicalToComplianceDominantSubject("enemy", "hero")).toBe("enemy");
  });

  it("ally/npc → npc", () => {
    expect(mapCanonicalToComplianceDominantSubject("ally", null)).toBe("npc");
    expect(mapCanonicalToComplianceDominantSubject("npc", null)).toBe("npc");
  });

  it("environment/aftermath → environment", () => {
    expect(mapCanonicalToComplianceDominantSubject("environment", null)).toBe("environment");
    expect(mapCanonicalToComplianceDominantSubject("aftermath", null)).toBe("environment");
  });

  it("prop/reaction/group sont préservés", () => {
    expect(mapCanonicalToComplianceDominantSubject("prop", null)).toBe("prop");
    expect(mapCanonicalToComplianceDominantSubject("reaction", null)).toBe("reaction");
    expect(mapCanonicalToComplianceDominantSubject("group", null)).toBe("group");
  });

  it("un retry sur panel environment ne devient jamais hero", () => {
    expect(mapCanonicalToComplianceDominantSubject("environment", "environment")).toBe("environment");
    expect(mapCanonicalToComplianceDominantSubject("environment", "hero")).toBe("environment");
  });

  it("un retry sur panel prop ne devient jamais hero", () => {
    expect(mapCanonicalToComplianceDominantSubject("prop", "prop")).toBe("prop");
    expect(mapCanonicalToComplianceDominantSubject("prop", "hero")).toBe("prop");
  });

  it("un retry sur panel reaction ne devient jamais hero", () => {
    expect(mapCanonicalToComplianceDominantSubject("reaction", "reaction")).toBe("reaction");
  });

  it("un retry sur panel enemy ne devient jamais hero", () => {
    expect(mapCanonicalToComplianceDominantSubject("enemy", "enemy")).toBe("enemy");
    expect(mapCanonicalToComplianceDominantSubject("enemy", null)).toBe("enemy");
  });

  it("kind=none + blueprintFocus=hero → hero (fallback explicite blueprint)", () => {
    expect(mapCanonicalToComplianceDominantSubject("none", "hero")).toBe("hero");
  });

  it("kind=none + blueprintFocus=null → unknown (PAS de biais hero)", () => {
    expect(mapCanonicalToComplianceDominantSubject("none", null)).toBe("unknown");
  });

  it("kind=none + blueprintFocus inconnu → unknown (PAS de biais hero)", () => {
    expect(mapCanonicalToComplianceDominantSubject("none", "some_unknown_focus")).toBe("unknown");
  });
});
