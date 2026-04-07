import type { PrismaClient } from "@manga-ai-studio/db";
import type { CharacterVoiceProfile } from "./types";

/**
 * Construit un prompt détaillé de voix pour un personnage, intégrant :
 * - registre, longueur de phrase, vocabulaire
 * - expressions favorites/interdites
 * - manière de menacer, mentir, séduire
 * - exemples canoniques de dialogues précédents
 */
export async function buildCharacterVoicePrompt(
  prisma: PrismaClient,
  characterId: string,
  context?: {
    sceneContext?: string;
    emotionalContext?: string;
  },
): Promise<string> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return "";
  }

  const parts: string[] = [];

  // Nom et biographie de base
  parts.push(`Personnage : ${character.name}`);
  if (character.biography) {
    parts.push(`Biographie : ${character.biography}`);
  }
  if (character.personality) {
    parts.push(`Personnalité : ${JSON.stringify(character.personality)}`);
  }

  // Voice profile fields
  parts.push("\n--- PROFIL DE VOIX ---");

  if (character.voiceRegister) {
    parts.push(`Registre : ${character.voiceRegister}`);
  }

  if (character.voiceSentenceLength) {
    parts.push(`Longueur de phrases : ${character.voiceSentenceLength}`);
  }

  if (character.voiceVocabularyStyle) {
    parts.push(`Style de vocabulaire : ${character.voiceVocabularyStyle}`);
  }

  if (character.voiceEmotionalLeak !== null && character.voiceEmotionalLeak !== undefined) {
    parts.push(`Expressivité émotionnelle : ${character.voiceEmotionalLeak}/1.0`);
  }

  if (character.voiceSarcasmLevel !== null && character.voiceSarcasmLevel !== undefined) {
    parts.push(`Niveau de sarcasme : ${character.voiceSarcasmLevel}/1.0`);
  }

  if (character.voiceAggressionLevel !== null && character.voiceAggressionLevel !== undefined) {
    parts.push(`Niveau d'agressivité : ${character.voiceAggressionLevel}/1.0`);
  }

  if (character.voiceSilenceFrequency !== null && character.voiceSilenceFrequency !== undefined) {
    parts.push(`Tendance au silence : ${character.voiceSilenceFrequency}/1.0`);
  }

  // Expressions favorites
  const favoriteExpressions = character.voiceFavoriteExpressions as string[] | undefined;
  if (favoriteExpressions && favoriteExpressions.length > 0) {
    parts.push(`Expressions favorites : ${favoriteExpressions.join(", ")}`);
  }

  // Expressions interdites
  const forbiddenExpressions = character.voiceForbiddenExpressions as string[] | undefined;
  if (forbiddenExpressions && forbiddenExpressions.length > 0) {
    parts.push(`Expressions INTERDITES : ${forbiddenExpressions.join(", ")}`);
  }

  // Patterns interdits
  const forbiddenPatterns = character.voiceForbiddenPatterns as string[] | undefined;
  if (forbiddenPatterns && forbiddenPatterns.length > 0) {
    parts.push(`Patterns de discours INTERDITS : ${forbiddenPatterns.join(", ")}`);
  }

  // Styles spécifiques
  if (character.voiceThreatenStyle) {
    parts.push(`Manière de menacer : ${character.voiceThreatenStyle}`);
  }
  if (character.voiceLieStyle) {
    parts.push(`Manière de mentir : ${character.voiceLieStyle}`);
  }
  if (character.voiceSeductionStyle) {
    parts.push(`Manière de séduire : ${character.voiceSeductionStyle}`);
  }
  if (character.voiceInnerMonologueStyle) {
    parts.push(`Style de monologue intérieur : ${character.voiceInnerMonologueStyle}`);
  }

  // Règles de speech
  const speechRules = character.voiceSpeechRules as string[] | undefined;
  if (speechRules && speechRules.length > 0) {
    parts.push("\n--- RÈGLES DE SPEECH STRICTES ---");
    speechRules.forEach((rule) => {
      parts.push(`- ${rule}`);
    });
  }

  // Exemples canoniques
  const examplesCanonical = character.voiceExamplesCanonical as Array<{
    context: string;
    line: string;
    emotion?: string;
  }> | undefined;
  if (examplesCanonical && examplesCanonical.length > 0) {
    parts.push("\n--- EXEMPLES CANONIQUES DE DIALOGUES ---");
    examplesCanonical.slice(0, 8).forEach((example) => {
      parts.push(`Contexte : ${example.context}`);
      if (example.emotion) {
        parts.push(`Émotion : ${example.emotion}`);
      }
      parts.push(`Réplique : "${example.line}"`);
      parts.push("---");
    });
  }

  // Contexte de la scène actuelle
  if (context?.sceneContext) {
    parts.push(`\n--- CONTEXTE DE LA SCÈNE ---\n${context.sceneContext}`);
  }
  if (context?.emotionalContext) {
    parts.push(`État émotionnel actuel : ${context.emotionalContext}`);
  }

  return parts.join("\n");
}
