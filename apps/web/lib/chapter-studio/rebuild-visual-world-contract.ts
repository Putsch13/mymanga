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

  const result = syncChapterEntitiesToVisualWorld({
    chapterId,
    draft: draftWithLocations,
  });

  // FILET DE SÉCURITÉ — le launch premium bloque (LOCATION_CANON_REQUIRED) si le
  // monde visuel a 0 lieu. Le flux conversationnel ne capte pas toujours un lieu
  // explicite (requiredLocations=0). On dérive alors un lieu principal depuis le
  // setting/era de l'intention pour ne JAMAIS bloquer la génération.
  if (!Array.isArray(result.locations) || result.locations.length === 0) {
    const contract = draft.chapterIntentContract as
      | { setting?: string | null; era?: string | null; understoodPitch?: string | null }
      | undefined;
    const setting = (contract?.setting ?? "").trim();
    const era = (contract?.era ?? "").trim();
    const label = setting || (era ? `Décor (${era})` : "Lieu principal");
    const description =
      [setting, era ? `époque ${era}` : ""].filter(Boolean).join(", ") ||
      (contract?.understoodPitch ?? "").trim().slice(0, 120) ||
      "Décor principal du chapitre";
    return {
      ...result,
      locations: [
        {
          id: "loc_fallback_main",
          label,
          kind: "scene",
          description,
          visualAnchors: [],
          architecture: [],
          lighting: [],
          atmosphere: [],
          recurringProps: [],
          negativeConstraints: [],
          source: "ai_generated",
          canonPolicy: "promote_candidate",
        },
      ],
    };
  }

  return result;
}
