import {
  isHeroRole,
  isSecondaryHeroRole,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { sendCharacterLoraTrainingRequested } from "@manga-ai-studio/workflow";

interface TriggerLoraTrainingArgs {
  character: {
    id: string;
    name: string;
    roleType: string | null;
    project: { id: string };
  };
  imageUrl: string;
}

/**
 * E1 : Trigger LoRA auto-training pour les personnages clés (héros principal
 * ou co-héros canon). Best-effort : si l'envoi du job échoue on log mais on
 * ne propage pas l'erreur.
 */
export async function triggerLoraTrainingIfKeyCharacter(
  args: TriggerLoraTrainingArgs,
): Promise<void> {
  const { character, imageUrl } = args;
  const isKeyCharacter =
    isHeroRole(character.roleType) || isSecondaryHeroRole(character.roleType);
  if (!isKeyCharacter) return;

  try {
    await prisma.character.update({
      where: { id: character.id },
      data: { loraStatus: "training" },
    });
    const loraSent = await sendCharacterLoraTrainingRequested({
      characterId: character.id,
      projectId: character.project.id,
      imageUrl,
    });
    if (loraSent.ok) {
      console.log(
        `[generate-visual] LoRA training triggered for ${character.name} (${character.roleType})`,
      );
    } else {
      console.warn(`[generate-visual] LoRA training skipped: ${loraSent.skipped}`);
      await prisma.character.update({
        where: { id: character.id },
        data: { loraStatus: "none" },
      });
    }
  } catch (loraErr) {
    console.error(
      `[generate-visual] LoRA trigger failed (non-blocking): ${
        loraErr instanceof Error ? loraErr.message : loraErr
      }`,
    );
    await prisma.character
      .update({ where: { id: character.id }, data: { loraStatus: "none" } })
      .catch(() => null);
  }
}
