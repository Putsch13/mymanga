import { describe, expect, it } from "vitest";
import { buildPremiumChapterContract } from "./premium-chapter-contract-builder";

/**
 * P2.1 — le builder premium doit respecter le `minimumImages` réel du
 * chapitre (remonté via `input.minimumPanels`) au lieu d'un 75 figé. C'est
 * la cause racine du bug "52 blueprints pour 75 minimum" quand certains
 * chapitres ont un `minimumImages` supérieur à 75.
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

describe("buildPremiumChapterContract — P2.1 minimumPanels", () => {
  it("respecte la valeur par défaut 75 quand minimumPanels n'est pas fourni", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
    });

    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(75);
  });

  it("étend les blueprints jusqu'à `minimumPanels` quand supérieur au défaut", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
      minimumPanels: 100,
    });

    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(100);
  });

  it("ignore une valeur invalide (0 ou négative) et tombe sur le défaut 75", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
      minimumPanels: 0,
    });

    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(75);
  });
});
