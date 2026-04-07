import type { PrismaClient } from "@manga-ai-studio/db";
import type { DialogueVoiceScore } from "./types";

/**
 * Valide la cohérence d'une ligne de dialogue avec le profil de voix du personnage.
 * Retourne un score de 0 à 1 et une liste d'issues.
 */
export async function validateDialogueVoice(
  prisma: PrismaClient,
  characterId: string,
  dialogueLines: string[],
): Promise<DialogueVoiceScore> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return {
      characterId,
      score: 1.0,
      issues: ["Character not found"],
    };
  }

  const issues: string[] = [];
  let score = 1.0;

  // Vérifier les expressions interdites
  const forbiddenExpressions = character.voiceForbiddenExpressions as string[] | undefined;
  if (forbiddenExpressions) {
    for (const line of dialogueLines) {
      const lowerLine = line.toLowerCase();
      for (const forbidden of forbiddenExpressions) {
        if (lowerLine.includes(forbidden.toLowerCase())) {
          issues.push(`Expression interdite utilisée : "${forbidden}"`);
          score -= 0.2;
        }
      }
    }
  }

  // Vérifier les patterns interdits
  const forbiddenPatterns = character.voiceForbiddenPatterns as string[] | undefined;
  if (forbiddenPatterns) {
    for (const line of dialogueLines) {
      const lowerLine = line.toLowerCase();
      for (const pattern of forbiddenPatterns) {
        if (lowerLine.includes(pattern.toLowerCase())) {
          issues.push(`Pattern de discours interdit : "${pattern}"`);
          score -= 0.15;
        }
      }
    }
  }

  // Vérifier la longueur des phrases
  if (character.voiceSentenceLength) {
    for (const line of dialogueLines) {
      const words = line.split(/\s+/).length;
      if (character.voiceSentenceLength === "very_short" && words > 5) {
        issues.push(`Phrase trop longue pour un style "very_short" : ${words} mots`);
        score -= 0.05;
      }
      if (character.voiceSentenceLength === "short" && words > 10) {
        issues.push(`Phrase trop longue pour un style "short" : ${words} mots`);
        score -= 0.05;
      }
      if (character.voiceSentenceLength === "long" && words < 12) {
        issues.push(`Phrase trop courte pour un style "long" : ${words} mots`);
        score -= 0.05;
      }
    }
  }

  // Vérifier le registre (heuristique simple : compter les mots formels vs casual)
  if (character.voiceRegister) {
    const formalWords = ["madame", "monsieur", "veuillez", "je vous prie", "effectivement"];
    const casualWords = ["ouais", "mec", "putain", "genre", "lol"];
    for (const line of dialogueLines) {
      const lowerLine = line.toLowerCase();
      const formalCount = formalWords.filter((w) => lowerLine.includes(w)).length;
      const casualCount = casualWords.filter((w) => lowerLine.includes(w)).length;

      if (character.voiceRegister === "very_formal" && casualCount > 0) {
        issues.push(`Registre trop casual pour un style "very_formal"`);
        score -= 0.1;
      }
      if (character.voiceRegister === "casual" && formalCount > casualCount) {
        issues.push(`Registre trop formel pour un style "casual"`);
        score -= 0.1;
      }
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    characterId,
    score,
    issues,
  };
}
