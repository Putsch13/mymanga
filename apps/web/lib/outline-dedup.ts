/**
 * Détection et réparation des répétitions narratives dans les plans de chapitre.
 * Algorithme : normalisation + similarité Jaccard + détection de boucle narrative.
 */

const STOP_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "en", "et", "ou",
  "à", "au", "aux", "est", "sont", "se", "sa", "son", "ses", "ce", "qui",
  "que", "il", "elle", "ils", "elles", "je", "tu", "nous", "vous", "on",
  "par", "pour", "sur", "dans", "avec", "sans", "mais", "car", "donc",
  "ni", "ne", "pas", "plus", "très", "bien", "tout", "même", "alors",
  "si", "y", "lui", "leur", "leurs", "cet", "cette", "ces", "mon", "ton",
  "ma", "ta", "mes", "tes", "nos", "vos", "va", "fait", "dit", "voit",
  "peut", "doit", "veut", "sait", "vient", "part", "reste", "tente",
]);

export function normalizeBeatText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeBeatText(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function computeBeatSimilarity(a: string, b: string): number {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 && tokB.size === 0) return 1;
  if (tokA.size === 0 || tokB.size === 0) return 0;
  const intersection = new Set([...tokA].filter((t) => tokB.has(t)));
  const union = new Set([...tokA, ...tokB]);
  return intersection.size / union.size;
}

function computeTrigramOverlap(a: string, b: string): number {
  function trigrams(text: string): Set<string> {
    const tokens = tokenize(text);
    const result = new Set<string>();
    for (let i = 0; i < tokens.length - 2; i++) {
      result.add(`${tokens[i]}_${tokens[i + 1]}_${tokens[i + 2]}`);
    }
    return result;
  }
  const tA = trigrams(a);
  const tB = trigrams(b);
  if (tA.size === 0 || tB.size === 0) return 0;
  const intersection = new Set([...tA].filter((t) => tB.has(t)));
  return intersection.size / Math.min(tA.size, tB.size);
}

export type RepeatWindow = {
  from: number;
  to: number;
  reason: string;
  similarity: number;
};

export function detectRepeatedBeatWindows(beats: string[]): RepeatWindow[] {
  const windows: RepeatWindow[] = [];
  // Seuils relevés pour éviter les faux positifs sur des beats de 8-12 mots
  const DIRECT_REPEAT_THRESHOLD = 0.72; // était 0.65
  const LOOP_THRESHOLD = 0.60;          // était 0.45 → faux positifs systématiques beat 7-9 vs beat 1-3

  for (let i = 1; i < beats.length; i++) {
    const curr = beats[i] ?? "";
    // Répétition directe avec le beat précédent
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prev = beats[j] ?? "";
      const jaccard = computeBeatSimilarity(curr, prev);
      const trigram = computeTrigramOverlap(curr, prev);
      const combined = jaccard * 0.6 + trigram * 0.4;
      if (combined >= DIRECT_REPEAT_THRESHOLD) {
        windows.push({
          from: j,
          to: i,
          reason: `Beat ${i + 1} répète beat ${j + 1} (similarité ${Math.round(combined * 100)}%)`,
          similarity: combined,
        });
      }
    }
    // Boucle narrative : beat tardif (>= 6) qui répète le début (0..2)
    if (i >= 5) {
      for (let j = 0; j <= Math.min(2, beats.length - 1); j++) {
        const early = beats[j] ?? "";
        const jaccard = computeBeatSimilarity(curr, early);
        const trigram = computeTrigramOverlap(curr, early);
        const combined = jaccard * 0.6 + trigram * 0.4;
        if (combined >= LOOP_THRESHOLD) {
          windows.push({
            from: j,
            to: i,
            reason: `Beat ${i + 1} boucle sur le début (beat ${j + 1}, similarité ${Math.round(combined * 100)}%)`,
            similarity: combined,
          });
        }
      }
    }
  }
  return windows;
}

export type ProductionBeatLike = {
  beatId?: string;
  summary: string;
  narrativeFunction?: string;
  dramaticChange?: string;
  [key: string]: unknown;
};

export function repairRepeatedBeats(beats: ProductionBeatLike[]): ProductionBeatLike[] {
  if (beats.length <= 3) return beats;

  const summaries = beats.map((b) => b.summary);
  const windows = detectRepeatedBeatWindows(summaries);
  if (windows.length === 0) return beats;

  // Identifier les indices à réparer (les beats "to" qui répètent)
  const toRepair = new Set(windows.map((w) => w.to));
  const repaired = [...beats];

  for (const idx of toRepair) {
    const beat = repaired[idx];
    if (!beat) continue;
    const window = windows.find((w) => w.to === idx);
    // Marquer le beat comme réparé avec un hint de progression
    repaired[idx] = {
      ...beat,
      summary: beat.summary,
      _repairFlag: true,
      _repairReason: window?.reason ?? "répétition détectée",
    };
  }

  return repaired;
}

export type ProgressionValidationResult = {
  ok: boolean;
  issues: string[];
  repeatedWindows: RepeatWindow[];
  progressionScore: number;
};

export function validateNarrativeProgression(beats: ProductionBeatLike[]): ProgressionValidationResult {
  if (beats.length <= 2) {
    return { ok: true, issues: [], repeatedWindows: [], progressionScore: 1 };
  }

  const summaries = beats.map((b) => b.summary);
  const windows = detectRepeatedBeatWindows(summaries);
  const issues: string[] = windows.map((w) => w.reason);

  // Score de progression : moyenne des dissimilarités entre beats successifs
  const dissimilarities: number[] = [];
  for (let i = 1; i < summaries.length; i++) {
    const sim = computeBeatSimilarity(summaries[i - 1] ?? "", summaries[i] ?? "");
    dissimilarities.push(1 - sim);
  }
  const progressionScore =
    dissimilarities.length > 0
      ? dissimilarities.reduce((a, b) => a + b, 0) / dissimilarities.length
      : 1;

  return {
    ok: windows.length === 0,
    issues,
    repeatedWindows: windows,
    progressionScore: Math.max(0, Math.min(1, progressionScore)),
  };
}

/**
 * Sélectionne 5 beats représentatifs des grands tournants narratifs.
 * Évite le slice(0,5) bête : prend intro, complication, pivot, climax, sortie.
 */
export function selectEditorialPreviewBeats<T extends ProductionBeatLike>(beats: T[]): T[] {
  if (beats.length === 0) return [];
  if (beats.length <= 5) return beats;

  const n = beats.length;
  // Positions cibles : intro (0), complication (~25%), pivot (~50%), climax (~75%), sortie (fin)
  const positions = [
    0,
    Math.floor(n * 0.25),
    Math.floor(n * 0.5),
    Math.floor(n * 0.75),
    n - 1,
  ];

  // Dédupliquer les positions
  const unique = [...new Set(positions)];
  return unique.map((i) => beats[i]).filter((b): b is T => b !== undefined);
}
