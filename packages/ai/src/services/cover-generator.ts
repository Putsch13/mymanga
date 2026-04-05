/**
 * Cover Generator — Génère une image de couverture (hero shot) pour chaque chapitre.
 *
 * Utilise l'outline, les personnages focus et l'ambiance du chapitre
 * pour produire un prompt de couverture cinématique.
 */

import { composeChapterCoverPrompt, type CharacterRef, type StylePackRef } from "../manga-prompt-composer";

export interface CoverGeneratorInput {
  chapterTitle: string;
  chapterNumber: number;
  chapterSummary: string;
  cliffhanger: string;
  genre: string;
  tone: string;
  visualStyle: string;
  mood: "action" | "tension" | "emotion" | "revelation" | "calm" | "horror" | "romance" | "comedy" | "dramatic";
  characters: CharacterRef[];
  stylePack?: StylePackRef | null;
  contentIntensityLayer?: string;
}

/**
 * Détermine le mood de couverture à partir du ton et du genre.
 */
function inferCoverMood(tone: string, genre: string): CoverGeneratorInput["mood"] {
  const t = tone.toLowerCase();
  const g = genre.toLowerCase();
  if (t.includes("sombre") || t.includes("brutal") || g.includes("horror")) return "dramatic";
  if (t.includes("épique") || g.includes("action") || g.includes("shōnen")) return "action";
  if (t.includes("romantique") || g.includes("romance") || g.includes("shōjo")) return "romance";
  if (t.includes("mélancolique")) return "emotion";
  if (t.includes("mystérieux") || g.includes("thriller")) return "tension";
  if (t.includes("humoristique") || g.includes("comédie")) return "comedy";
  if (g.includes("horror") || g.includes("horreur")) return "horror";
  return "dramatic";
}

/**
 * Compose le prompt de couverture d'un chapitre.
 */
export function composeCoverPrompt(input: CoverGeneratorInput) {
  const prompt = composeChapterCoverPrompt({
    stylePack: input.stylePack,
    characters: input.characters.slice(0, 3),
    chapterTitle: input.chapterTitle,
    tone: input.tone,
    mood: input.mood,
    contentIntensityLayer: input.contentIntensityLayer,
  });

  // Enrichir le prompt avec le contexte narratif
  const narrativeContext = [
    `Chapter ${input.chapterNumber}: "${input.chapterTitle}"`,
    input.chapterSummary.slice(0, 200),
    `genre: ${input.genre}`,
    `cinematic hero shot, key visual, volume cover quality`,
    `dramatic composition showing the chapter's pivotal moment`,
  ].join(", ");

  return {
    positive: `${prompt.positive}, ${narrativeContext}`,
    negative: prompt.negative,
    width: 768,
    height: 1024,
  };
}

export { inferCoverMood };
