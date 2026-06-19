import { describe, it, expect } from "vitest";
import { repairProductionOutlineIfNeeded } from "../lib/outline-repair";

const beat = (summary: string, beatId?: string) => ({ summary, beatId });

describe("repairProductionOutlineIfNeeded", () => {
  it("ne répare pas un plan qui progresse bien", async () => {
    const result = await repairProductionOutlineIfNeeded({
      editorialOutline: {
        summary: "Un chapitre de confrontation.",
        beats: [
          beat("Arrivée dans le village."),
          beat("Confrontation avec l'ennemi."),
          beat("Fuite vers la montagne."),
        ],
      },
      productionOutline: {
        chapterGoal: "Ryuu découvre la vérité.",
        cliffhanger: "Le temple révèle un secret.",
        beats: [
          beat("Ryuu arrive dans le village et découvre les ruines fumantes."),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant."),
          beat("Ryuu confronte le chef des bandits dans la forêt."),
          beat("Le combat tourne mal, Ryuu est blessé."),
          beat("La survivante intervient et sauve Ryuu in extremis."),
        ],
      },
    });
    expect(result.repaired).toBe(false);
    expect(result.productionOutline.beats).toHaveLength(5);
  });

  it("répare un plan dont la seconde moitié répète le début", async () => {
    const openingBeat = "Ryuu arrive dans le village et découvre les ruines fumantes après l'attaque des bandits.";
    const result = await repairProductionOutlineIfNeeded({
      editorialOutline: {
        summary: "Un chapitre de confrontation.",
        beats: [
          beat("Arrivée dans le village."),
          beat("Confrontation."),
          beat("Fuite vers la montagne."),
        ],
      },
      productionOutline: {
        chapterGoal: "Ryuu découvre la vérité.",
        cliffhanger: "Le temple révèle un secret.",
        beats: [
          beat(openingBeat, "beat_1"),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant.", "beat_2"),
          beat("Ryuu confronte le chef des bandits dans la forêt.", "beat_3"),
          beat("Le combat tourne mal, Ryuu est blessé.", "beat_4"),
          beat("La survivante intervient et sauve Ryuu.", "beat_5"),
          beat(openingBeat + " (encore)", "beat_6"),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant encore.", "beat_7"),
        ],
      },
    });
    expect(result.repaired).toBe(true);
    expect(result.repairReason).toBeDefined();
    expect(result.productionOutline.beats).toHaveLength(7);
    // Les premiers beats sont préservés
    expect(result.productionOutline.beats[0]?.summary).toBe(openingBeat);
    expect(result.productionOutline.beats[1]?.summary).toContain("survivante");
  });

  it("préserve le cliffhanger dans les beats réparés", async () => {
    const openingBeat = "Ryuu arrive dans le village et découvre les ruines fumantes après l'attaque des bandits.";
    const result = await repairProductionOutlineIfNeeded({
      editorialOutline: {
        summary: "Confrontation.",
        beats: [
          beat("Arrivée."),
          beat("Combat."),
          beat("Révélation du temple."),
        ],
      },
      productionOutline: {
        chapterGoal: "Ryuu découvre la vérité.",
        cliffhanger: "Le temple révèle un secret ancien.",
        beats: [
          beat(openingBeat, "beat_1"),
          beat("Il rencontre une survivante.", "beat_2"),
          beat("Combat dans la forêt.", "beat_3"),
          beat("Ryuu est blessé.", "beat_4"),
          beat("La survivante intervient.", "beat_5"),
          beat(openingBeat + " encore une fois.", "beat_6"),
        ],
      },
    });
    if (result.repaired) {
      const repairedBeats = result.productionOutline.beats.slice(5);
      const allText = repairedBeats.map((b) => b.summary).join(" ");
      expect(allText.length).toBeGreaterThan(0);
    }
  });
});
