import { describe, expect, it, afterEach } from "vitest";
import { buildPremiumChapterContract } from "./premium-chapter-contract-builder";

/**
 * P1 — padding désactivé pour le chemin premium (new v3 truth).
 * Le builder ne throw plus ; il renvoie désormais les blueprints nativement
 * produits par l'éditeur. C'est la route `/estimate` et le contrat
 * `apps/web/lib/premium-chapter-contract.ts` qui sont responsables de
 * refuser le chapitre si le count natif est hors range (70–75). Ici on
 * vérifie simplement que le builder ne gonfle plus artificiellement le
 * nombre de panels.
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

describe("buildPremiumChapterContract — P1 pas de padding", () => {
  afterEach(() => {
    delete process.env.MANGA_ALLOW_BLUEPRINT_EXPANSION_LEGACY;
  });

  it("renvoie les blueprints nativement produits (pas d'expansion legacy)", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
    });
    // 10 beats → en général ~30-60 blueprints natifs (sans padding).
    // Le contrat ne doit plus dépasser 75 ou être padded à 75.
    expect(result.panelBlueprints.length).toBeGreaterThan(0);
    expect(result.panelBlueprints.length).toBeLessThan(75);
  });

  it("ne padde pas vers minimumPanels même si fourni", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
      minimumPanels: 100,
    });
    expect(result.panelBlueprints.length).toBeLessThan(100);
  });
});
