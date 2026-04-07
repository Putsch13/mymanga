import type { PrismaClient } from "@manga-ai-studio/db";
import type {
  ChapterCanonStateData,
  CharacterState,
  WorldState,
  OpenThread,
  ResolvedThread,
  CanonEvent,
} from "./types";

/**
 * Construit le snapshot canonique complet à la fin d'un chapitre.
 * Ce state devient la base du chapitre suivant.
 */
export async function buildChapterCanonState(
  prisma: PrismaClient,
  input: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    outline: unknown;
    script: unknown;
    summary?: string | null;
    cliffhanger?: string | null;
  },
): Promise<ChapterCanonStateData> {
  // Charger les données du projet
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: {
      characters: true,
      relationships: true,
      locations: true,
      storyBible: true,
    },
  });

  if (!project) throw new Error("Project not found");

  // Charger le canon state précédent si disponible
  const previousCanonState = await prisma.chapterCanonState.findFirst({
    where: {
      projectId: input.projectId,
      chapterNumber: { lt: input.chapterNumber },
    },
    orderBy: { chapterNumber: "desc" },
  });

  // Construire worldState
  const worldState: WorldState = previousCanonState?.worldState
    ? (previousCanonState.worldState as WorldState)
    : {
        activeLocations: [],
        activeThreats: [],
        activeMysteries: [],
        globalFlags: {},
      };

  // Extraire les lieux actifs de l'outline si possible
  const outlineObj = input.outline as { beats?: Array<{ location?: string }> } | undefined;
  if (outlineObj?.beats) {
    const newLocations = outlineObj.beats
      .map((beat) => beat.location)
      .filter((loc): loc is string => Boolean(loc));
    worldState.activeLocations = Array.from(new Set([...worldState.activeLocations, ...newLocations]));
  }

  // Construire characterStates : hérite du précédent + met à jour avec le script courant
  const characterStates: CharacterState[] = [];

  for (const char of project.characters) {
    const prevState = previousCanonState?.characterStates
      ? (previousCanonState.characterStates as CharacterState[]).find((cs) => cs.characterId === char.id)
      : null;

    // StableVisualDNA : traits verrouillés
    const stableVisualDNA = char.stableVisualDNA as {
      hairColor?: string;
      eyeColor?: string;
      silhouette?: string;
      scars?: string[];
      tattoos?: string[];
      fixedAccessories?: string[];
      forbiddenVisualDrift?: string[];
    } | undefined;

    const characterState: CharacterState = {
      characterId: char.id,
      appearanceLocked: {
        hairColor: stableVisualDNA?.hairColor ?? char.hairColor ?? null,
        eyeColor: stableVisualDNA?.eyeColor ?? char.eyeColor ?? null,
        silhouette: stableVisualDNA?.silhouette ?? null,
        scars: stableVisualDNA?.scars ?? [],
        tattoos: stableVisualDNA?.tattoos ?? [],
        fixedAccessories: stableVisualDNA?.fixedAccessories ?? [],
        forbiddenVisualDrift: stableVisualDNA?.forbiddenVisualDrift ?? [],
      },
      currentState: prevState?.currentState ?? {
        location: null,
        outfit: char.outfitDefault ?? null,
        injuries: [],
        fatigue: null,
        emotion: char.emotionalState ?? null,
        objective: char.objective ?? null,
        possessions: [],
      },
      relationshipStates: [],
    };

    // Récupérer relationshipStates depuis les relations du projet
    const rels = project.relationships.filter((r) => r.sourceCharacterId === char.id);
    for (const rel of rels) {
      characterState.relationshipStates.push({
        targetCharacterId: rel.targetCharacterId,
        trust: null,
        tension: null,
        affection: null,
        fear: null,
        debt: null,
        dominance: null,
        note: rel.note,
      });
    }

    characterStates.push(characterState);
  }

  // OpenThreads : hérite du précédent (sera mis à jour par run-continuity-diff si besoin)
  const openThreads: OpenThread[] = previousCanonState?.openThreads
    ? (previousCanonState.openThreads as OpenThread[])
    : [];

  // ResolvedThreads : hérite du précédent
  const resolvedThreads: ResolvedThread[] = previousCanonState?.resolvedThreads
    ? (previousCanonState.resolvedThreads as ResolvedThread[])
    : [];

  // CanonEvents : événements survenus dans ce chapitre (sera enrichi par run-continuity-diff)
  const canonEvents: CanonEvent[] = [];

  const narrativeSummary = input.summary ?? input.cliffhanger ?? null;

  return {
    worldState,
    characterStates,
    openThreads,
    resolvedThreads,
    canonEvents,
    narrativeSummary,
    continuityWarnings: [],
  };
}

/**
 * Persiste le ChapterCanonState dans la DB après génération du chapitre.
 */
export async function persistChapterCanonState(
  prisma: PrismaClient,
  data: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    canonStateData: ChapterCanonStateData;
  },
): Promise<void> {
  await prisma.chapterCanonState.upsert({
    where: { chapterId: data.chapterId },
    create: {
      projectId: data.projectId,
      chapterId: data.chapterId,
      chapterNumber: data.chapterNumber,
      worldState: data.canonStateData.worldState as unknown as Record<string, unknown>,
      characterStates: data.canonStateData.characterStates as unknown as Array<unknown>,
      openThreads: data.canonStateData.openThreads as unknown as Array<unknown>,
      resolvedThreads: data.canonStateData.resolvedThreads as unknown as Array<unknown>,
      canonEvents: data.canonStateData.canonEvents as unknown as Array<unknown>,
      narrativeSummary: data.canonStateData.narrativeSummary,
      continuityWarnings: data.canonStateData.continuityWarnings as unknown as Array<unknown>,
    },
    update: {
      worldState: data.canonStateData.worldState as unknown as Record<string, unknown>,
      characterStates: data.canonStateData.characterStates as unknown as Array<unknown>,
      openThreads: data.canonStateData.openThreads as unknown as Array<unknown>,
      resolvedThreads: data.canonStateData.resolvedThreads as unknown as Array<unknown>,
      canonEvents: data.canonStateData.canonEvents as unknown as Array<unknown>,
      narrativeSummary: data.canonStateData.narrativeSummary,
      continuityWarnings: data.canonStateData.continuityWarnings as unknown as Array<unknown>,
    },
  });
}
