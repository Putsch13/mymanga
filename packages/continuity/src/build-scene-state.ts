import type { PrismaClient, Prisma } from "@manga-ai-studio/db";
import type { SceneStateData, CharacterOverride, CharacterState } from "./types";

function inferTimeOfDay(text: string): string | null {
  const lower = text.toLowerCase();
  if (/(nuit|soir|minuit|crépuscule|crepuscule)/.test(lower)) return "night";
  if (/(matin|aube)/.test(lower)) return "morning";
  if (/(après-midi|apres-midi|midi)/.test(lower)) return "day";
  return null;
}

function inferMood(text: string): string | null {
  const lower = text.toLowerCase();
  if (/(stress|panique|angoisse|menace|urgence)/.test(lower)) return "tense";
  if (/(imaginaire|rêve|reve|fantaisie|créature|creature|merveilleux)/.test(lower)) return "dreamlike";
  if (/(confie|aveu|émotion|emotion|tristesse|peur)/.test(lower)) return "emotional";
  if (/(combat|attaque|fuite|poursuite)/.test(lower)) return "action";
  return null;
}

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
  const sceneText = [input.scene.title, input.scene.summary, input.scene.beat?.turn, input.scene.location]
    .filter(Boolean)
    .join(" ");
  const timeOfDay = inferTimeOfDay(sceneText);
  const mood = inferMood(sceneText);
  const dramaticGoal = input.scene.beat?.turn ?? input.scene.summary ?? null;
  const conflictAxis = input.scene.summary ?? null;

  // PresentCharacterIds : résoudre les noms de la scène en IDs réels pour verrouiller la continuité.
  const presentCharacterNames = Array.from(
    new Set([...(input.scene.beat?.characters ?? []), ...(input.scene.characters ?? [])]),
  );
  const sceneCharacters = presentCharacterNames.length > 0
    ? await prisma.character.findMany({
        where: { projectId: input.projectId, name: { in: presentCharacterNames } },
        select: {
          id: true,
          name: true,
          outfitDefault: true,
          emotionalState: true,
          hairColor: true,
          eyeColor: true,
          continuityProfile: true,
        },
      })
    : [];
  const charactersByName = new Map(sceneCharacters.map((character) => [character.name.toLowerCase(), character]));
  const presentCharacterIds = presentCharacterNames
    .map((name) => charactersByName.get(name.toLowerCase())?.id)
    .filter((id): id is string => Boolean(id));

  // CharacterOverrides : hériter du canon state si disponible
  const characterOverrides: CharacterOverride[] = [];

  for (const character of sceneCharacters) {
    const canonState = input.characterStatesFromCanon?.find((cs) => cs.characterId === character.id);
    const continuityProfile =
      character.continuityProfile && typeof character.continuityProfile === "object"
        ? character.continuityProfile as Record<string, unknown>
        : {};
    characterOverrides.push({
      characterId: character.id,
      outfit: canonState?.currentState.outfit ?? character.outfitDefault ?? null,
      visibleInjuries: canonState?.currentState.injuries ?? [],
      emotionalState: canonState?.currentState.emotion ?? character.emotionalState ?? null,
      props: canonState?.currentState.possessions ?? [],
      poseRestrictions: Array.isArray(continuityProfile.poseRestrictions)
        ? continuityProfile.poseRestrictions.filter((item): item is string => typeof item === "string")
        : [],
    });
  }

  for (const name of presentCharacterNames) {
    const knownCharacter = charactersByName.get(name.toLowerCase());
    if (!knownCharacter) {
      const syntheticId = `unresolved:${name}`;
      characterOverrides.push({
        characterId: syntheticId,
        outfit: null,
        visibleInjuries: [],
        emotionalState: null,
        props: [],
        poseRestrictions: [],
      });
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
  if (location) continuityAnchors.push(`Lieu verrouillé pour la scène : ${location}`);
  if (dramaticGoal) continuityAnchors.push(`Objectif dramatique : ${dramaticGoal}`);

  // ImageReferenceIds : sera enrichi par le pipeline image
  const imageReferenceIds: string[] = [];

  const textConstraints: string[] = [
    `La scène se déroule à ${location}.`,
    presentCharacterNames.length > 0 ? `Présences obligatoires : ${presentCharacterNames.join(", ")}.` : "",
    dramaticGoal ? `La scène doit faire avancer : ${dramaticGoal}.` : "",
  ].filter(Boolean);

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
      presentCharacterIds: data.sceneStateData.presentCharacterIds as Prisma.InputJsonValue,
      characterOverrides: data.sceneStateData.characterOverrides as Prisma.InputJsonValue,
      continuityAnchors: data.sceneStateData.continuityAnchors as Prisma.InputJsonValue,
      imageReferenceIds: data.sceneStateData.imageReferenceIds as Prisma.InputJsonValue,
      textConstraints: data.sceneStateData.textConstraints as Prisma.InputJsonValue,
    },
    update: {
      location: data.sceneStateData.location,
      timeOfDay: data.sceneStateData.timeOfDay,
      mood: data.sceneStateData.mood,
      dramaticGoal: data.sceneStateData.dramaticGoal,
      conflictAxis: data.sceneStateData.conflictAxis,
      presentCharacterIds: data.sceneStateData.presentCharacterIds as Prisma.InputJsonValue,
      characterOverrides: data.sceneStateData.characterOverrides as Prisma.InputJsonValue,
      continuityAnchors: data.sceneStateData.continuityAnchors as Prisma.InputJsonValue,
      imageReferenceIds: data.sceneStateData.imageReferenceIds as Prisma.InputJsonValue,
      textConstraints: data.sceneStateData.textConstraints as Prisma.InputJsonValue,
    },
  });
}
