import { describe, it, expect } from "vitest";
import { validateOutlineProgression } from "../lib/outline-progression-guard";

const beat = (summary: string) => ({ summary });

describe("validateOutlineProgression", () => {
  it("retourne ok pour un plan qui progresse bien", () => {
    const result = validateOutlineProgression({
      productionOutline: {
        beats: [
          beat("Ryuu arrive dans le village et découvre les ruines fumantes."),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant."),
          beat("Ryuu confronte le chef des bandits dans la forêt."),
          beat("Le combat tourne mal, Ryuu est blessé."),
          beat("La survivante intervient et sauve Ryuu in extremis."),
          beat("Ryuu et la survivante fuient vers la montagne."),
          beat("Ils découvrent un temple caché qui pourrait changer la donne."),
        ],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.progressionScore).toBeGreaterThan(0.5);
  });

  it("détecte une répétition directe entre deux beats adjacents", () => {
    const result = validateOutlineProgression({
      productionOutline: {
        beats: [
          beat("Ryuu arrive dans le village et découvre les ruines fumantes."),
          beat("Ryuu arrive dans le village et voit les ruines encore fumantes."),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant."),
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === "duplicate_beat")).toBe(true);
  });

  it("détecte une répétition tardive du début après beat 5", () => {
    const openingBeat = "Ryuu arrive dans le village et découvre les ruines fumantes après l'attaque des bandits.";
    const result = validateOutlineProgression({
      productionOutline: {
        beats: [
          beat(openingBeat),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant."),
          beat("Ryuu confronte le chef des bandits dans la forêt."),
          beat("Le combat tourne mal, Ryuu est blessé gravement."),
          beat("La survivante intervient et sauve Ryuu in extremis."),
          beat("Ryuu arrive dans le village et découvre les ruines fumantes après l'attaque des bandits encore."),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant encore."),
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.type === "late_repeat_of_opening")).toBe(true);
  });

  it("retourne ok pour un plan court (2 beats)", () => {
    const result = validateOutlineProgression({
      productionOutline: {
        beats: [
          beat("Ryuu arrive."),
          beat("Il repart."),
        ],
      },
    });
    expect(result.ok).toBe(true);
  });

  it("calcule un progressionScore entre 0 et 1", () => {
    const result = validateOutlineProgression({
      productionOutline: {
        beats: [
          beat("Scène d'ouverture dans la forêt sombre."),
          beat("Rencontre avec l'ennemi principal."),
          beat("Combat intense sous la pluie."),
          beat("Révélation du secret de l'ennemi."),
          beat("Fuite vers le temple."),
        ],
      },
    });
    expect(result.progressionScore).toBeGreaterThanOrEqual(0);
    expect(result.progressionScore).toBeLessThanOrEqual(1);
  });

  it("prend en compte l'outline éditorial si fourni", () => {
    const result = validateOutlineProgression({
      editorialOutline: {
        beats: [
          beat("Arrivée dans le village."),
          beat("Confrontation."),
          beat("Fuite."),
        ],
      },
      productionOutline: {
        beats: [
          beat("Ryuu arrive dans le village et découvre les ruines fumantes."),
          beat("Il rencontre une survivante qui lui révèle l'identité de l'attaquant."),
          beat("Ryuu confronte le chef des bandits dans la forêt."),
          beat("Le combat tourne mal, Ryuu est blessé."),
          beat("La survivante intervient et sauve Ryuu in extremis."),
        ],
      },
    });
    expect(result.progressionScore).toBeGreaterThan(0.4);
  });
});
