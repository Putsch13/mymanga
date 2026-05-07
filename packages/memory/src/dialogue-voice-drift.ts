/**
 * P1.5 — Détection de drift de voix dialogue par personnage.
 *
 * Construit un voice profile léger depuis l’historique (lignes par personnage)
 * et émet des alertes typées quand le chapitre courant s’écarte du registre
 * historique : longueur moyenne, vocabulaire distinctif, tics verbaux,
 * répétitions textuelles, dérive émotionnelle.
 *
 * Sortie alignée sur `ContinuityIssueType` (`packages/continuity`) :
 *   - `dialogue_drift`             — la voix générale dérive (longueur, registre)
 *   - `voice_profile_violation`    — registre/tics absents ou contredits
 *   - `repeated_dialogue_echo`     — réplique recopie un snippet historique
 *   - `emotional_inconsistency`    — émotion dominante incompatible
 *
 * Aucun appel LLM : heuristiques pures, déterministes, testables.
 */

import { normalizeDialogueSnippet } from "./dialogue-memory";

export type VoiceDriftSeverity = "minor" | "major" | "critical";

export type VoiceDriftCode =
  | "dialogue_drift"
  | "voice_profile_violation"
  | "repeated_dialogue_echo"
  | "emotional_inconsistency";

export interface VoiceDriftIssue {
  code: VoiceDriftCode;
  characterId: string;
  severity: VoiceDriftSeverity;
  message: string;
  panelHint?: string;
}

export type DialogueLineWithEmotion = {
  characterId: string;
  text: string;
  emotion?: string | null;
  panelHint?: string;
};

export interface VoiceProfile {
  characterId: string;
  /** Longueur moyenne (caractères) des répliques historiques. */
  avgLength: number;
  /** Mots distinctifs (≥4 lettres) relevés au-dessus d'une fréquence seuil. */
  distinctiveVocab: Set<string>;
  /** Tics verbaux explicitement déclarés (souvent extraits du speech profile). */
  verbalTics: Set<string>;
  /** Tons/émotions interdits explicitement par le canon (ex: "vulgaire"). */
  forbiddenRegisters: Set<string>;
  /** Émotions dominantes les plus fréquentes (max 3). */
  dominantEmotions: string[];
  /** Snippets normalisés récents — sert à détecter un echo verbatim. */
  recentSnippetHashes: Set<string>;
  /** Nombre de lignes utilisées pour entraîner le profil. */
  sampleCount: number;
}

export interface VoiceProfileSeed {
  characterId: string;
  /** Tics verbaux déclarés via `speechProfile.verbalTics` (canon character). */
  verbalTics?: readonly string[];
  /** Registres explicitement interdits (ex: "argot", "moderne"). */
  forbiddenRegisters?: readonly string[];
  /** Lignes historiques (ordre inverse-chronologique préférable). */
  historicalLines: ReadonlyArray<{ text: string; emotion?: string | null }>;
}

