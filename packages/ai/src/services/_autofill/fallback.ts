/**
 * Fallback heuristique de l'autofill (utilisé quand `OPENAI_API_KEY`
 * est absent OU quand l'appel LLM échoue). Volontairement minimaliste :
 * on remplit ce qui peut l'être à partir des données projet déjà connues,
 * et on signale ce qui reste à valider via `unresolvedQuestions`.
 */
import type { AutofillMeta, ChapterStudioData } from "@manga-ai-studio/core";
import type { ProjectContextForChapter } from "../../chapter/shared-types";
import { extractAppliedFields } from "./patch-merger";
import type { AutofillMode, AutofillResult } from "./types";

export function buildFallbackAutofill(
  mode: AutofillMode,
  currentData: Partial<ChapterStudioData>,
  context: ProjectContextForChapter,
  missingFields: string[],
  now: string,
): AutofillResult {
  const patch: Partial<ChapterStudioData> = {};
  const assumptions: string[] = ["Complétion heuristique (OpenAI indisponible)."];
  const unresolvedQuestions: string[] = [];

  const chapterNumber = currentData.intent?.chapterNumber ?? 1;
  const lastChapter = context.recentChapters?.[context.recentChapters.length - 1];
  const firstChar = context.characters?.[0];
  const firstLocation = context.locations?.[0];

  if (missingFields.includes("intent.workingTitle")) {
    patch.intent = {
      ...patch.intent,
      workingTitle: `Chapitre ${chapterNumber}`,
    };
    assumptions.push("Titre généré par défaut depuis le numéro de chapitre.");
  }

  if (missingFields.includes("intent.shortPitch")) {
    const pitch = lastChapter?.cliffhanger
      ? `Suite du cliffhanger : ${lastChapter.cliffhanger.slice(0, 80)}`
      : `Nouveau chapitre de ${context.project.title ?? "la série"}`;
    patch.intent = { ...patch.intent, shortPitch: pitch };
    assumptions.push("Pitch généré depuis le cliffhanger précédent ou le titre du projet.");
  }

  if (missingFields.includes("intent.mainConflict")) {
    patch.intent = { ...patch.intent, mainConflict: "Conflit à préciser" };
    unresolvedQuestions.push("Quel est le conflit principal de ce chapitre ?");
  }

  if (missingFields.includes("characterSelection.heroCharacterId") && firstChar) {
    patch.characterSelection = {
      ...patch.characterSelection,
      heroCharacterId: firstChar.id,
      coreCastCharacterIds: [firstChar.id],
      activeCharacterIds: [],
      lockedCharacterIds: [],
      speakingCharacterIds: [],
      evolvingCharacterIds: [],
      antagonistCharacterIds: [],
      recurringNpcIds: [],
    };
    assumptions.push(
      `Héros assigné par défaut : ${firstChar.name} (premier personnage du projet).`,
    );
  }

  if (missingFields.includes("chapterCanon.currentLocation") && firstLocation) {
    patch.chapterCanon = {
      ...patch.chapterCanon,
      currentLocation: firstLocation.name,
      activeCharacters: [],
      allowedVisualChanges: [],
      injuries: [],
      carriedObjects: [],
      continuityNotes: [],
      inheritedFromPreviousChapter: true,
      universeConstraints: [],
    };
    assumptions.push(`Lieu assigné par défaut : ${firstLocation.name}.`);
  }

  if (missingFields.includes("chapterCanon.currentLocation") && !firstLocation) {
    unresolvedQuestions.push("Quel est le lieu principal de ce chapitre ?");
  }

  const appliedFields = extractAppliedFields(patch);
  const confidence = appliedFields.length > 0 ? 0.3 : 0;

  const meta: AutofillMeta = {
    source: "ai_autofill",
    generatedAt: now,
    mode,
    confidence,
    assumptions,
    appliedFields,
    unresolvedQuestions,
  };

  return {
    suggestedPatch: patch,
    assumptions,
    confidence,
    unresolvedQuestions,
    appliedFields,
    provenance: appliedFields.map((f) => ({
      field: f,
      source: "inference" as const,
      confidence: 0.3,
    })),
    meta,
  };
}
