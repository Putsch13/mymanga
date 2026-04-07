import type { PrismaClient } from "@manga-ai-studio/db";
import type { VisualConsistencyScore } from "./types";

/**
 * Score la cohérence visuelle d'une image générée par rapport aux refs canoniques.
 * Heuristique basée sur les métadonnées de l'image + comparaison textuelle des prompts.
 * 
 * Note : pour un scoring avancé, il faudrait un modèle vision (CLIP, etc.).
 */
export async function scoreVisualConsistency(
  prisma: PrismaClient,
  input: {
    imageId: string;
    characterId?: string;
    generatedMetadata?: {
      prompt?: string;
      characterDescriptions?: Record<string, string>;
    };
  },
): Promise<VisualConsistencyScore> {
  const issues: string[] = [];
  let faceScore = 1.0;
  let silhouetteScore = 1.0;
  let paletteScore = 1.0;
  let accessoriesScore = 1.0;
  let outfitScore = 1.0;

  if (!input.characterId) {
    // Pas de personnage spécifique : impossible de scorer
    return {
      imageId: input.imageId,
      characterId: null,
      face: 1.0,
      silhouette: 1.0,
      palette: 1.0,
      accessories: 1.0,
      outfit: 1.0,
      overall: 1.0,
      issues: [],
    };
  }

  // Charger le personnage et ses refs canoniques
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: {
      visualRefs: { where: { isPrimary: true } },
      canonPack: true,
    },
  });

  if (!character) {
    issues.push("Character not found");
    return {
      imageId: input.imageId,
      characterId: input.characterId,
      face: 0.5,
      silhouette: 0.5,
      palette: 0.5,
      accessories: 0.5,
      outfit: 0.5,
      overall: 0.5,
      issues,
    };
  }

  // Vérifier stableVisualDNA
  const stableVisualDNA = character.stableVisualDNA as {
    hairColor?: string;
    eyeColor?: string;
    silhouette?: string;
    scars?: string[];
    tattoos?: string[];
    fixedAccessories?: string[];
    forbiddenVisualDrift?: string[];
  } | undefined;

  const prompt = input.generatedMetadata?.prompt?.toLowerCase() ?? "";

  // Face : vérifier couleur cheveux, couleur yeux
  if (stableVisualDNA?.hairColor) {
    const hairColorLower = stableVisualDNA.hairColor.toLowerCase();
    if (!prompt.includes(hairColorLower)) {
      issues.push(`Couleur de cheveux manquante dans le prompt : ${stableVisualDNA.hairColor}`);
      faceScore -= 0.3;
    }
  }

  if (stableVisualDNA?.eyeColor) {
    const eyeColorLower = stableVisualDNA.eyeColor.toLowerCase();
    if (!prompt.includes(eyeColorLower)) {
      issues.push(`Couleur des yeux manquante dans le prompt : ${stableVisualDNA.eyeColor}`);
      faceScore -= 0.3;
    }
  }

  // Silhouette : vérifier si la silhouette est mentionnée
  if (stableVisualDNA?.silhouette) {
    const silhouetteLower = stableVisualDNA.silhouette.toLowerCase();
    if (!prompt.includes(silhouetteLower)) {
      issues.push(`Silhouette manquante dans le prompt : ${stableVisualDNA.silhouette}`);
      silhouetteScore -= 0.2;
    }
  }

  // Accessories : vérifier les accessoires fixes
  if (stableVisualDNA?.fixedAccessories && stableVisualDNA.fixedAccessories.length > 0) {
    let accessoryMissing = 0;
    for (const accessory of stableVisualDNA.fixedAccessories) {
      const accessoryLower = accessory.toLowerCase();
      if (!prompt.includes(accessoryLower)) {
        issues.push(`Accessoire signature manquant : ${accessory}`);
        accessoryMissing += 1;
      }
    }
    accessoriesScore -= accessoryMissing * 0.3;
  }

  // Scars, tattoos : vérifier leur présence si elles sont permanentes
  if (stableVisualDNA?.scars && stableVisualDNA.scars.length > 0) {
    for (const scar of stableVisualDNA.scars) {
      const scarLower = scar.toLowerCase();
      if (!prompt.includes(scarLower)) {
        issues.push(`Cicatrice permanente manquante : ${scar}`);
        faceScore -= 0.1;
      }
    }
  }

  // ForbiddenVisualDrift : vérifier qu'aucun élément interdit n'est présent
  if (stableVisualDNA?.forbiddenVisualDrift && stableVisualDNA.forbiddenVisualDrift.length > 0) {
    for (const forbidden of stableVisualDNA.forbiddenVisualDrift) {
      const forbiddenLower = forbidden.toLowerCase();
      if (prompt.includes(forbiddenLower)) {
        issues.push(`Drift interdit détecté : ${forbidden}`);
        faceScore -= 0.2;
      }
    }
  }

  // Clamp scores
  faceScore = Math.max(0, Math.min(1, faceScore));
  silhouetteScore = Math.max(0, Math.min(1, silhouetteScore));
  paletteScore = Math.max(0, Math.min(1, paletteScore));
  accessoriesScore = Math.max(0, Math.min(1, accessoriesScore));
  outfitScore = Math.max(0, Math.min(1, outfitScore));

  // Overall : moyenne pondérée (face et accessories sont plus critiques)
  const overall =
    (faceScore * 0.35 +
      silhouetteScore * 0.2 +
      paletteScore * 0.15 +
      accessoriesScore * 0.2 +
      outfitScore * 0.1);

  return {
    imageId: input.imageId,
    characterId: input.characterId,
    face: faceScore,
    silhouette: silhouetteScore,
    palette: paletteScore,
    accessories: accessoriesScore,
    outfit: outfitScore,
    overall,
    issues,
  };
}
