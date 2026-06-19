/**
 * P3.1 (partiel) — Tests de non-régression pour les helpers purs
 * extraits de narrative-pass.ts.
 */

import { describe, it, expect } from "vitest";
import {
  partitionNpcsByPolicy,
  computeDefaultForbiddenDrift,
  mapEntityKindToRoleType,
  slugifyNpcName,
} from "../src/passes/narrative/npc-auto-promotion";

describe("partitionNpcsByPolicy", () => {
  it("promeut tous les PNJ sans registry (legacy path)", () => {
    const { toPromote, toSkip } = partitionNpcsByPolicy({
      bundleCharNames: new Set(["Alice", "Bob"]),
      promotedNames: new Set(),
      temporaryNames: new Set(),
      hasEntityRegistry: false,
    });
    expect(toPromote).toEqual(["Alice", "Bob"]);
    expect(toSkip).toEqual([]);
  });

  it("skip les PNJ non-promoted quand un registry existe", () => {
    const { toPromote, toSkip } = partitionNpcsByPolicy({
      bundleCharNames: new Set(["Alice", "Passant"]),
      promotedNames: new Set(["alice"]),
      temporaryNames: new Set(),
      hasEntityRegistry: true,
    });
    expect(toPromote).toEqual(["Alice"]);
    expect(toSkip).toEqual(["Passant"]);
  });

  it("skip explicitement les temporary/backgroundExtras", () => {
    const { toPromote, toSkip } = partitionNpcsByPolicy({
      bundleCharNames: new Set(["Alice", "Foule"]),
      promotedNames: new Set(["alice"]),
      temporaryNames: new Set(["foule"]),
      hasEntityRegistry: false,
    });
    expect(toPromote).toEqual(["Alice"]);
    expect(toSkip).toEqual(["Foule"]);
  });
});

describe("computeDefaultForbiddenDrift", () => {
  it("humain / null → []", () => {
    expect(computeDefaultForbiddenDrift("human")).toEqual([]);
    expect(computeDefaultForbiddenDrift(null)).toEqual([]);
    expect(computeDefaultForbiddenDrift(undefined)).toEqual([]);
  });

  it("dragon → interdit face humaine + mains humaines + vêtements modernes", () => {
    const drift = computeDefaultForbiddenDrift("dragon");
    expect(drift).toContain("human face");
    expect(drift).toContain("human hands");
    expect(drift).toContain("modern clothing");
  });

  it("spirit/ghost → interdit corps solide + ombre ordinaire", () => {
    const drift = computeDefaultForbiddenDrift("spirit");
    expect(drift).toContain("solid body material");
  });

  it("robot → interdit peau organique + cheveux naturels", () => {
    const drift = computeDefaultForbiddenDrift("robot");
    expect(drift).toContain("organic skin");
    expect(drift).toContain("natural hair");
  });
});

describe("mapEntityKindToRoleType", () => {
  it("human / named_npc → secondary (pour regex importantNpcs)", () => {
    expect(mapEntityKindToRoleType("human")).toBe("secondary");
    expect(mapEntityKindToRoleType("named_npc")).toBe("secondary");
  });

  it("autre kind → pass-through", () => {
    expect(mapEntityKindToRoleType("dragon")).toBe("dragon");
    expect(mapEntityKindToRoleType("robot")).toBe("robot");
  });

  it("null / undefined → pnj fallback", () => {
    expect(mapEntityKindToRoleType(null)).toBe("pnj");
    expect(mapEntityKindToRoleType(undefined)).toBe("pnj");
  });
});

describe("slugifyNpcName", () => {
  it("ASCII + normalise accents + strip chars spéciaux", () => {
    expect(slugifyNpcName("Éléonore")).toBe("eleonore");
    expect(slugifyNpcName("  Bob  L'éponge ")).toBe("bob-l-eponge");
  });

  it("coupe à 60 caractères", () => {
    const long = "a".repeat(120);
    expect(slugifyNpcName(long).length).toBeLessThanOrEqual(60);
  });
});
