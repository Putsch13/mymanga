import type { PrismaClient } from "@manga-ai-studio/db";
import type { ContinuationContext, CharacterState, OpenThread } from "./types";

/**
 * Construit le contexte de continuation pour le prochain chapitre.
 * Embarque automatiquement : previousCanonState, openThreads, unresolvedRelationshipTensions,
 * currentCharacterStates, activeWorldThreats, recentCanonTimelineEvents.
 */
export async function buildContinuationContext(
  prisma: PrismaClient,
  input: {
    projectId: string;
    fromChapterId: string;
  },
): Promise<ContinuationContext> {
  // Charger le chapitre précédent
  const previousChapter = await prisma.chapter.findUnique({
    where: { id: input.fromChapterId },
    include: {
      canonState: true,
    },
  });

  if (!previousChapter) {
    throw new Error("Previous chapter not found");
  }

  const canonState = previousChapter.canonState;

  // Previous summary
  const previousSummary =
    canonState?.narrativeSummary ?? previousChapter.summary ?? "Aucun résumé disponible.";

  // Active threads
  const openThreads = canonState?.openThreads
    ? (canonState.openThreads as OpenThread[])
    : [];
  const activeThreads = openThreads.map((thread) => thread.label);

  // Locked facts (from story bible + canon events)
  const lockedFacts: string[] = [];
  const storyBible = await prisma.storyBible.findUnique({
    where: { projectId: input.projectId },
  });
  if (storyBible?.lore) {
    if (typeof storyBible.lore === "string") {
      lockedFacts.push(storyBible.lore);
    } else if (typeof storyBible.lore === "object") {
      const loreObj = storyBible.lore as {
        hardRules?: Array<{ rule: string }>;
        worldFacts?: Array<{ fact: string; locked: boolean }>;
      };
      if (loreObj.hardRules) {
        lockedFacts.push(...loreObj.hardRules.map((r) => r.rule));
      }
      if (loreObj.worldFacts) {
        lockedFacts.push(...loreObj.worldFacts.filter((f) => f.locked).map((f) => f.fact));
      }
    }
  }

  // Canon events from previous chapter
  const canonEvents = canonState?.canonEvents ? (canonState.canonEvents as Array<{ description: string }>) : [];
  lockedFacts.push(...canonEvents.map((e) => e.description));

  // Current character goals and emotions
  const characterStates = canonState?.characterStates
    ? (canonState.characterStates as CharacterState[])
    : [];
  const currentCharacterGoals = characterStates.map((cs) => ({
    characterId: cs.characterId,
    goal: cs.currentState.objective ?? null,
  }));
  const currentCharacterEmotions = characterStates.map((cs) => ({
    characterId: cs.characterId,
    emotion: cs.currentState.emotion ?? null,
  }));

  // Unresolved conflicts (from openThreads with high priority)
  const unresolvedConflicts = openThreads
    .filter((thread) => thread.priority === "high")
    .map((thread) => thread.description);

  // Recent canon timeline events (last 5 events)
  const recentCanonEventsFromDB = await prisma.canonTimelineEvent.findMany({
    where: { projectId: input.projectId },
    orderBy: { chapterNumber: "desc" },
    take: 5,
  });
  const recentCanonEvents = recentCanonEventsFromDB.map((event) => event.description);

  // Visual anchors (from character canonical refs)
  const visualAnchors: string[] = [];
  const characters = await prisma.character.findMany({
    where: { projectId: input.projectId },
    include: { visualRefs: { where: { isPrimary: true } } },
  });
  characters.forEach((char) => {
    if (char.visualRefs.length > 0) {
      visualAnchors.push(`${char.name}: ref canon visuelle disponible`);
    }
  });

  return {
    previousSummary,
    activeThreads,
    lockedFacts,
    currentCharacterGoals,
    currentCharacterEmotions,
    unresolvedConflicts,
    recentCanonEvents,
    visualAnchors,
  };
}
