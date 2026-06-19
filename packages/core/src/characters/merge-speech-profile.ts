/**
 * SPRINT 1 — fusion speechProfile (legacy) ↔ voice* (canon Continuity Engine).
 *
 * Avant ce helper, deux modèles vivaient en parallèle dans `Character` :
 *   - `speechProfile` (legacy) : sliders 0-10 (politenessLevel, sarcasmLevel,
 *     aggressionLevel, …) + champs texte (sentenceLength, vocabularyStyle,
 *     seductionStyle, threatenStyle, lieStyle, innerMonologueStyle,
 *     favoriteExpressions).
 *   - colonnes `voice*` : registre canonique 0-1 (voiceEmotionalLeak,
 *     voiceSarcasmLevel, voiceAggressionLevel, voiceSilenceFrequency) +
 *     selects (voiceRegister, voiceSentenceLength) + tableaux
 *     (voiceFavoriteExpressions, voiceForbiddenExpressions,
 *     voiceForbiddenPatterns, voiceSpeechRules), styles texte
 *     (voiceThreatenStyle, voiceLieStyle, voiceSeductionStyle,
 *     voiceInnerMonologueStyle), exemples canoniques
 *     (voiceExamplesCanonical).
 *
 * Conséquence audit v7 : les dialogue writers ne savaient pas lequel utiliser,
 * ce qui produisait des dialogues plats ("C'est incroyable !") et des
 * incohérences de tonalité.
 *
 * Politique de fusion (sans modifier le schéma DB) :
 *   - `voice*` GAGNE quand il est défini (saisie utilisateur récente, plus
 *     précise, alimente déjà le moteur dialogue Continuity).
 *   - `speechProfile` sert de fallback pour les anciens personnages qui
 *     n'ont pas encore migré.
 *   - Conversion automatique 0-10 → 0-1 quand seul speechProfile fournit
 *     un slider et que voice* est vide.
 *
 * Le résultat est un objet UNIQUE consommé par tous les downstream :
 * dialogue-writer, dialogue-scene-writer, character-prompt-builder, etc.
 */

export interface MergedSpeechProfile {
  /** "very_formal" | "formal" | "neutral" | "casual" | "rough" | null */
  register: string | null;
  /** "very_short" | "short" | "medium" | "long" | null */
  sentenceLength: string | null;
  vocabularyStyle: string | null;
  /** Tous les niveaux normalisés en [0, 1]. */
  emotionalLeak: number | null;
  sarcasmLevel: number | null;
  aggressionLevel: number | null;
  silenceFrequency: number | null;
  politenessLevel: number | null;
  favoriteExpressions: string[];
  forbiddenExpressions: string[];
  forbiddenPatterns: string[];
  speechRules: string[];
  threatenStyle: string | null;
  lieStyle: string | null;
  seductionStyle: string | null;
  innerMonologueStyle: string | null;
  examplesCanonical: Array<{ context?: string; line?: string; emotion?: string }>;
}

export interface CharacterSpeechSources {
  speechProfile?: Record<string, unknown> | null;
  /** Stable speech DNA — highest priority source for voice identity. */
  stableSpeechDNA?: Record<string, unknown> | null;
  voiceRegister?: string | null;
  voiceSentenceLength?: string | null;
  voiceVocabularyStyle?: string | null;
  voiceEmotionalLeak?: number | null;
  voiceSarcasmLevel?: number | null;
  voiceAggressionLevel?: number | null;
  voiceSilenceFrequency?: number | null;
  voiceFavoriteExpressions?: string[] | null;
  voiceForbiddenExpressions?: string[] | null;
  voiceForbiddenPatterns?: string[] | null;
  voiceSpeechRules?: string[] | null;
  voiceThreatenStyle?: string | null;
  voiceLieStyle?: string | null;
  voiceSeductionStyle?: string | null;
  voiceInnerMonologueStyle?: string | null;
  voiceExamplesCanonical?: Array<Record<string, unknown>> | null;
}

