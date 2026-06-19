/**
 * Reconstruit le `visualWorldContract` à partir de l'état courant du draft
 * (locationCanons + chapterEntities). Unifie les deux synchros partielles
 * pour que le contrat soit toujours à jour sans clic manuel.
 *
 * Si le draft n'a PAS de `locationCanons` mais possède déjà un
 * `visualWorldContract.locations`, on conserve les lieux existants
 * (cas : contrat hérité de la DB / fixture, pas encore édité par l'utilisateur).
 */
import type { ChapterStudioData, VisualWorldContract } from "@manga-ai-studio/core";
import { syncLocationCanonsToVisualWorld } from "./sync-location-canons-to-visual-world";
import { syncChapterEntitiesToVisualWorld } from "./sync-chapter-entities-to-visual-world";

export function rebuildVisualWorldContract(opts: {
  chapterId: string;
  draft: ChapterStudioData;
}): VisualWorldContract {
  const { chapterId, draft } = opts;

  const hasLocationCanons = Array.isArray(draft.locationCanons) && draft.locationCanons.length > 0;
  const hasExistingLocations =
    Array.isArray(draft.visualWorldContract?.locations) && draft.visualWorldContract!.locations.length > 0;

  let base: VisualWorldContract;
  if (hasLocationCanons) {
    base = syncLocationCanonsToVisualWorld({ chapterId, draft });
  } else if (hasExistingLocations) {
    base = draft.visualWorldContract!;
  } else {
    base = syncLocationCanonsToVisualWorld({ chapterId, draft });
  }

  const draftWithLocations: ChapterStudioData = {
    ...draft,
    visualWorldContract: base,
  };

  return syncChapterEntitiesToVisualWorld({
    chapterId,
    draft: draftWithLocations,
  });
}
