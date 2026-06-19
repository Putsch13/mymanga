import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

/**
 * Retourne l'état canonique du chapitre (ChapterCanonState) et les fils narratifs ouverts.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      canonState: true,
    },
  });

  if (!chapter) return notFound();

  const canonState = chapter.canonState;

  if (!canonState) {
    return NextResponse.json({
      hasCanonState: false,
      message: "Aucun état canonique disponible (génération en cours ou chapitre sans canon state).",
    });
  }

  // Charger les personnages pour mapper characterId -> name
  const characters = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const charNameById = new Map(characters.map((c) => [c.id, c.name]));

  const worldState = canonState.worldState as {
    activeLocations?: string[];
    activeThreats?: string[];
    activeMysteries?: string[];
  };

  const openThreads = canonState.openThreads as Array<{
    id: string;
    label: string;
    description: string;
    priority: string;
    introducedAtChapter: number;
  }>;

  const characterStates = canonState.characterStates as Array<{
    characterId: string;
    currentState: {
      location?: string;
      outfit?: string;
      injuries?: string[];
      emotion?: string;
      objective?: string;
    };
  }>;

  const canonEvents = canonState.canonEvents as Array<{
    type: string;
    subjectId?: string;
    description: string;
    irreversible: boolean;
  }>;

  const continuityWarnings = canonState.continuityWarnings as string[];

  return NextResponse.json({
    hasCanonState: true,
    worldState: {
      activeLocations: worldState.activeLocations ?? [],
      activeThreats: worldState.activeThreats ?? [],
      activeMysteries: worldState.activeMysteries ?? [],
    },
    openThreads: openThreads.map((thread) => ({
      label: thread.label,
      description: thread.description,
      priority: thread.priority,
      introducedAtChapter: thread.introducedAtChapter,
    })),
    characterStates: characterStates.map((cs) => ({
      characterName: charNameById.get(cs.characterId) ?? "Unknown",
      currentState: cs.currentState,
    })),
    canonEvents: canonEvents.map((event) => ({
      type: event.type,
      subjectName: event.subjectId ? charNameById.get(event.subjectId) ?? "Unknown" : null,
      description: event.description,
      irreversible: event.irreversible,
    })),
    continuityWarnings,
  });
}
