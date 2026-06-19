/**
 * Beat Advancement Checker: détecte et rejette les beats répétitifs ou stagnants.
 * Chaque beat doit faire progresser l'histoire, pas répéter la même information.
 */

import type { BeatAdvancement } from "@manga-ai-studio/core";

export interface BeatToCheck {
  id: string;
  summary: string;
  location: string;
  characters: string[];
  tension: number;
  purpose: string;
}

export interface BeatAdvancementCheckResult {
  beat: BeatToCheck;
  advancement: BeatAdvancement;
  shouldReject: boolean;
  rejectionReason?: string;
}

/**
 * Analyse si un beat fait réellement progresser l'histoire.
 * 
 * Un beat doit changer AU MOINS UN de ces axes:
 * - Information révélée
 * - Position/état des personnages
 * - Tension/émotion
 * - Décision prise
 * - Obstacle introduit/résolu
 */
export async function checkBeatAdvancement(
  beat: BeatToCheck,
  previousBeats: BeatToCheck[],
  context: {
    currentThreads: string[];
    characterGoals: Record<string, string>;
  }
): Promise<BeatAdvancementCheckResult> {
  // Analyser les 2-3 beats précédents pour détecter répétitions
  const recentBeats = previousBeats.slice(-3);
  
  // 1. Vérifier répétition de lieu + personnages
  const sameLocationAndCast = recentBeats.filter(
    (b) =>
      b.location === beat.location &&
      JSON.stringify(b.characters.sort()) === JSON.stringify(beat.characters.sort())
  );

  // 2. Vérifier répétition de summary/purpose
  const similarSummary = recentBeats.filter(
    (b) => computeTextSimilarity(b.summary, beat.summary) > 0.7
  );

  // 3. Calculer relevanceScore
  let relevanceScore = 1.0;
  let whatChanges = "Unknown";
  let readerLearns = "Unknown";
  let consequence: string | undefined;

  // Pénalités
  if (sameLocationAndCast.length >= 2) {
    relevanceScore -= 0.3;
    whatChanges = "Nothing significant (same location + cast as previous beats)";
  }

  if (similarSummary.length >= 1) {
    relevanceScore -= 0.4;
    whatChanges = "Repetitive action or information";
  }

  // Vérifier si le beat fait référence aux threads ouverts
  const addressesThread = context.currentThreads.some(
    (thread) => beat.summary.toLowerCase().includes(thread.toLowerCase())
  );
  if (addressesThread) {
    relevanceScore += 0.2;
    readerLearns = "Advances an open narrative thread";
  }

  // Vérifier progression de tension
  const lastTension = recentBeats[recentBeats.length - 1]?.tension ?? 5;
  const tensionDelta = Math.abs(beat.tension - lastTension);
  if (tensionDelta >= 2) {
    whatChanges = tensionDelta > 0 ? "Tension increases" : "Tension releases";
    consequence = "Emotional/narrative shift";
  }

  // Borner le score
  relevanceScore = Math.max(0, Math.min(1, relevanceScore));

  // Décider si rejet
  const shouldReject = relevanceScore < 0.6;
  const rejectionReason = shouldReject
    ? `Beat rejected: relevance score ${relevanceScore.toFixed(2)} < 0.6 (${whatChanges})`
    : undefined;

  const advancement: BeatAdvancement = {
    beatId: beat.id,
    whatChanges,
    readerLearns,
    consequence,
    narrativeJustification: beat.purpose,
    relevanceScore,
  };

  return {
    beat,
    advancement,
    shouldReject,
    rejectionReason,
  };
}

/**
 * Similarité textuelle simple (Jaccard sur mots).
 */
function computeTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Analyse un ensemble de beats pour détecter patterns répétitifs.
 */
export async function analyzeBeatsForRepetition(
  beats: BeatToCheck[],
  context: {
    currentThreads: string[];
    characterGoals: Record<string, string>;
  }
): Promise<{
  totalBeats: number;
  acceptedBeats: number;
  rejectedBeats: number;
  results: BeatAdvancementCheckResult[];
}> {
  const results: BeatAdvancementCheckResult[] = [];
  
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    const previousBeats = beats.slice(0, i);
    const result = await checkBeatAdvancement(beat, previousBeats, context);
    results.push(result);
  }

  const rejectedBeats = results.filter((r) => r.shouldReject).length;

  return {
    totalBeats: beats.length,
    acceptedBeats: beats.length - rejectedBeats,
    rejectedBeats,
    results,
  };
}
