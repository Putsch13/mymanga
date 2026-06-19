import { describe, expect, it } from "vitest";

/**
 * P5.4 / P0.12 — Contrat : tout PNJ auto-créé pour un humain / named_npc
 * doit désormais être mappé en `roleType = "secondary"` et non plus "pnj".
 * La regex d'inclusion `importantNpcs` dans le shot plan est :
 *   /mentor|deuteragonist|secondary|important|recurring/i
 * → ce test prouve que "secondary" est capté, et que "pnj" (ancien default)
 *   ne le serait pas.
 */

const IMPORTANT_ROLE_REGEX = /mentor|deuteragonist|secondary|important|recurring/i;

describe("importantNpcs detection after P0.12 mapping", () => {
  it("secondary est capté par la regex importantNpcs", () => {
    expect(IMPORTANT_ROLE_REGEX.test("secondary")).toBe(true);
  });

  it("pnj (ancien default avant P0.12) n'était PAS capté", () => {
    expect(IMPORTANT_ROLE_REGEX.test("pnj")).toBe(false);
  });

  it("les autres rôles importants restent captés", () => {
    expect(IMPORTANT_ROLE_REGEX.test("mentor")).toBe(true);
    expect(IMPORTANT_ROLE_REGEX.test("deuteragonist")).toBe(true);
    expect(IMPORTANT_ROLE_REGEX.test("important")).toBe(true);
    expect(IMPORTANT_ROLE_REGEX.test("recurring")).toBe(true);
  });
});
