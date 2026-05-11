/**
 * P5.2 — Helpers déterministes utilisés par `chapter-studio-editor.tsx`.
 *
 * Pas de hook, pas d'état React : juste des fonctions pures (mapping étape ↔
 * studio + builder du `narrativeContract` minimal auto-généré quand le user
 * n'en a pas encore créé un).
 */
import type { ChapterStudioData, ChapterStudioStep } from "@manga-ai-studio/core";
import type { ChapterFlowStepId } from "./chapter-studio-flow";

export function primaryStudioStepForFlowStep(flowStep: ChapterFlowStepId): ChapterStudioStep {
  if (flowStep === "brief") return "intent";
  if (flowStep === "cast_canon") return "characters";
  if (flowStep === "plan") return "production_plan";
  if (flowStep === "dialogues") return "production_plan";
  return "generation";
}

/**
 * Construit un `narrativeContract` minimal à partir de l'`intent` du draft.
 *
 * Sans contrat, le readiness check bloque toujours (étape narrative_contract
 * manquante). On hydrate donc un contrat valide tant que `intent.shortPitch`
 * existe — le user pourra l'éditer dans le studio avant lancement.
 */
export function buildAutoNarrativeContract(
  draft: Pick<ChapterStudioData, "intent" | "narrativeContract">,
): ChapterStudioData["narrativeContract"] | undefined {
  if (draft.narrativeContract) return draft.narrativeContract;
  const pitch = draft.intent?.shortPitch?.trim();
  if (!pitch) return undefined;

  return {
    emotionalGoal: draft.intent?.emotionalGoal ?? "Faire évoluer le héros face au conflit",
    heroStateAtStart: `Avant : ${pitch.slice(0, 60)}`,
    heroStateAtEnd: "Transformation après les événements du chapitre",
    centralConflict: draft.intent?.mainConflict ?? pitch,
    revealOrInformationGain: "",
    relationshipShift: "",
    chapterQuestion: `Comment le héros va-t-il traverser ${draft.intent?.workingTitle ?? "ce chapitre"} ?`,
    endingMode: "cliffhanger",
    tone: "dramatic",
    intensityCurve: [],
    forbiddenNarrativeMisses: [],
  };
}