const STOPWORDS = new Set<string>([
  "alors",
  "avec",
  "cette",
  "comme",
  "dans",
  "donc",
  "encore",
  "était",
  "elle",
  "etre",
  "être",
  "fait",
  "leur",
  "même",
  "mais",
  "mais.",
  "moins",
  "nous",
  "parce",
  "peut",
  "plus",
  "pour",
  "puis",
  "quand",
  "quelque",
  "rien",
  "sans",
  "selon",
  "sont",
  "sous",
  "tout",
  "tous",
  "très",
  "vers",
  "vous",
  "with",
  "this",
  "that",
  "from",
  "they",
  "have",
  "what",
  "when",
  "your",
  "their",
  "there",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9' -]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

export function buildVoiceProfile(seed: VoiceProfileSeed): VoiceProfile {
  const lines = seed.historicalLines.filter((l) => typeof l.text === "string" && l.text.trim().length > 0);
  const totalLen = lines.reduce((acc, l) => acc + l.text.trim().length, 0);
  const avgLength = lines.length > 0 ? Math.round(totalLen / lines.length) : 0;

  const wordFreq = new Map<string, number>();
  for (const line of lines) {
    for (const w of tokens(line.text)) {
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
  }
  const distinctiveVocab = new Set<string>();
  const distinctiveThreshold = Math.max(2, Math.ceil(lines.length / 8));
  for (const [w, count] of wordFreq.entries()) {
    if (count >= distinctiveThreshold) distinctiveVocab.add(w);
  }

  const emotionFreq = new Map<string, number>();
  for (const line of lines) {
    const e = (line.emotion ?? "").trim().toLowerCase();
    if (!e) continue;
    emotionFreq.set(e, (emotionFreq.get(e) ?? 0) + 1);
  }
  const dominantEmotions = [...emotionFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e);

  const recentSnippetHashes = new Set<string>();
  for (const line of lines.slice(0, 50)) {
    const n = normalizeDialogueSnippet(line.text);
    if (n) recentSnippetHashes.add(n);
  }

  return {
    characterId: seed.characterId,
    avgLength,
    distinctiveVocab,
    verbalTics: new Set((seed.verbalTics ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean)),
    forbiddenRegisters: new Set((seed.forbiddenRegisters ?? []).map((r) => r.toLowerCase().trim()).filter(Boolean)),
    dominantEmotions,
    recentSnippetHashes,
    sampleCount: lines.length,
  };
}

const REGISTER_HINTS: Record<string, RegExp> = {
  argot: /\b(ouais|mec|gars|grave|fric|flic|keuf)\b/i,
  vulgaire: /\b(merde|putain|connard|bordel|salaud)\b/i,
  moderne: /\b(stp|mdr|lol|whatsapp|insta|tiktok)\b/i,
  noble: /\b(messire|votre altesse|seigneur|gente)\b/i,
};

export interface DetectVoiceDriftInput {
  profiles: VoiceProfile[];
  /** Lignes du chapitre courant à analyser. */
  currentLines: ReadonlyArray<DialogueLineWithEmotion>;
  /** Tolérance de longueur (ratio max) — défaut 2.5x la moyenne historique. */
  lengthDriftRatio?: number;
}

export interface DetectVoiceDriftResult {
  issues: VoiceDriftIssue[];
  /** Statistiques par personnage (debug / dashboard). */
  stats: Array<{
    characterId: string;
    avgLengthHistorical: number;
    avgLengthCurrent: number;
    repeatedEchoes: number;
    registerHits: string[];
    sampleCount: number;
  }>;
}

export function detectDialogueVoiceDrift(input: DetectVoiceDriftInput): DetectVoiceDriftResult {
  const ratioCap = input.lengthDriftRatio ?? 2.5;
  const issues: VoiceDriftIssue[] = [];
  const profileById = new Map(input.profiles.map((p) => [p.characterId, p]));

  const linesByChar = new Map<string, DialogueLineWithEmotion[]>();
  for (const l of input.currentLines) {
    if (!l.characterId || !l.text?.trim()) continue;
    const arr = linesByChar.get(l.characterId) ?? [];
    arr.push(l);
    linesByChar.set(l.characterId, arr);
  }

  const stats: DetectVoiceDriftResult["stats"] = [];

  for (const [characterId, lines] of linesByChar.entries()) {
    const profile = profileById.get(characterId);
    if (!profile || profile.sampleCount === 0) {
      stats.push({
        characterId,
        avgLengthHistorical: 0,
        avgLengthCurrent: Math.round(lines.reduce((a, l) => a + l.text.trim().length, 0) / Math.max(1, lines.length)),
        repeatedEchoes: 0,
        registerHits: [],
        sampleCount: 0,
      });
      continue;
    }
    const totalCurrent = lines.reduce((acc, l) => acc + l.text.trim().length, 0);
    const avgCurrent = Math.round(totalCurrent / Math.max(1, lines.length));

    const ratio = profile.avgLength > 0 ? avgCurrent / profile.avgLength : 1;
    if (profile.avgLength > 0 && (ratio > ratioCap || ratio < 1 / ratioCap)) {
      issues.push({
        code: "dialogue_drift",
        characterId,
        severity: ratio > ratioCap * 1.5 || ratio < 1 / (ratioCap * 1.5) ? "major" : "minor",
        message: `Longueur moyenne des répliques de ${characterId} : ${avgCurrent} vs historique ${profile.avgLength} (ratio ${ratio.toFixed(2)}x).`,
      });
    }

    let echoes = 0;
    const seenInChapter = new Set<string>();
    for (const line of lines) {
      const norm = normalizeDialogueSnippet(line.text);
      if (!norm) continue;
      if (profile.recentSnippetHashes.has(norm) || seenInChapter.has(norm)) {
        echoes += 1;
        issues.push({
          code: "repeated_dialogue_echo",
          characterId,
          severity: "minor",
          message: `Réplique recopiée d'un chapitre précédent ou répétée : « ${line.text.trim().slice(0, 60)} ».`,
          panelHint: line.panelHint,
        });
      }
      seenInChapter.add(norm);
    }

    const registerHits: string[] = [];
    if (profile.forbiddenRegisters.size > 0) {
      for (const line of lines) {
        for (const reg of profile.forbiddenRegisters) {
          const re = REGISTER_HINTS[reg];
          if (re && re.test(line.text)) {
            registerHits.push(reg);
            issues.push({
              code: "voice_profile_violation",
              characterId,
              severity: "major",
              message: `Registre « ${reg} » interdit pour ${characterId} : « ${line.text.trim().slice(0, 60)} ».`,
              panelHint: line.panelHint,
            });
          }
        }
      }
    }

    if (profile.verbalTics.size > 0 && lines.length >= 3) {
      const blob = lines.map((l) => l.text.toLowerCase()).join(" ");
      const matched = [...profile.verbalTics].some((tic) => blob.includes(tic));
      if (!matched) {
        issues.push({
          code: "voice_profile_violation",
          characterId,
          severity: "minor",
          message: `Aucun tic verbal canonique de ${characterId} détecté sur ${lines.length} répliques (attendus : ${[...profile.verbalTics].slice(0, 3).join(", ")}).`,
        });
      }
    }

    if (profile.dominantEmotions.length > 0) {
      const incompatible = lines.filter((l) => {
        const e = (l.emotion ?? "").trim().toLowerCase();
        if (!e) return false;
        return !profile.dominantEmotions.includes(e);
      });
      if (incompatible.length >= Math.max(2, Math.ceil(lines.length * 0.6))) {
        issues.push({
          code: "emotional_inconsistency",
          characterId,
          severity: "minor",
          message: `Émotion dominante de ${characterId} dans ce chapitre s'écarte du registre habituel (${profile.dominantEmotions.join(", ")}).`,
        });
      }
    }

    stats.push({
      characterId,
      avgLengthHistorical: profile.avgLength,
      avgLengthCurrent: avgCurrent,
      repeatedEchoes: echoes,
      registerHits,
      sampleCount: profile.sampleCount,
    });
  }

  return { issues, stats };
}
