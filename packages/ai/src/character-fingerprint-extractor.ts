/**
 * Extraction de CharacterFingerprint depuis les références visuelles.
 * Analyse les images primaires pour extraire l'identité visuelle stricte.
 */

import type { CharacterFingerprint } from "@manga-ai-studio/core";

export interface CharacterRefImage {
  url: string;
  type: string;
  isPrimary: boolean;
}

/**
 * Extrait un CharacterFingerprint structuré depuis les références visuelles.
 * 
 * IMPORTANT: Cette v1 est heuristique/basique. Pour une vraie extraction,
 * il faudrait:
 * - Vision AI (GPT-4V, Claude Sonnet) pour analyser l'image
 * - Détection de features (couleur cheveux/yeux, silhouette, markers)
 * - Extraction de embeddings visuels
 * 
 * Pour l'instant, on crée un fingerprint minimal depuis les métadonnées Character.
 */
export async function extractCharacterFingerprintFromRefs(input: {
  characterId: string;
  characterName: string;
  gender: "male" | "female" | "other";
  visualRefs: CharacterRefImage[];
  visualProfile?: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
}): Promise<CharacterFingerprint> {
  // TODO: Appeler Vision AI pour vraie extraction depuis images
  // Pour l'instant, construire depuis les données structurées existantes
  
  const visualProfile = input.visualProfile ?? {};
  const bodyState = input.bodyState ?? {};
  const wardrobeProfile = input.wardrobeProfile ?? {};

  const fingerprint: CharacterFingerprint = {
    identity: {
      name: input.characterName,
      gender: input.gender,
      perceivedAge: (visualProfile.age as string) ?? "adult",
      role: (visualProfile.role as string) ?? "protagonist",
    },
    face: {
      faceShape: (visualProfile.faceShape as string) ?? "oval",
      eyeShape: (visualProfile.eyeShape as string) ?? "almond",
      eyeColor: input.eyeColor ?? (visualProfile.eyeColor as string) ?? "brown",
      eyebrowStyle: (visualProfile.eyebrowStyle as string) ?? "natural",
      noseStyle: (visualProfile.noseStyle as string) ?? undefined,
      mouthStyle: (visualProfile.mouthStyle as string) ?? undefined,
    },
    hair: {
      color: input.hairColor ?? (visualProfile.hairColor as string) ?? "black",
      style: (visualProfile.hairStyle as string) ?? "short",
      length: (visualProfile.hairLength as string) ?? "medium",
      texture: (visualProfile.hairTexture as string) ?? "straight",
      silhouette: (visualProfile.hairSilhouette as string) ?? "standard",
    },
    body: {
      build: (bodyState.build as string) ?? "average",
      height: (bodyState.height as string) ?? "average",
      posture: (bodyState.posture as string) ?? "upright",
      silhouette: (bodyState.silhouette as string) ?? "standard",
    },
    permanentMarkers: [
      ...(Array.isArray(bodyState.scars) ? (bodyState.scars as string[]) : []),
      ...(Array.isArray(bodyState.tattoos) ? (bodyState.tattoos as string[]) : []),
      ...(Array.isArray(visualProfile.distinctiveFeatures) ? (visualProfile.distinctiveFeatures as string[]) : []),
    ],
    defaultOutfit: [
      ...(Array.isArray(wardrobeProfile.defaultOutfit) ? (wardrobeProfile.defaultOutfit as string[]) : []),
    ],
    forbiddenDrift: [
      // Auto-générer forbidden drifts basés sur les traits fixes
      input.hairColor ? `never change hair color from ${input.hairColor}` : "",
      input.eyeColor ? `never change eye color from ${input.eyeColor}` : "",
      input.gender === "male" ? "never appear as female" : "",
      input.gender === "female" ? "never appear as male" : "",
    ].filter(Boolean),
    primaryRefs: input.visualRefs
      .filter((ref) => ref.isPrimary)
      .map((ref) => ref.url),
    loraTrigger: undefined, // Sera rempli si LoRA disponible
  };

  return fingerprint;
}

/**
 * Enrichit un fingerprint existant avec les infos d'un LoRA.
 */
export function enrichFingerprintWithLora(
  fingerprint: CharacterFingerprint,
  loraTrigger: string
): CharacterFingerprint {
  return {
    ...fingerprint,
    loraTrigger,
  };
}
