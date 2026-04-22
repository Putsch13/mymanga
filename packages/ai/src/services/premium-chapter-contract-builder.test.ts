import { describe, expect, it, afterEach } from "vitest";
import { buildPremiumChapterContract } from "./premium-chapter-contract-builder";

/**
 * H2 — padding désactivé pour le chemin premium. Le builder doit
 * désormais fail quand le nombre de blueprints nativement produits
 * reste sous le minimum demandé. Les tests vérifient que :
 *   - sans le flag legacy, le builder throw
 *   - avec `MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true` (uniquement
 *     pour debug/tests), l'ancien comportement est toujours accessible
 */

function buildApprovedOutline(beatCount: number) {
  return {
    chapterId: "chap_test",
    title: "Test chapter",
    summary: "Un chapitre de test avec plusieurs beats.",
    cliffhanger: "",
    approvalVersion: "v1",
    approvedAt: new Date().toISOString(),
    beats: Array.from({ length: beatCount }, (_, i) => ({
      id: `beat_${i + 1}`,
      order: i + 1,
      pageRole: "escalation" as const,
      summary: `Beat ${i + 1} : un événement narratif distinct se produit.`,
      turn: "le héros avance dans son arc",
      location: "village",
      characters: ["hero_1"],
    })),
  } as unknown as Parameters<typeof buildPremiumChapterContract>[0]["approvedOutline"];
}

describe("buildPremiumChapterContract — H2 padding interdit", () => {
  afterEach(() => {
    delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
  });

  it("THROW quand raw blueprints < minimum (défaut 75) sans flag legacy", () => {
    expect(() =>
      buildPremiumChapterContract({
        approvedOutline: buildApprovedOutline(10),
        heroCharacterId: "hero_1",
        projectGenre: "action",
        projectTone: "dramatic",
      }),
    ).toThrow(/premium_raw_panels_under_target/);
  });

  it("THROW aussi quand on demande un minimum supérieur et raw < minimum", () => {
    expect(() =>
      buildPremiumChapterContract({
        approvedOutline: buildApprovedOutline(10),
        heroCharacterId: "hero_1",
        projectGenre: "action",
        projectTone: "dramatic",
        minimumPanels: 100,
      }),
    ).toThrow(/premium_raw_panels_under_target/);
  });

  it("autorise le padding UNIQUEMENT via MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY=true", () => {
    process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY = "true";
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
    });
    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(75);
  });
});
