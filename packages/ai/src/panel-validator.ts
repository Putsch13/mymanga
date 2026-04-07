/**
 * Validation de panels générés contre CharacterFingerprint et PanelContract.
 * Détecte les dérives visuelles et les incohérences.
 */

import type { CharacterFingerprint, PanelValidationResult } from "@manga-ai-studio/core";

export interface GeneratedPanelData {
  panelId: string;
  imageUrl: string;
  requiredCharacters: Array<{
    characterId: string;
    characterName: string;
    fingerprint: CharacterFingerprint;
  }>;
  metadata?: {
    prompt?: string;
    negativePrompt?: string;
    model?: string;
  };
}

/**
 * Valide un panel généré contre les fingerprints requis.
 * 
 * IMPORTANT: Cette v1 est basique (analyse de prompt).
 * Pour une vraie validation, il faudrait:
 * - Vision AI pour analyser l'image générée
 * - Détection de features visuelles
 * - Comparaison embeddings vs références canoniques
 * - Face recognition pour confirmer identité
 */
export async function validateGeneratedPanel(
  panel: GeneratedPanelData
): Promise<PanelValidationResult> {
  const issues: PanelValidationResult["issues"] = [];
  let score = 1.0;

  // 1. Vérifier que tous les personnages requis sont mentionnés dans le prompt
  const prompt = panel.metadata?.prompt?.toLowerCase() ?? "";
  
  for (const char of panel.requiredCharacters) {
    const nameInPrompt = prompt.includes(char.characterName.toLowerCase());
    
    if (!nameInPrompt) {
      issues.push({
        severity: "critical",
        type: "missing_character",
        message: `Character ${char.characterName} not found in prompt`,
        autoFixable: false,
      });
      score -= 0.3;
    }

    // 2. Vérifier les traits clés du fingerprint dans le prompt
    const fp = char.fingerprint;
    
    // Vérifier cheveux
    const hairColor = fp.hair.color.toLowerCase();
    if (!prompt.includes(hairColor)) {
      issues.push({
        severity: "major",
        type: "wrong_hair",
        message: `${char.characterName}: hair color "${hairColor}" not in prompt`,
        autoFixable: true,
      });
      score -= 0.15;
    }

    // Vérifier yeux
    const eyeColor = fp.face.eyeColor.toLowerCase();
    if (!prompt.includes(eyeColor)) {
      issues.push({
        severity: "major",
        type: "wrong_eyes",
        message: `${char.characterName}: eye color "${eyeColor}" not in prompt`,
        autoFixable: true,
      });
      score -= 0.15;
    }

    // Vérifier genre
    if (fp.identity.gender === "male" && (prompt.includes("woman") || prompt.includes("female") || prompt.includes("girl"))) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: male character with female terms in prompt`,
        autoFixable: false,
      });
      score -= 0.4;
    }
    if (fp.identity.gender === "female" && (prompt.includes("man") || prompt.includes("male") || prompt.includes("boy"))) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: female character with male terms in prompt`,
        autoFixable: false,
      });
      score -= 0.4;
    }

    // Vérifier markers permanents
    for (const marker of fp.permanentMarkers) {
      if (marker && !prompt.includes(marker.toLowerCase())) {
        issues.push({
          severity: "minor",
          type: "missing_element",
          message: `${char.characterName}: permanent marker "${marker}" not in prompt`,
          autoFixable: true,
        });
        score -= 0.05;
      }
    }

    // Vérifier forbidden drifts
    for (const forbidden of fp.forbiddenDrift) {
      const forbiddenLower = forbidden.toLowerCase();
      if (forbiddenLower.includes("never") && prompt.includes(forbiddenLower.replace("never ", ""))) {
        issues.push({
          severity: "critical",
          type: "forbidden_element",
          message: `${char.characterName}: forbidden drift detected "${forbidden}"`,
          autoFixable: false,
        });
        score -= 0.3;
      }
    }
  }

  // Borner le score entre 0 et 1
  score = Math.max(0, Math.min(1, score));

  // Déterminer si reroll requis
  const requiredReroll = score < 0.78 || issues.some((i) => i.severity === "critical");

  return {
    panelId: panel.panelId,
    score,
    issues,
    requiredReroll,
  };
}

/**
 * Score la cohérence d'un personnage spécifique dans un panel.
 */
export async function scoreCharacterConsistency(input: {
  characterName: string;
  fingerprint: CharacterFingerprint;
  panelPrompt: string;
  panelImageUrl?: string;
}): Promise<{
  score: number;
  details: {
    face: number;
    hair: number;
    eyes: number;
    gender: number;
    markers: number;
  };
}> {
  // Version simplifiée basée sur prompt
  const prompt = input.panelPrompt.toLowerCase();
  const fp = input.fingerprint;

  const scores = {
    face: 1.0,
    hair: prompt.includes(fp.hair.color.toLowerCase()) ? 1.0 : 0.5,
    eyes: prompt.includes(fp.face.eyeColor.toLowerCase()) ? 1.0 : 0.5,
    gender: 1.0,
    markers: 1.0,
  };

  // Vérifier gender
  if (fp.identity.gender === "male" && (prompt.includes("woman") || prompt.includes("female"))) {
    scores.gender = 0.0;
  }
  if (fp.identity.gender === "female" && (prompt.includes("man") || prompt.includes("male"))) {
    scores.gender = 0.0;
  }

  // Vérifier markers
  if (fp.permanentMarkers.length > 0) {
    const foundMarkers = fp.permanentMarkers.filter((m) =>
      m && prompt.includes(m.toLowerCase())
    );
    scores.markers = foundMarkers.length / fp.permanentMarkers.length;
  }

  const overallScore =
    (scores.face * 0.2 +
      scores.hair * 0.25 +
      scores.eyes * 0.25 +
      scores.gender * 0.2 +
      scores.markers * 0.1);

  return {
    score: overallScore,
    details: scores,
  };
}
