/**
 * Helpers déterministes pour le Chapter Studio.
 */
import type { ChapterStudioData, ChapterStudioStep } from "@manga-ai-studio/core";
import type { ChapterFlowStepId } from "./chapter-studio-flow";

export function primaryStudioStepForFlowStep(flowStep: ChapterFlowStepId): ChapterStudioStep {
  switch (flowStep) {
    case "characters":
      return "characters";
    case "story":
      return "intent";
    case "locations":
    case "living_world":
      return "canon";
    case "plan":
    case "dialogues":
      return "production_plan";
    case "generation_review":
      return "generation";
    default:
      return "intent";
  }
}

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
