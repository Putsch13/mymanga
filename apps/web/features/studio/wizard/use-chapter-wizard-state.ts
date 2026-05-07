"use client";

import { useMemo } from "react";
import type { ChapterReadinessReport, ChapterStudioData } from "@manga-ai-studio/core";
import {
  CHAPTER_WIZARD_STEP_ORDER,
  deriveWizardStepStatuses,
  type ChapterWizardDeriveExtras,
  type ChapterWizardStepId,
  type WizardStepUiStatus,
  WIZARD_STEP_LABELS,
} from "./chapter-wizard-model";

export type ChapterWizardStepVm = {
  id: ChapterWizardStepId;
  label: string;
  status: WizardStepUiStatus;
  isCurrent: boolean;
  /** Étapes déjà quittées depuis le wizard (persistées dans `chapterWizard.completedSteps`). */
  visited: boolean;
};

function normalizeCurrentStepId(raw: string | undefined | null): ChapterWizardStepId {
  if (raw && CHAPTER_WIZARD_STEP_ORDER.includes(raw as ChapterWizardStepId)) return raw as ChapterWizardStepId;
  return "intent";
}

export function useChapterWizardState(input: {
  draft: ChapterStudioData | null;
  liveReadiness: ChapterReadinessReport | null;
  chapterNumber: number | null;
  wizardExtras: ChapterWizardDeriveExtras | null;
}): {
  steps: ChapterWizardStepVm[];
  currentStepId: ChapterWizardStepId;
  statuses: Record<ChapterWizardStepId, WizardStepUiStatus> | null;
} {
  return useMemo(() => {
    if (!input.draft) {
      return { steps: [], currentStepId: "intent", statuses: null };
    }
    const statuses = deriveWizardStepStatuses(
      input.draft,
      input.liveReadiness,
      input.chapterNumber === 1 ? input.wizardExtras : null,
    );
    const visitedSet = new Set(input.draft.chapterWizard?.completedSteps ?? []);
    const currentStepId = normalizeCurrentStepId(input.draft.chapterWizard?.currentStep);
    const steps = CHAPTER_WIZARD_STEP_ORDER.map((id) => ({
      id,
      label: WIZARD_STEP_LABELS[id],
      status: statuses[id],
      isCurrent: id === currentStepId,
      visited: visitedSet.has(id),
    }));
    return { steps, currentStepId, statuses };
  }, [input.draft, input.liveReadiness, input.chapterNumber, input.wizardExtras]);
}
