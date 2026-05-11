/**
 * P5.2 — Navigation du ChapterStudio (flow + wizard chapitre 1).
 *
 * Encapsule trois callbacks :
 *   - `goToFlowStep(flow, fieldId?, studioOverride?)` : change de step flow,
 *     met à jour le wizard si chapter 1, et scrolle vers la cible.
 *   - `navigateWizardStep(id)` : déclenche la navigation depuis le wizard
 *     header (chapitre 1 uniquement). Auto-compile l'intent contract sur
 *     sortie de l'étape `intent`.
 *   - `useEffect` qui applique automatiquement `?wizard=…` à l'URL.
 */
import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { ChapterStudioData, ChapterStudioStep } from "@manga-ai-studio/core";
import {
  CHAPTER_WIZARD_STEP_ORDER,
  WIZARD_STEP_NAV,
  studioStepToWizardStepId,
  type ChapterWizardStepId,
} from "@/features/studio/wizard/chapter-wizard-model";
import { primaryStudioStepForFlowStep } from "./chapter-studio-helpers";
import type { ChapterFlowStepId } from "./chapter-studio-flow";

export interface UseChapterStudioNavigationArgs {
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
  loading: boolean;
  draft: ChapterStudioData | null;
  setActiveFlowStep: (step: ChapterFlowStepId) => void;
  setActiveStudioStep: (step: ChapterStudioStep) => void;
  updateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
}

export function useChapterStudioNavigation(args: UseChapterStudioNavigationArgs) {
  const {
    projectId,
    chapterId,
    chapterNumber,
    loading,
    draft,
    setActiveFlowStep,
    setActiveStudioStep,
    updateDraft,
  } = args;

  const searchParams = useSearchParams();
  const lastAppliedWizardParam = useRef<string | null>(null);

  useEffect(() => {
    lastAppliedWizardParam.current = null;
  }, [chapterId]);

  const goToFlowStep = useCallback(
    (flowStep: ChapterFlowStepId, fieldId?: string | null, stepOverride?: ChapterStudioStep) => {
      const nextStudio = stepOverride ?? primaryStudioStepForFlowStep(flowStep);
      setActiveFlowStep(flowStep);
      if (chapterNumber === 1 && draft) {
        const prevWizardId = draft.chapterWizard?.currentStep;
        const w = studioStepToWizardStepId(nextStudio, { draft, flowStep });
        const completedSet = new Set(draft.chapterWizard?.completedSteps ?? []);
        if (
          typeof prevWizardId === "string"
          && prevWizardId !== w
          && CHAPTER_WIZARD_STEP_ORDER.includes(prevWizardId as ChapterWizardStepId)
        ) {
          completedSet.add(prevWizardId);
        }
        updateDraft(
          {
            ...draft,
            chapterWizard: {
              currentStep: w,
              completedSteps: Array.from(completedSet),
              dismissedTips: draft.chapterWizard?.dismissedTips ?? [],
            },
          },
          nextStudio,
        );
      } else {
        setActiveStudioStep(nextStudio);
      }

      window.setTimeout(() => {
        if (fieldId) {
          const target = document.querySelector<HTMLElement>(`[data-studio-field="${fieldId}"]`);
          target?.scrollIntoView({ behavior: "smooth", block: "center" });
          target?.focus();
          return;
        }
        const section = document.querySelector<HTMLElement>(`[data-studio-section="${flowStep}"]`);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    },
    [chapterNumber, draft, setActiveFlowStep, setActiveStudioStep, updateDraft],
  );

  const navigateWizardStep = useCallback(
    (id: ChapterWizardStepId) => {
      if (chapterNumber !== 1 || !draft) return;
      const nav = WIZARD_STEP_NAV[id];
      const prevWizardId = draft.chapterWizard?.currentStep;
      const completedSet = new Set(draft.chapterWizard?.completedSteps ?? []);
      if (
        typeof prevWizardId === "string"
        && prevWizardId !== id
        && CHAPTER_WIZARD_STEP_ORDER.includes(prevWizardId as ChapterWizardStepId)
      ) {
        completedSet.add(prevWizardId);
      }

      // P2-3: Auto-compile intent contract when leaving "intent" step.
      if (prevWizardId === "intent" && id !== "intent" && !draft.chapterIntentContract && chapterId) {
        const pitch = draft.intent?.shortPitch?.trim();
        if (pitch && pitch.length >= 8) {
          fetch(`/api/projects/${projectId}/chapters/${chapterId}/intent-compile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shortPitch: pitch }),
          })
            .then(async (res) => {
              if (!res.ok) return;
              const json = (await res.json()) as { contract?: unknown };
              if (json.contract) {
                updateDraft({
                  ...draft,
                  chapterIntentContract: json.contract as NonNullable<typeof draft.chapterIntentContract>,
                });
              }
            })
            .catch(() => {
              /* non-blocking */
            });
        }
      }
      setActiveFlowStep(nav.flowStep);
      updateDraft(
        {
          ...draft,
          chapterWizard: {
            currentStep: id,
            completedSteps: Array.from(completedSet),
            dismissedTips: draft.chapterWizard?.dismissedTips ?? [],
          },
        },
        nav.studioStep,
      );
      window.setTimeout(() => {
        if (nav.scrollFieldId) {
          const target = document.querySelector<HTMLElement>(`[data-studio-field="${nav.scrollFieldId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.focus();
            return;
          }
        }
        const section = document.querySelector<HTMLElement>(`[data-studio-section="${nav.flowStep}"]`);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 160);
    },
    [chapterNumber, chapterId, draft, projectId, setActiveFlowStep, updateDraft],
  );

  // P1.3 — lien readiness `?wizard=plan` etc. : ouvre l'étape correspondante après chargement studio.
  useEffect(() => {
    if (loading || chapterNumber !== 1 || !draft) return;
    const w = searchParams.get("wizard");
    if (!w) return;
    if (!CHAPTER_WIZARD_STEP_ORDER.includes(w as ChapterWizardStepId)) return;
    if (lastAppliedWizardParam.current === w) return;
    lastAppliedWizardParam.current = w;
    navigateWizardStep(w as ChapterWizardStepId);
  }, [loading, chapterNumber, draft, searchParams, navigateWizardStep]);

  return { goToFlowStep, navigateWizardStep };
}