function pickStr(...values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/**
 * Convertit un slider 0-10 (speechProfile) en 0-1 (voice*) si défini.
 * Retourne `null` quand la source canonique 0-1 ET la source legacy 0-10
 * sont absentes.
 */
function resolveLevel(
  canonical01: unknown,
  legacy010: unknown,
): number | null {
  if (typeof canonical01 === "number" && Number.isFinite(canonical01)) {
    return Math.max(0, Math.min(1, canonical01));
  }
  if (typeof legacy010 === "number" && Number.isFinite(legacy010)) {
    return Math.max(0, Math.min(1, legacy010 / 10));
  }
  return null;
}

function arrayOfStrings(...values: Array<unknown>): string[] {
  for (const v of values) {
    if (Array.isArray(v) && v.length > 0) {
      const cleaned = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (cleaned.length > 0) return cleaned;
    }
  }
  return [];
}

export function mergeSpeechAndVoiceProfile(sources: CharacterSpeechSources): MergedSpeechProfile {
  const sp = (sources.speechProfile ?? {}) as Record<string, unknown>;
  const dna = (sources.stableSpeechDNA ?? {}) as Record<string, unknown>;

  return {
    register: pickStr(dna.register, sources.voiceRegister, sp.register),
    sentenceLength: pickStr(dna.sentenceLength, sources.voiceSentenceLength, sp.sentenceLength),
    vocabularyStyle: pickStr(dna.vocabularyStyle, sources.voiceVocabularyStyle, sp.vocabularyStyle),
    emotionalLeak: resolveLevel(sources.voiceEmotionalLeak, sp.emotionalLeak),
    sarcasmLevel: resolveLevel(sources.voiceSarcasmLevel, sp.sarcasmLevel),
    aggressionLevel: resolveLevel(sources.voiceAggressionLevel, sp.aggressionLevel),
    silenceFrequency: resolveLevel(sources.voiceSilenceFrequency, sp.silenceFrequency),
    politenessLevel: resolveLevel(undefined, sp.politenessLevel),
    favoriteExpressions: arrayOfStrings(dna.favoriteExpressions, sources.voiceFavoriteExpressions, sp.favoriteExpressions),
    forbiddenExpressions: arrayOfStrings(dna.forbiddenExpressions, sources.voiceForbiddenExpressions, sp.forbiddenExpressions),
    forbiddenPatterns: arrayOfStrings(sources.voiceForbiddenPatterns, sp.forbiddenPatterns),
    speechRules: arrayOfStrings(sources.voiceSpeechRules, sp.speechRules),
    threatenStyle: pickStr(sources.voiceThreatenStyle, sp.threatenStyle),
    lieStyle: pickStr(sources.voiceLieStyle, sp.lieStyle),
    seductionStyle: pickStr(sources.voiceSeductionStyle, sp.seductionStyle),
    innerMonologueStyle: pickStr(sources.voiceInnerMonologueStyle, sp.innerMonologueStyle),
    examplesCanonical: Array.isArray(sources.voiceExamplesCanonical)
      ? sources.voiceExamplesCanonical
          .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
          .map((e) => ({
            context: typeof e.context === "string" ? e.context : undefined,
            line: typeof e.line === "string" ? e.line : undefined,
            emotion: typeof e.emotion === "string" ? e.emotion : undefined,
          }))
      : [],
  };
}

/**
 * Sérialise un profil fusionné en bloc text bref pour un prompt LLM.
 * À utiliser dans `dialogue-scene-writer` (sprint 5) pour enfin injecter
 * la voix par speaker.
 */
export function formatMergedSpeechProfileForPrompt(name: string, profile: MergedSpeechProfile): string | null {
  const parts: string[] = [];
  if (profile.register) parts.push(`register=${profile.register}`);
  if (profile.sentenceLength) parts.push(`sentence_length=${profile.sentenceLength}`);
  if (profile.vocabularyStyle) parts.push(`vocab=${profile.vocabularyStyle}`);
  if (typeof profile.emotionalLeak === "number") parts.push(`emotional_leak=${profile.emotionalLeak.toFixed(1)}`);
  if (typeof profile.sarcasmLevel === "number") parts.push(`sarcasm=${profile.sarcasmLevel.toFixed(1)}`);
  if (typeof profile.aggressionLevel === "number") parts.push(`aggression=${profile.aggressionLevel.toFixed(1)}`);
  if (typeof profile.silenceFrequency === "number") parts.push(`silence=${profile.silenceFrequency.toFixed(1)}`);
  if (profile.favoriteExpressions.length > 0) parts.push(`fav=[${profile.favoriteExpressions.slice(0, 5).join(" / ")}]`);
  if (profile.forbiddenExpressions.length > 0) parts.push(`avoid=[${profile.forbiddenExpressions.slice(0, 5).join(" / ")}]`);
  if (profile.threatenStyle) parts.push(`threat_style=${profile.threatenStyle}`);
  if (profile.lieStyle) parts.push(`lie_style=${profile.lieStyle}`);
  if (parts.length === 0) return null;
  return `${name}: ${parts.join(", ")}`;
}
