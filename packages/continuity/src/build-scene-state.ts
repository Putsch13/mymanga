import type { PrismaClient } from "@manga-ai-studio/db";
import type { SceneStateData, CharacterOverride, CharacterState } from "./types";

/**
 * Construit le SceneState à partir de l'outline et du script.
 * Fixe l'état local d'une scène pour empêcher les dérives intra-chapitre.
 */
export async function buildSceneState(
  prisma: PrismaClient,
  input: {
    projectId: string;
    chapterId: string;
    sceneId: string;
    sceneNumber: number;
    scene: {
      title?: string | null;
      summary?: string | null;
      location?: string | null;
      characters?: string[];
      beat?: {
        location?: string;
        characters?: string[];
        pageRole?: string;
        emotionalDelta?: number;
        turn?: string;
      };
    };
    characterStatesFromCanon?: CharacterState[];
  },
): Promise<SceneStateData> {
  const location = input.scene.location ?? input.scene.beat?.location ?? "unknown location";
  const timeOfDay = null; // À enrichir si disponible dans l'outline
  const mood = null; // À enrichir si disponible (ex: from beat pageRole)
  const dramaticGoal = input.scene.beat?.turn ?? input.scene.summary ?? null;
  const conflictAxis = null; // À enrichir si disponible

  // PresentCharacterIds : fusionner les personnages du beat et de la scène
  const presentCharacterIds = Array.from(
    new Set([...(input.scene.beat?.characters ?? []), ...(input.scene.characters ?? [])]),
  );

  // CharacterOverrides : hériter du canon state si disponible
  const characterOverrides: CharacterOverride[] = [];

  if (input.characterStatesFromCanon) {
    for (const charId of presentCharacterIds) {
      const canonState = input.characterStatesFromCanon.find((cs) => cs.characterId === charId);
      if (canonState) {
        characterOverrides.push({
          characterId: charId,
          outfit: canonState.currentState.outfit ?? null,
          visibleInjuries: canonState.currentState.injuries ?? [],
          emotionalState: canonState.currentState.emotion ?? null,
          props: canonState.currentState.possessions ?? [],
          poseRestrictions: [],
        });
      } else {
        // Personnage sans canon state : rechercher dans le projet
        const character = await prisma.character.findFirst({
          where: { projectId: input.projectId, id: charId },
        });
        if (character) {
          characterOverrides.push({
            characterId: charId,
            outfit: character.outfitDefault ?? null,
            visibleInjuries: [],
            emotionalState: character.emotionalState ?? null,
            props: [],
            poseRestrictions: [],
          });
        }
      }
    }
  }

  // ContinuityAnchors : contraintes textuelles strictes pour cette scène
  const continuityAnchors: string[] = [];
  characterOverrides.forEach((override) => {
    if (override.visibleInjuries.length > 0) {
      continuityAnchors.push(`${override.characterId} doit montrer les blessures : ${override.visibleInjuries.join(", ")}`);
    }
    if (override.outfit) {
      continuityAnchors.push(`${override.characterId} porte : ${override.outfit}`);
    }
  });

  // ImageReferenceIds : sera enrichi par le pipeline image
  const imageReferenceIds: string[] = [];

  // TextConstraints : sera enrichi par le pipeline
  const textConstraints: string[] = [];

  return {
    location,
    timeOfDay,
    mood,
    dramaticGoal,
    conflictAxis,
    presentCharacterIds,
    characterOverrides,
    continuityAnchors,
    imageReferenceIds,
    textConstraints,
  };
}

/**
 * Persiste le SceneState dans la DB après génération.
 */
export async function persistSceneState(
  prisma: PrismaClient,
  data: {
    projectId: string;
    chapterId: string;
    sceneId: string;
    sceneNumber: number;
    sceneStateData: SceneStateData;
  },
): Promise<void> {
  await prisma.sceneState.upsert({
    where: { sceneId: data.sceneId },
    create: {
      projectId: data.projectId,
      chapterId: data.chapterId,
      sceneId: data.sceneId,
      sceneNumber: data.sceneNumber,
      location: data.sceneStateData.location,
      timeOfDay: data.sceneStateData.timeOfDay,
      mood: data.sceneStateData.mood,
      dramaticGoal: data.sceneStateData.dramaticGoal,
      conflictAxis: data.sceneStateData.conflictAxis,
      presentCharacterIds: data.sceneStateData.presentCharacterIds as unknown as Array<unknown>,
      characterOverrides: data.sceneStateData.characterOverrides as unknown as Array<unknown>,
      continuityAnchors: data.sceneStateData.continuityAnchors as unknown as Array<unknown>,
      imageReferenceIds: data.sceneStateData.imageReferenceIds as unknown as Array<unknown>,
      textConstraints: data.sceneStateData.textConstraints as unknown as Array<unknown>,
    },
    update: {
      location: data.sceneStateData.location,
      timeOfDay: data.sceneStateData.timeOfDay,
      mood: data.sceneStateData.mood,
      dramaticGoal: data.sceneStateData.dramaticGoal,
      conflictAxis: data.sceneStateData.conflictAxis,
      presentCharacterIds: data.sceneStateData.presentCharacterIds as unknown as Array<unknown>,
      characterOverrides: data.sceneStateData.characterOverrides as unknown as Array<unknown>,
      continuityAnchors: data.sceneStateData.continuityAnchors as unknown as Array<unknown>,
      imageReferenceIds: data.sceneStateData.imageReferenceIds as unknown as Array<unknown>,
      textConstraints: data.sceneStateData.textConstraints as unknown as Array<unknown>,
    },
  });
}
