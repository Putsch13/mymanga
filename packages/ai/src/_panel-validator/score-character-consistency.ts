/**
 * Score isolé de cohérence d'un personnage (helper exposé publiquement).
 *
 * Volontairement basée sur le prompt uniquement — pas d'appel Vision.
 * Les pondérations matchent celles utilisées dans `validateGeneratedPanel`.
 */
import type { CharacterFingerprint } from "@manga-ai-studio/core";

export interface ScoreCharacterConsistencyInput {
  characterName: string;
  fingerprint: CharacterFingerprint;
  panelPrompt: string;
  panelImageUrl?: string;
}

export interface ScoreCharacterConsistencyResult {
  score: number;
  details: {
    face: number;
    hair: number;
    eyes: number;
    gender: number;
    markers: number;
  };
}

export async function scoreCharacterConsistency(
  input: ScoreCharacterConsistencyInput,
): Promise<ScoreCharacterConsistencyResult> {
  const prompt = input.panelPrompt.toLowerCase();
  const fp = input.fingerprint;

  const scores = {
    face: 1.0,
    hair: prompt.includes(fp.hair.color.toLowerCase()) ? 1.0 : 0.5,
    eyes: prompt.includes(fp.face.eyeColor.toLowerCase()) ? 1.0 : 0.5,
    gender: 1.0,
    markers: 1.0,
  };

  if (
    fp.identity.gender === "male" &&
    (prompt.includes("woman") || prompt.includes("female"))
  ) {
    scores.gender = 0.0;
  }
  if (
    fp.identity.gender === "female" &&
    (prompt.includes("man") || prompt.includes("male"))
  ) {
    scores.gender = 0.0;
  }

  if (fp.permanentMarkers.length > 0) {
    const foundMarkers = fp.permanentMarkers.filter(
      (m) => m && prompt.includes(m.toLowerCase()),
    );
    scores.markers = foundMarkers.length / fp.permanentMarkers.length;
  }

  const overallScore =
    scores.face * 0.2 +
    scores.hair * 0.25 +
    scores.eyes * 0.25 +
    scores.gender * 0.2 +
    scores.markers * 0.1;

  return { score: overallScore, details: scores };
}
