import { describe, expect, it } from "vitest";
import { characterVisualDnaForRenderFromPremiumRow } from "./premium-pipeline-character-visual-dna";

describe("characterVisualDnaForRenderFromPremiumRow", () => {
  it("agrège stableVisualDNA, âge, silhouette et marques", () => {
    const dna = characterVisualDnaForRenderFromPremiumRow({
      id: "c1",
      name: "Maya",
      hairColor: "noir",
      eyeColor: "vert",
      hairStyle: "court",
      skinTone: "mat",
      outfitSignature: "blazer bleu",
      ageApparent: "17 ans",
      bodyType: "athlétique",
      distinctiveMarks: ["cicatrice sourcil", "tatouage poignet"],
      accessories: ["montre argent"],
      stableVisualDNA: { faceShape: "ovale", jawline: "marqué" },
      canonSignatureText: "signe distinctif",
      forbiddenVisualDrift: ["pas de lunettes"],
    });
    expect(dna.characterId).toBe("c1");
    expect(dna.visualCanonExcerpt).toContain("faceShape");
    expect(dna.perceivedAge).toContain("17");
    expect(dna.bodyType).toContain("athl");
    expect(dna.silhouetteType).toBeFalsy();
    expect(dna.distinctiveMarksLine).toContain("cicatrice");
    expect(dna.accessoriesLine).toContain("montre");
    expect(dna.accessories?.join(" ")).toContain("montre");
    expect(dna.jawline).toContain("marqué");
    expect(dna.faceShape).toContain("oval");
  });
});
