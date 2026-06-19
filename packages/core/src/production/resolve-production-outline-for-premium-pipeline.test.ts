import { describe, expect, it } from "vitest";
import { resolveProductionOutlineForPremiumPipeline } from "./resolve-production-outline-for-premium-pipeline";

const minimalProductionBeat = {
  beatId: "b1",
  summary: "Résumé beat assez long pour valider le schéma.",
  narrativeFunction: "progression",
  whyThisBeatExists: "Pour faire avancer l’intrigue.",
  dramaticChange: "Tension montante.",
  involvedCharacters: ["c1"],
  activeCanonConstraints: [] as string[],
  environmentContext: ["lieu"],
};

const minimalProductionOutline = {
  source: "generated" as const,
  chapterGoal: "Objectif de chapitre décrit sur au moins dix caractères.",
  cliffhanger: "Fin!",
  beats: [minimalProductionBeat],
};

const minimalApprovedOutline = {
  summary: "Résumé chapitre approuvé avec assez de texte.",
  cliffhanger: "oui",
  beats: [
    {
      id: "b1",
      summary: "Beat approuvé avec un résumé suffisamment long.",
      characters: ["c1"],
      location: "place",
      pageRole: "progression",
      turn: "tournant narratif du beat",
      emotionalDelta: 0,
    },
  ],
  approvedAt: "2026-01-01T00:00:00.000Z",
  approvalVersion: "v1",
  source: "user_approved" as const,
};

describe("resolveProductionOutlineForPremiumPipeline", () => {
  it("retourne null sans données exploitables", () => {
    expect(
      resolveProductionOutlineForPremiumPipeline({
        approvedOutlineRaw: null,
        productionPlanRaw: null,
      }),
    ).toBeNull();
  });

  it("priorise productionOutline embarqué dans le plan", () => {
    const embedded = {
      ...minimalProductionOutline,
      chapterGoal: "Depuis le plan persisté uniquement.",
    };
    const resolved = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: { ...minimalProductionOutline, chapterGoal: "Depuis approved seulement." },
      productionPlanRaw: { productionOutline: embedded, pageCount: 1 },
    });
    expect(resolved?.chapterGoal).toBe("Depuis le plan persisté uniquement.");
  });

  it("accepte un approvedOutline déjà au schéma production", () => {
    const resolved = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: minimalProductionOutline as Record<string, unknown>,
      productionPlanRaw: null,
    });
    expect(resolved?.beats[0]?.beatId).toBe("b1");
  });

  it("convertit un outline approuvé via le contrat legacy", () => {
    const resolved = resolveProductionOutlineForPremiumPipeline({
      approvedOutlineRaw: minimalApprovedOutline as Record<string, unknown>,
      chapterSummary: "Résumé chapitre court.",
      cliffhangerOverride: null,
    });
    expect(resolved?.source).toBe("legacy_adapted");
    expect(resolved?.chapterGoal).toBe("Résumé chapitre court.");
    expect(resolved?.beats[0]?.beatId).toBe("b1");
  });
});
