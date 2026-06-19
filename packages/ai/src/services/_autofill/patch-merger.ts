/**
 * Fusion respectueuse du patch autofill avec les données déjà saisies par
 * l'utilisateur, et extraction des champs réellement appliqués.
 */
import type { ChapterStudioData } from "@manga-ai-studio/core";

export function extractAppliedFields(patch: Partial<ChapterStudioData>): string[] {
  const fields: string[] = [];

  if (patch.intent) {
    for (const key of Object.keys(patch.intent)) {
      if ((patch.intent as Record<string, unknown>)[key] != null) {
        fields.push(`intent.${key}`);
      }
    }
  }
  if (patch.narrativeContract) fields.push("narrativeContract");
  if (patch.characterSelection) {
    for (const key of Object.keys(patch.characterSelection)) {
      const val = (patch.characterSelection as Record<string, unknown>)[key];
      if (val != null && (!Array.isArray(val) || val.length > 0)) {
        fields.push(`characterSelection.${key}`);
      }
    }
  }
  if (patch.chapterCanon) {
    for (const key of Object.keys(patch.chapterCanon)) {
      if ((patch.chapterCanon as Record<string, unknown>)[key] != null) {
        fields.push(`chapterCanon.${key}`);
      }
    }
  }
  if (patch.editorialOutline) fields.push("editorialOutline");
  if (patch.productionOutline) fields.push("productionOutline");
  if (patch.productionPlan) fields.push("productionPlan");
  if (patch.entityRegistry) fields.push("entityRegistry");
  if (patch.selectedPlotLabel) fields.push("selectedPlotLabel");

  return fields;
}

export function mergePatchRespectingExisting(
  current: Partial<ChapterStudioData>,
  suggested: Partial<ChapterStudioData>,
  force: boolean,
): Partial<ChapterStudioData> {
  if (force) return suggested;

  const merged: Partial<ChapterStudioData> = { ...suggested };

  if (current.intent && suggested.intent) {
    merged.intent = {
      ...suggested.intent,
      ...Object.fromEntries(
        Object.entries(current.intent).filter(([, v]) => v != null),
      ),
    } as typeof suggested.intent;
  }

  if (current.narrativeContract) {
    delete merged.narrativeContract;
  }

  if (current.characterSelection?.heroCharacterId && suggested.characterSelection) {
    merged.characterSelection = {
      ...suggested.characterSelection,
      heroCharacterId: current.characterSelection.heroCharacterId,
    };
  }

  if (current.chapterCanon?.currentLocation && suggested.chapterCanon) {
    merged.chapterCanon = {
      ...suggested.chapterCanon,
      currentLocation: current.chapterCanon.currentLocation,
    };
  }

  if (current.editorialOutline?.beats.length) delete merged.editorialOutline;
  if (current.productionOutline?.beats.length) delete merged.productionOutline;
  if (current.productionPlan) delete merged.productionPlan;

  return merged;
}
