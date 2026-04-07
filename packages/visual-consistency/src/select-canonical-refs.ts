import type { PrismaClient } from "@manga-ai-studio/db";

export interface CanonicalRefSelection {
  characterId: string;
  primaryRef: string | null;
  alternateRefs: string[];
  loraUrl: string | null;
  loraScale: number;
}

/**
 * Sélectionne les refs canoniques appropriées pour un personnage dans un contexte donné.
 * Hiérarchie :
 * 1. Scene override (si disponible dans sceneState)
 * 2. Current chapter approved refs (si disponibles)
 * 3. Character canonical refs (visualRefs isPrimary)
 * 4. LoRA model (si disponible et actif)
 */
export async function selectCanonicalRefs(
  prisma: PrismaClient,
  input: {
    characterId: string;
    sceneState?: {
      characterOverrides?: Array<{
        characterId: string;
        props?: string[];
      }>;
      imageReferenceIds?: string[];
    };
    chapterId?: string;
  },
): Promise<CanonicalRefSelection> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: {
      visualRefs: { where: { isPrimary: true } },
      loraAttachments: {
        where: { enabled: true },
        include: { lora: true },
      },
    },
  });

  if (!character) {
    return {
      characterId: input.characterId,
      primaryRef: null,
      alternateRefs: [],
      loraUrl: null,
      loraScale: 0,
    };
  }

  let primaryRef: string | null = null;
  const alternateRefs: string[] = [];

  // 1. Scene override : imageReferenceIds depuis sceneState
  if (input.sceneState?.imageReferenceIds && input.sceneState.imageReferenceIds.length > 0) {
    primaryRef = input.sceneState.imageReferenceIds[0] ?? null;
    alternateRefs.push(...input.sceneState.imageReferenceIds.slice(1));
  }

  // 2. Character canonical refs
  if (!primaryRef && character.visualRefs.length > 0) {
    primaryRef = character.visualRefs[0]?.imageUrl ?? null;
    alternateRefs.push(...character.visualRefs.slice(1).map((ref) => ref.imageUrl));
  }

  // 3. LoRA model
  let loraUrl: string | null = null;
  let loraScale = 1.0;
  const loraAttachment = character.loraAttachments.find(
    (att) => att.enabled && att.lora.status === "active",
  );
  if (loraAttachment) {
    const weightsMeta = loraAttachment.lora.weightsMeta as { loraUrl?: string } | undefined;
    loraUrl = weightsMeta?.loraUrl ?? null;
    loraScale = loraAttachment.weight;
  }

  return {
    characterId: input.characterId,
    primaryRef,
    alternateRefs,
    loraUrl,
    loraScale,
  };
}
