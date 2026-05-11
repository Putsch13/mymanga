"use client";

import { useMemo, useRef } from "react";
import { extractJobPipelineUserWarnings } from "@/lib/studio/job-output-warnings";
import {
  JOB_TERMINAL,
  type GenerationProgressJobSnapshot,
  type ImageStats,
} from "./generation-progress/types";
import { ProgressHeader } from "./generation-progress/progress-header";
import { ProgressProductChecklist } from "./generation-progress/progress-product-checklist";
import { ProgressPipelineWarnings } from "./generation-progress/progress-pipeline-warnings";
import { ProgressPipelineSteps } from "./generation-progress/progress-pipeline-steps";
import { ProgressStatsBar } from "./generation-progress/progress-stats-bar";
import {
  ProgressFocusPanel,
  pickFocusPanel,
} from "./generation-progress/progress-focus-panel";
import { ProgressPanelGrid } from "./generation-progress/progress-panel-grid";
import { ProgressCta } from "./generation-progress/progress-cta";
import { deriveProductChecklist } from "./generation-progress/derive-product-checklist";
import { useChapterProgressPoll } from "./generation-progress/use-chapter-progress-poll";
import { useElapsed, useEta } from "./generation-progress/use-elapsed-eta";

export type { GenerationProgressJobSnapshot } from "./generation-progress/types";

export interface GenerationProgressBoardProps {
  projectId?: string;
  chapterId?: string;
  initialStats?: Partial<ImageStats> | null;
  /** @deprecated Utiliser `initialStats` — conservé pour compat launcher historique. */
  stats?: Partial<ImageStats> | null;
  job?: GenerationProgressJobSnapshot | null;
  jobErrorMessage?: string | null;
  title?: string;
  progress?: number;
  currentStep?: string | null;
}

export function GenerationProgressBoard({
  projectId,
  chapterId,
  initialStats,
  stats,
  job,
  jobErrorMessage,
}: GenerationProgressBoardProps) {
  const mergedInitial = initialStats ?? stats ?? null;
  const jobRef = useRef(job);
  jobRef.current = job;

  const jobTerminal = job?.status ? JOB_TERMINAL.has(job.status) : false;
  const jobFailed = job?.status === "failed" || job?.status === "canceled";

  const {
    panels,
    imageStats,
    chapterFetchError,
    chapterPollActive,
    zeroPanelPollsRef,
  } = useChapterProgressPoll({
    projectId,
    chapterId,
    initialStatsTotal: mergedInitial?.total,
    jobTerminal,
    jobFailed,
    jobRef,
  });

  const completedPanels = useMemo(
    () => panels.filter((p) => p.status === "completed").length,
    [panels],
  );
  const failedPanels = useMemo(
    () => panels.filter((p) => p.status === "failed" || p.status === "blocked").length,
    [panels],
  );
  const pendingPanels = useMemo(
    () =>
      panels.filter(
        (p) => p.status === "pending" || p.status === "planned" || p.status === "generating",
      ).length,
    [panels],
  );

  const statsTotal = imageStats?.total ?? mergedInitial?.total ?? panels.length;
  const statsCompleted = imageStats?.completed ?? completedPanels;
  const statsFailed = imageStats?.failed ?? failedPanels;
  const statsPending = imageStats?.pending ?? pendingPanels;
  const statsGenerating =
    typeof imageStats?.generating === "number"
      ? imageStats.generating
      : panels.filter((p) => p.status === "generating").length;
  const statsLocked = imageStats?.locked ?? 0;
  const statsRetried = imageStats?.retried ?? 0;

  const effectiveTotal = Math.max(statsTotal || 0, panels.length);
  const progressPct =
    effectiveTotal > 0
      ? Math.round(((statsCompleted + statsFailed) / effectiveTotal) * 100)
      : 0;

  const jobRunning = Boolean(job && !jobTerminal);
  const isWorking = Boolean(projectId && chapterId) && (chapterPollActive || jobRunning);

  const elapsed = useElapsed(
    chapterPollActive || jobRunning,
    `${projectId ?? ""}::${chapterId ?? ""}`,
  );
  const { etaLabel } = useEta({ isWorking, elapsed, progressPct });

  const outcomePositive = statsCompleted + statsFailed > 0;
  const showEmptySuccessWarning =
    jobTerminal &&
    !jobFailed &&
    job?.status === "completed" &&
    effectiveTotal > 0 &&
    !outcomePositive &&
    zeroPanelPollsRef.current >= 6;

  const focusPanel = useMemo(() => pickFocusPanel(panels), [panels]);

  const steps = job?.output?.steps ?? [];
  const pipelineWarnings = useMemo(
    () => extractJobPipelineUserWarnings(job?.output ?? null),
    [job?.output],
  );

  const productChecklist = useMemo(
    () =>
      deriveProductChecklist({
        job,
        jobRunning,
        jobTerminal,
        jobFailed,
        currentStep: job?.output?.currentStep ?? null,
        statsCompleted,
        statsFailed,
        statsPending,
        statsGenerating,
        effectiveTotal,
      }),
    [
      job,
      jobRunning,
      jobTerminal,
      jobFailed,
      statsCompleted,
      statsFailed,
      statsPending,
      statsGenerating,
      effectiveTotal,
    ],
  );

  return (
    <div className="space-y-6" data-testid="generation-progress-board">
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <ProgressHeader
          isWorking={isWorking}
          jobFailed={jobFailed}
          jobTerminal={jobTerminal}
          showEmptySuccessWarning={showEmptySuccessWarning}
          elapsed={elapsed}
          etaLabel={etaLabel}
          jobErrorMessage={jobErrorMessage}
          jobError={job?.error ?? null}
          chapterFetchError={chapterFetchError}
        />

        {job ? <ProgressProductChecklist rows={productChecklist} /> : null}

        <ProgressPipelineWarnings warnings={pipelineWarnings} />

        {steps.length > 0 ? (
          <ProgressPipelineSteps
            steps={steps}
            currentStep={job?.output?.currentStep ?? null}
            effectiveTotal={effectiveTotal}
            statsCompleted={statsCompleted}
            progressPct={progressPct}
          />
        ) : job && !JOB_TERMINAL.has(job.status) ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Préparation du job… ({job.status})
          </p>
        ) : null}

        <ProgressStatsBar
          progressPct={progressPct}
          statsCompleted={statsCompleted}
          statsFailed={statsFailed}
          statsPending={statsPending}
          statsGenerating={statsGenerating}
          statsLocked={statsLocked}
          statsRetried={statsRetried}
          effectiveTotal={effectiveTotal}
        />
      </div>

      {isWorking ? <ProgressFocusPanel panel={focusPanel} /> : null}

      <ProgressPanelGrid panels={panels} />

      {!isWorking && projectId && chapterId ? (
        <ProgressCta
          projectId={projectId}
          chapterId={chapterId}
          statsFailed={statsFailed}
        />
      ) : null}
    </div>
  );
}
