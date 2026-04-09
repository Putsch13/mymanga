import { describe, expect, it, vi } from "vitest";
import { generateChapterOutline } from "./chapter-outline";

describe("generateChapterOutline", () => {
  it("retourne des beats structurés même en fallback heuristique", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await generateChapterOutline({
      projectTitle: "Luna",
      pitch: "Une héroïne se réfugie dans son monde imaginaire sous stress.",
      primaryGenre: "fantasy",
      tone: "émotionnel",
      chapterNumber: 3,
      chapterTitle: "La fuite intérieure",
      userIntent:
        "Luna subit une situation stressante, ferme les yeux puis rejoint son monde imaginaire où une créature confidente lui répond.",
      quickTag: "bold",
      previousSummary: "Luna a fui une dispute qu'elle n'arrivait plus à encaisser.",
      previousCliffhanger: "Quelque chose l'appelle derrière ses paupières closes.",
      cast: [
        { name: "Luna", roleType: "hero", objective: "reprendre son souffle", fear: "la pression", traits: ["sensible"] },
        { name: "Milo", roleType: "support", objective: "la retrouver", fear: "la perdre", traits: ["protecteur"] },
      ],
      arcs: [{ name: "Arc du refuge imaginaire", summary: "Luna apprend à transformer son stress", status: "open" }],
      knownLocations: [{ name: "Le jardin intérieur", description: "Monde imaginaire floral", aliases: ["monde imaginaire"] }],
    });

    if (previousKey) vi.stubEnv("OPENAI_API_KEY", previousKey);
    else vi.unstubAllEnvs();

    expect(result.degradedStatus).toBe("DEGRADED_OUTLINE_FALLBACK");
    expect(result.outline.beats.length).toBeGreaterThan(2);
    for (const beat of result.outline.beats) {
      expect(beat.structuredBeat.arcPromises.length).toBeGreaterThan(0);
      expect(beat.structuredBeat.worldConsequences.length).toBeGreaterThan(0);
      expect(beat.structuredBeat.setupPayoffHooks.length).toBeGreaterThan(0);
    }
  });
});
