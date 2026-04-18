/**
 * P5.5 — Polling du statut job de génération chapitre.
 *
 * Extraction stricte de la logique useEffect existante : backoff exponentiel,
 * redirect auto vers le reader à la fin, gestion 401/403, `router.refresh()`.
 *
 * Retourne uniquement un setter public `setJobState` + redirection policy.
 * On laisse la page décider d'appeler `loadChapters`.
 */

"use client";

import { useEffect, useRef } from "react";
import type { useRouter } from "next/navigation";
import type { PipelineJobState } from "./pipeline-types";

export type PipelineJobPollingInput = {
  projectId: string;
  chapterId: string;
  jobId: string | null;
  router: ReturnType<typeof useRouter>;
  setJobState: (state: PipelineJobState) => void;
  setPipelineMsg: (msg: string | null) => void;
  onJobFinished: () => void;
};

export function usePipelineJobPolling(input: PipelineJobPollingInput): void {
  const { projectId, chapterId, jobId, router, setJobState, setPipelineMsg, onJobFinished } = input;
  const autoReaderNavigatedRef = useRef(false);

  useEffect(() => {
    autoReaderNavigatedRef.current = false;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let timeoutId: number;
    let delay = 2000;
    let stopped = false;

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            stopped = true;
            setPipelineMsg("Session expirée. Recharge la page.");
            return;
          }
          delay = Math.min(delay * 1.5, 15000);
          timeoutId = window.setTimeout(poll, delay);
          return;
        }
        const json = await res.json();
        setJobState(json.job);
        if (["completed", "failed", "partial_success", "canceled"].includes(json.job.status)) {
          stopped = true;
          onJobFinished();
          router.refresh();
          if (
            (json.job.status === "completed" || json.job.status === "partial_success") &&
            chapterId &&
            !autoReaderNavigatedRef.current
          ) {
            autoReaderNavigatedRef.current = true;
            window.setTimeout(() => {
              window.location.assign(`/projects/${projectId}/chapters/${chapterId}/read?fresh=1`);
            }, 500);
          }
          return;
        }
        if (json.job.status === "running") {
          delay = Math.min(delay * 1.3, 12000);
        } else {
          delay = 2000;
        }
      } catch {
        delay = Math.min(delay * 2, 15000);
      }
      timeoutId = window.setTimeout(poll, delay);
    }

    timeoutId = window.setTimeout(poll, delay);
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, [projectId, chapterId, jobId, router, setJobState, setPipelineMsg, onJobFinished]);
}
