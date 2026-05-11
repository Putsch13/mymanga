/**
 * P5.2 — Construction d'un `ChapterSnapshot` + projection en `ChapterCanonStateData`.
 *
 * Extrait de `continuity-persistence-kernel.ts` :
 *   - `buildChapterSnapshot` : aggrège kernel + scène snapshots + warnings.
 *   - `materializeCanonStateFromChapterSnapshot` : projette le snapshot
 *     en `ChapterCanonStateData` persistable.
 */
import type {
  ChapterCanonStateData,
  ChapterSnapshot,
  ContinuityKernel,
  SceneSnapshot,
} from "../types";
import { uniq } from "./utils";
import { capEventLogPreservingIrreversible } from "./event-log-cap";

export function buildChapterSnapshot(input: {
  kernel: ContinuityKernel;
  chapterId: string;
  chapterNumber: number;
  title?: string | null;
  summary?: string | null;
  sceneSnapshots: SceneSnapshot[];
  continuityWarnings: string[];
}): ChapterSnapshot {
  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title: input.title ?? null,
    summary: input.summary ?? null,
    storyBible: input.kernel.storyBible,
    worldState: input.kernel.worldState,
    characterStates: input.kernel.characterStates,
    locationStates: input.kernel.locationStates,
    relationshipGraph: input.kernel.relationshipGraph,
    // FIX-3 : ne JAMAIS perdre un event irréversible (death, etc.) lors du cap.
    eventLog: capEventLogPreservingIrreversible(input.kernel.eventLog, 40),
    arcRegistry: input.kernel.arcRegistry,
    sceneSnapshots: input.sceneSnapshots,
    continuityWarnings: input.continuityWarnings,
  };
}

export function materializeCanonStateFromChapterSnapshot(
  canonStateData: ChapterCanonStateData,
  chapterSnapshot: ChapterSnapshot,
): ChapterCanonStateData {
  return {
    ...canonStateData,
    worldState: chapterSnapshot.worldState,
    characterStates: chapterSnapshot.characterStates,
    canonEvents: chapterSnapshot.eventLog.map((event) => ({
      type:
        event.eventType === "injury"
          ? "injury"
          : event.eventType === "location_change"
            ? "location_change"
            : event.eventType === "inventory_change"
              ? "reveal"
              : "reveal",
      subjectId: event.actorIds[0] ?? null,
      description: event.description,
      irreversible: event.irreversible,
    })),
    continuityWarnings: uniq([
      ...(canonStateData.continuityWarnings ?? []),
      ...chapterSnapshot.continuityWarnings,
    ]),
  };
}
