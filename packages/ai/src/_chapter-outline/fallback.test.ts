/**
 * TODO-20 (MAJEUR) — Tests du fallback outline.
 *
 * Le fallback déterministe doit s'ancrer sur l'IntentNarrativeContract
 * dérivé de l'intention utilisateur quand celle-ci est suffisamment
 * riche, plutôt que de recracher des beats génériques type
 * "confrontation / alliances".
 *
 * Histoire-cible : "Lux et lui découvrent un temple dans la jungle"
 * doit produire un fallback dont au moins un beat parle du temple
 * (ou de la jungle), et pas seulement de "tension" générique.
 */
import { describe, expect, it } from "vitest";
import { fallbackOutline } from "./fallback";
import type { ChapterOutlineContext } from "./schema";

const baseContext = (overrides: Partial<ChapterOutlineContext> = {}): ChapterOutlineContext => ({
  projectTitle: "Lux et lui",
  pitch: null,
  primaryGenre: "aventure",
  cast: [
    { name: "Lux", roleType: "hero" },
    { name: "Kai", roleType: "secondary_hero" },
  ],
  knownLocations: [
    { name: "temple" },
    { name: "jungle" },
  ],
  chapterNumber: 1,
  chapterTitle: null,
  userIntent: "",
  quickTag: "bold",
  previousSummary: null,
  previousCliffhanger: null,
  ...overrides,
});

describe("TODO-20 fallbackOutline ancré sur l'IntentNarrativeContract", () => {
  it("ancre les beats sur les events extraits de l'intention quand elle est riche", () => {
    const ctx = baseContext({
      userIntent:
        "Lux et lui découvrent un temple dans la jungle. Ils trouvent un artefact ancien. Une voix les met en garde.",
    });
    const result = fallbackOutline(ctx);

    expect(result.beats.length).toBeGreaterThanOrEqual(3);

    const allText = result.beats.map((b) => b.summary.toLowerCase()).join(" | ");
    expect(allText).toMatch(/temple|jungle|artefact|voix/);

    const allLocations = result.beats.map((b) => b.location.toLowerCase()).join(" | ");
    expect(allLocations).toMatch(/temple|jungle/);
  });

  it("retombe sur les beats de genre quand l'intention est trop courte/vide", () => {
    const ctx = baseContext({ userIntent: "" });
    const result = fallbackOutline(ctx);

    expect(result.beats.length).toBeGreaterThanOrEqual(3);
    const all = result.beats.map((b) => b.summary).join(" | ");
    expect(all.length).toBeGreaterThan(0);
  });

  it("la table de hints reconnaît temple, mer, école (TODO-20)", () => {
    for (const [needle, expectedSubstr] of [
      ["temple ancien partiellement envahi", "temple"],
      ["océan ouvert sous un ciel changeant", "océan"],
      ["école calme aux couloirs déserts", "école"],
    ] as const) {
      const ctx = baseContext({ userIntent: `Une scène se déroule au ${expectedSubstr}.` });
      const result = fallbackOutline(ctx);
      const locs = result.beats.map((b) => b.location).join(" | ");
      expect(locs).toContain(needle.split(" ")[0]!);
    }
  });
});
