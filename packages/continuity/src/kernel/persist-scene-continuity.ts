/**
 * P5.2 — Persistance des événements de continuité validés.
 *
 * Extrait de `continuity-persistence-kernel.ts` :
 *   - `persistValidatedSceneContinuity` : crée un `ContinuityEvent` + un
 *     `CanonTimelineEvent` pour chaque event dérivé d'une scène validée.
 *
 * Utilise Prisma. Pas de validation supplémentaire ici — l'appelant doit
 * passer un `validation.accepted === true`.
 */
import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import type {
  ContinuityValidationResult,
  EventLedgerEntry,
  SceneSnapshot,
} from "../types";

/**
 * FIX-7 : nouveau scaling du `timelineOrder` pour éviter les collisions.
 *
 * Avant : `chapter * 1000 + scene * 10 + index` → collision dès qu'une scène
 * a 10+ events ou 100+ scènes. Maintenant : `chapter * 10000 + scene * 100 + index`
 * → autorise jusqu'à 100 events par scène et 100 scènes par chapitre.
 */
function computeTimelineOrder(
  chapterNumber: number,
  sceneNumber: number,
  index: number,
): number {
  return chapterNumber * 10_000 + sceneNumber * 100 + index;
}

export async function persistValidatedSceneContinuity(
  prisma: PrismaClient,
  input: {
    projectId: string;
    chapterId: string;
    chapterNumber: number;
    sceneId: string;
    sceneNumber: number;
    sceneSnapshot: SceneSnapshot;
    validation: ContinuityValidationResult;
    events: EventLedgerEntry[];
  },
): Promise<void> {
  if (input.events.length === 0) return;

  // FIX-4 (CRITIQUE) : ne JAMAIS laisser une création atomique partielle —
  // un crash entre `continuityEvent.create()` et `canonTimelineEvent.create()`
  // laissait les deux tables désynchronisées et `loadContinuityKernel`
  // mergeait une vue invisiblement incohérente. Une transaction garantit
  // l'atomicité des deux écritures par event.
  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < input.events.length; index++) {
      const event = input.events[index];
      await tx.continuityEvent.create({
        data: {
          projectId: input.projectId,
          chapterId: input.chapterId,
          eventType: event.eventType,
          summary: event.description,
          entities: {
            title: event.title,
            actorIds: event.actorIds,
            location: event.location,
            sceneId: input.sceneId,
            sceneNumber: input.sceneNumber,
            consequences: event.consequences,
            objectsGained: event.objectsGained,
            objectsLost: event.objectsLost,
            injuriesApplied: event.injuriesApplied,
            injuriesResolved: event.injuriesResolved,
            relationshipChanges: event.relationshipChanges,
            continuityFlags: event.continuityFlags,
          } as Prisma.InputJsonValue,
          importance:
            event.importance === "critical"
              ? 90
              : event.importance === "major"
                ? 70
                : 45,
          timelineOrder: computeTimelineOrder(
            input.chapterNumber,
            input.sceneNumber,
            index,
          ),
          permanent: event.irreversible,
        },
      });
      await tx.canonTimelineEvent.create({
        data: {
          projectId: input.projectId,
          chapterId: input.chapterId,
          sceneId: input.sceneId,
          chapterNumber: input.chapterNumber,
          eventType: event.eventType,
          subjectCharacterId: event.actorIds[0] ?? null,
          title: event.title,
          description: event.description,
          importance: event.importance,
          irreversible: event.irreversible,
          metadata: {
            location: event.location,
            consequences: event.consequences,
            objectsGained: event.objectsGained,
            objectsLost: event.objectsLost,
            injuriesApplied: event.injuriesApplied,
            injuriesResolved: event.injuriesResolved,
            relationshipChanges: event.relationshipChanges,
            continuityFlags: event.continuityFlags,
          } as Prisma.InputJsonValue,
        },
      });
    }
  });
}
