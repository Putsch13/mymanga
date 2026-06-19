import { describe, expect, it } from "vitest";
import {
  normalizeBeatText,
  computeBeatSimilarity,
  detectRepeatedBeatWindows,
  repairRepeatedBeats,
  validateNarrativeProgression,
  selectEditorialPreviewBeats,
} from "../lib/outline-dedup";

describe("normalizeBeatText", () => {
  it("met en minuscule et supprime la ponctuation", () => {
    // L'apostrophe est remplacée par un espace, puis les espaces sont compressés
    expect(normalizeBeatText("Ryuu frappe l'ennemi !")).toBe("ryuu frappe l ennemi");
  });

  it("supprime les accents", () => {
    expect(normalizeBeatText("Éléna hésite")).toBe("elena hesite");
  });

  it("compresse les espaces multiples", () => {
    expect(normalizeBeatText("  a   b  ")).toBe("a b");
  });
});

describe("computeBeatSimilarity", () => {
  it("retourne 1 pour deux textes identiques", () => {
    const text = "Ryuu affronte le boss dans la salle du trône";
    expect(computeBeatSimilarity(text, text)).toBe(1);
  });

  it("retourne 0 pour deux textes complètement différents", () => {
    const a = "cheval galope montagne neige";
    const b = "poisson nage rivière calme";
    expect(computeBeatSimilarity(a, b)).toBe(0);
  });

  it("retourne une valeur intermédiaire pour des textes partiellement similaires", () => {
    const a = "Ryuu affronte le boss dans la salle";
    const b = "Ryuu combat le boss dans le couloir";
    const sim = computeBeatSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.2);
    expect(sim).toBeLessThan(1);
  });

  it("gère les chaînes vides", () => {
    expect(computeBeatSimilarity("", "")).toBe(1);
    expect(computeBeatSimilarity("texte", "")).toBe(0);
  });
});

describe("detectRepeatedBeatWindows", () => {
  it("ne détecte aucune répétition pour un plan progressif", () => {
    const beats = [
      "Ryuu arrive au village en ruines",
      "Il découvre des indices sur l'ennemi",
      "Confrontation avec un garde ennemi",
      "Révélation : le chef du village est un traître",
      "Ryuu s'échappe avec l'information",
      "Il rejoint ses alliés et prépare l'assaut",
      "L'assaut commence, les portes s'ouvrent",
      "Combat final contre le boss",
    ];
    const windows = detectRepeatedBeatWindows(beats);
    expect(windows).toHaveLength(0);
  });

  it("détecte une répétition directe entre beats consécutifs", () => {
    const beats = [
      "Ryuu affronte le boss dans la salle du trône et le frappe",
      "Ryuu affronte le boss dans la salle du trône et le frappe encore",
      "L'ennemi tombe enfin vaincu",
    ];
    const windows = detectRepeatedBeatWindows(beats);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0]?.to).toBe(1);
  });

  it("détecte une boucle narrative tardive sur le début", () => {
    const beats = [
      "Ryuu arrive au village et découvre les ruines",
      "Il rencontre une vieille femme qui lui parle",
      "Il trouve une piste vers l'ennemi",
      "Combat dans la forêt",
      "Victoire partielle",
      "Ryuu arrive au village et découvre les ruines à nouveau",
    ];
    const windows = detectRepeatedBeatWindows(beats);
    expect(windows.length).toBeGreaterThan(0);
    const loopWindow = windows.find((w) => w.to === 5);
    expect(loopWindow).toBeDefined();
    expect(loopWindow?.reason).toContain("boucle");
  });
});

describe("repairRepeatedBeats", () => {
  it("retourne les beats inchangés si aucune répétition", () => {
    const beats = [
      { summary: "Ryuu arrive au village" },
      { summary: "Il découvre des indices" },
      { summary: "Combat contre l'ennemi" },
    ];
    const result = repairRepeatedBeats(beats);
    expect(result).toHaveLength(3);
    expect(result[0]?._repairFlag).toBeUndefined();
  });

  it("marque les beats répétitifs avec _repairFlag", () => {
    const beats = [
      { summary: "Ryuu affronte boss grande salle frappe fort combat épique" },
      { summary: "Ryuu affronte boss grande salle frappe encore combat épique" },
      { summary: "Ryuu affronte boss grande salle frappe toujours combat épique" },
      { summary: "ennemi tombe vaincu finalement" },
    ];
    const result = repairRepeatedBeats(beats);
    const flagged = result.filter((b) => b._repairFlag);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("ne modifie pas les plans avec <= 3 beats", () => {
    const beats = [
      { summary: "A" },
      { summary: "A" },
    ];
    const result = repairRepeatedBeats(beats);
    expect(result).toEqual(beats);
  });
});

describe("validateNarrativeProgression", () => {
  it("retourne ok=true pour un plan progressif", () => {
    const beats = [
      { summary: "Ryuu arrive au village en ruines et cherche des indices" },
      { summary: "Il rencontre une vieille femme qui connaît le secret" },
      { summary: "Confrontation avec les gardes ennemis dans la forêt" },
      { summary: "Révélation : le chef du village est un traître infiltré" },
      { summary: "Ryuu s'échappe et rejoint ses alliés pour préparer l'assaut final" },
    ];
    const result = validateNarrativeProgression(beats);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.progressionScore).toBeGreaterThan(0.3);
  });

  it("retourne ok=false pour un plan avec répétitions", () => {
    const beats = [
      { summary: "Ryuu affronte le boss dans la grande salle du trône" },
      { summary: "Le boss résiste et contre-attaque violemment" },
      { summary: "Ryuu trébuche mais se relève avec courage" },
      { summary: "Ryuu affronte le boss dans la grande salle du trône encore une fois" },
    ];
    const result = validateNarrativeProgression(beats);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("gère les plans avec <= 2 beats", () => {
    const result = validateNarrativeProgression([
      { summary: "A" },
      { summary: "B" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.progressionScore).toBe(1);
  });
});

describe("selectEditorialPreviewBeats", () => {
  it("retourne tous les beats si <= 5", () => {
    const beats = [
      { summary: "A" },
      { summary: "B" },
      { summary: "C" },
    ];
    const result = selectEditorialPreviewBeats(beats);
    expect(result).toHaveLength(3);
  });

  it("retourne exactement 5 beats pour un plan de 10 beats", () => {
    const beats = Array.from({ length: 10 }, (_, i) => ({ summary: `Beat ${i + 1}` }));
    const result = selectEditorialPreviewBeats(beats);
    expect(result).toHaveLength(5);
  });

  it("inclut toujours le premier et le dernier beat", () => {
    const beats = Array.from({ length: 8 }, (_, i) => ({ summary: `Beat ${i + 1}` }));
    const result = selectEditorialPreviewBeats(beats);
    expect(result[0]?.summary).toBe("Beat 1");
    expect(result[result.length - 1]?.summary).toBe("Beat 8");
  });

  it("retourne un tableau vide pour un plan vide", () => {
    expect(selectEditorialPreviewBeats([])).toHaveLength(0);
  });

  it("couvre les positions intro/complication/pivot/climax/sortie", () => {
    const beats = Array.from({ length: 12 }, (_, i) => ({ summary: `Beat ${i + 1}` }));
    const result = selectEditorialPreviewBeats(beats);
    // Doit inclure beat 1 (intro) et beat 12 (sortie)
    expect(result.some((b) => b.summary === "Beat 1")).toBe(true);
    expect(result.some((b) => b.summary === "Beat 12")).toBe(true);
    // Doit avoir des beats intermédiaires
    expect(result.length).toBe(5);
  });
});
