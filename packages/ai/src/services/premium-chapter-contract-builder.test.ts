import { describe, expect, it, afterEach } from "vitest";
import { buildPremiumChapterContract } from "./premium-chapter-contract-builder";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";

/**
 * FIX — densification déterministe pour respecter la range premium (70–75).
 * On n'autorise pas un contrat premium qui sort à 52 panels : la densité
 * doit être corrigée au moment de construire le plan (sans random).
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

  it("produit un nombre de blueprints dans la range premium 70–75", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
    });
    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(PREMIUM_PANEL_RANGE.min);
    expect(result.panelBlueprints.length).toBeLessThanOrEqual(PREMIUM_PANEL_RANGE.max);
  });

  it("respecte toujours la range premium, même si minimumPanels est hors range", () => {
    const result = buildPremiumChapterContract({
      approvedOutline: buildApprovedOutline(10),
      heroCharacterId: "hero_1",
      projectGenre: "action",
      projectTone: "dramatic",
      minimumPanels: 100,
    });
    expect(result.panelBlueprints.length).toBeGreaterThanOrEqual(PREMIUM_PANEL_RANGE.min);
    expect(result.panelBlueprints.length).toBeLessThanOrEqual(PREMIUM_PANEL_RANGE.max);
  });
});
