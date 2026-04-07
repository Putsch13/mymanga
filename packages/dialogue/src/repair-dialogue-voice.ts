import type { PrismaClient } from "@manga-ai-studio/db";

/**
 * Tente de réparer automatiquement une ligne de dialogue non conforme.
 * Heuristiques simples :
 * - Retirer les expressions interdites
 * - Ajuster la longueur si trop longue/courte
 * - Ajuster le registre
 * 
 * Note : pour une réparation avancée, il faudrait un LLM.
 */
export async function repairDialogueVoice(
  prisma: PrismaClient,
  characterId: string,
  dialogueLine: string,
): Promise<string> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    return dialogueLine;
  }

  let repairedLine = dialogueLine;

  // Retirer les expressions interdites (simple remplacement par "...")
  const forbiddenExpressions = character.voiceForbiddenExpressions as string[] | undefined;
  if (forbiddenExpressions) {
    for (const forbidden of forbiddenExpressions) {
      const regex = new RegExp(forbidden, "gi");
      repairedLine = repairedLine.replace(regex, "...");
    }
  }

  // Ajuster la longueur si trop longue (truncate brutalement)
  if (character.voiceSentenceLength === "very_short") {
    const words = repairedLine.split(/\s+/);
    if (words.length > 5) {
      repairedLine = words.slice(0, 5).join(" ") + "...";
    }
  }

  if (character.voiceSentenceLength === "short") {
    const words = repairedLine.split(/\s+/);
    if (words.length > 10) {
      repairedLine = words.slice(0, 10).join(" ") + "...";
    }
  }

  // TODO: ajuster le registre (nécessiterait un LLM pour rephrase)

  return repairedLine;
}
