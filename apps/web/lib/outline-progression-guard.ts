export type OutlineProgressionIssueType =
  | "duplicate_beat"
  | "story_reset"
  | "semantic_regression"
  | "late_repeat_of_opening"
  | "low_progression";

export type OutlineProgressionIssue = {
  type: OutlineProgressionIssueType;
  beatIndex: number;
  comparedToBeatIndex?: number;
  score: number;
  message: string;
};

type BeatLike = { summary: string; beatId?: string };

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zàâäéèêëîïôùûüç\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text: string): Set<string> {
  const normalized = normalizeText(text);
  const stopWords = new Set([
    "le", "la", "les", "un", "une", "des", "de", "du", "en", "et", "ou",
    "à", "au", "aux", "est", "sont", "se", "sa", "son", "ses", "ce", "qui",
    "que", "il", "elle", "ils", "elles", "je", "tu", "nous", "vous", "on",
    "par", "pour", "sur", "dans", "avec", "sans", "mais", "car", "donc",
    "ni", "ne", "pas", "plus", "très", "bien", "tout", "même", "alors",
  ]);
  return new Set(
    normalized.split(" ").filter((w) => w.length > 3 && !stopWords.has(w)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function computeSimilarity(textA: string, textB: string): number {
  return jaccardSimilarity(extractKeywords(textA), extractKeywords(textB));
}

// Seuils relevés pour éviter les faux positifs sur des beats courts
// Jaccard sur 2-3 mots communs dans des beats de 8-12 mots monte facilement à 0.25-0.45
const DUPLICATE_THRESHOLD = 0.70;       // était 0.55 → trop de faux positifs sur beats adjacents
const LATE_REPEAT_THRESHOLD = 0.60;     // était 0.40 → faux positifs systématiques beat 7-9 vs beat 1-3
const LOW_PROGRESSION_THRESHOLD = 0.55; // était 0.30 → presque tout déclenchait ce warning

export function validateOutlineProgression(input: {
  editorialOutline?: { beats?: Array<BeatLike> } | null;
  productionOutline: { beats: Array<BeatLike> };
}): {
  ok: boolean;
  progressionScore: number;
  issues: OutlineProgressionIssue[];
} {
  const beats = input.productionOutline.beats;
  const issues: OutlineProgressionIssue[] = [];

  if (beats.length <= 2) {
    return { ok: true, progressionScore: 1, issues: [] };
  }

  // Détection de répétition directe entre beats adjacents
  for (let i = 1; i < beats.length; i++) {
    const prev = beats[i - 1];
    const curr = beats[i];
    if (!prev || !curr) continue;
    const sim = computeSimilarity(prev.summary, curr.summary);
    if (sim >= DUPLICATE_THRESHOLD) {
      issues.push({
        type: "duplicate_beat",
        beatIndex: i,
        comparedToBeatIndex: i - 1,
        score: sim,
        message: `Le beat ${i + 1} ressemble trop au beat ${i} (similarité ${Math.round(sim * 100)}%).`,
      });
    }
  }

  // Détection de répétition tardive du début (après beat 5)
  const openingBeats = beats.slice(0, Math.min(3, beats.length));
  const lateBeats = beats.slice(Math.max(5, Math.floor(beats.length / 2)));

  for (let li = 0; li < lateBeats.length; li++) {
    const lateBeat = lateBeats[li];
    if (!lateBeat) continue;
    for (let oi = 0; oi < openingBeats.length; oi++) {
      const openBeat = openingBeats[oi];
      if (!openBeat) continue;
      const sim = computeSimilarity(lateBeat.summary, openBeat.summary);
      if (sim >= LATE_REPEAT_THRESHOLD) {
        const actualBeatIndex = Math.max(5, Math.floor(beats.length / 2)) + li;
        issues.push({
          type: "late_repeat_of_opening",
          beatIndex: actualBeatIndex,
          comparedToBeatIndex: oi,
          score: sim,
          message: `Le beat ${actualBeatIndex + 1} répète des éléments du début du chapitre (beat ${oi + 1}, similarité ${Math.round(sim * 100)}%).`,
        });
      }
    }
  }

  // Détection de faible progression : si tous les beats successifs sont trop proches
  let lowProgressionCount = 0;
  for (let i = 2; i < beats.length; i++) {
    const prev = beats[i - 2];
    const curr = beats[i];
    if (!prev || !curr) continue;
    const sim = computeSimilarity(prev.summary, curr.summary);
    if (sim >= LOW_PROGRESSION_THRESHOLD) {
      lowProgressionCount++;
    }
  }
  const lowProgressionRatio = beats.length > 2 ? lowProgressionCount / (beats.length - 2) : 0;
  if (lowProgressionRatio > 0.5) {
    issues.push({
      type: "low_progression",
      beatIndex: beats.length - 1,
      score: lowProgressionRatio,
      message: `Le plan progresse peu : ${Math.round(lowProgressionRatio * 100)}% des beats semblent stagner.`,
    });
  }

  // Score de progression global : 1 = parfait, 0 = très répétitif
  const uniquenessScores: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const prev = beats[i - 1];
    const curr = beats[i];
    if (prev && curr) {
      uniquenessScores.push(1 - computeSimilarity(prev.summary, curr.summary));
    }
  }
  const progressionScore =
    uniquenessScores.length > 0
      ? uniquenessScores.reduce((a, b) => a + b, 0) / uniquenessScores.length
      : 1;

  return {
    ok: issues.length === 0,
    progressionScore: Math.max(0, Math.min(1, progressionScore)),
    issues,
  };
}
