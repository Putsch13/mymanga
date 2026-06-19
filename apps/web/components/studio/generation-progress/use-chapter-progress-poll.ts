/**
 * Hook de polling du chapitre pendant la génération.
 *
 * - GET `/api/projects/:projectId/chapters/:chapterId` toutes les 3s
 * - Met à jour `panels` + `imageStats`
 * - Arrête le polling intelligemment quand :
 *     - le job a échoué (terminal + failed),
 *     - le job est terminé avec succès et tous les panels sont settled,
 *     - le chapitre est settled localement et il n'y a pas de job actif.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageStats, PanelStatus, GenerationProgressJobSnapshot } from "./types";

export interface UseChapterProgressPollArgs {
  projectId?: string;
  chapterId?: string;
  initialStatsTotal: number | undefined;
  jobTerminal: boolean;
  jobFailed: boolean;
  jobRef: { current: GenerationProgressJobSnapshot | null | undefined };
}

export interface UseChapterProgressPollResult {
  panels: PanelStatus[];
  imageStats: ImageStats | null;
  chapterFetchError: string | null;
  chapterPollActive: boolean;
  zeroPanelPollsRef: { current: number };
}

export function useChapterProgressPoll(
  args: UseChapterProgressPollArgs,
): UseChapterProgressPollResult {
  const { projectId, chapterId, initialStatsTotal, jobTerminal, jobFailed, jobRef } = args;

  const [panels, setPanels] = useState<PanelStatus[]>([]);
  const [imageStats, setImageStats] = useState<ImageStats | null>(null);
  const [chapterFetchError, setChapterFetchError] = useState<string | null>(null);
  const [chapterPollActive, setChapterPollActive] = useState(() =>
    Boolean(projectId && chapterId),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zeroPanelPollsRef = useRef(0);

  useEffect(() => {
    setChapterPollActive(Boolean(projectId && chapterId));
    if (projectId && chapterId) {
      zeroPanelPollsRef.current = 0;
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    if (!projectId || !chapterId || !chapterPollActive) return;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setChapterFetchError(`HTTP ${res.status}`);
          return;
        }
        setChapterFetchError(null);
        const data = (await res.json()) as {
          chapter?: { scenes?: Array<{ sceneNumber: number; images?: PanelStatus[] }> };
          imageStats?: ImageStats;
        };

        if (data.imageStats) {
          setImageStats(data.imageStats);
        }

        const newPanels: PanelStatus[] = (data.chapter?.scenes ?? []).flatMap((scene) =>
          (scene.images ?? []).map((img) => ({
            ...img,
            sceneNumber: scene.sceneNumber,
          })),
        );
        setPanels(newPanels);

        const pendingDb = newPanels.filter(
          (p) =>
            p.status === "pending" || p.status === "planned" || p.status === "generating",
        ).length;
        const settledDb =
          newPanels.length === 0 ||
          newPanels.every(
            (p) =>
              p.status === "completed" || p.status === "failed" || p.status === "blocked",
          );

        const pending = data.imageStats?.pending ?? pendingDb;

        if (jobTerminal && jobFailed) {
          setChapterPollActive(false);
          return;
        }

        if (jobTerminal && !jobFailed) {
          const hasOutcome = data.imageStats
            ? data.imageStats.completed + data.imageStats.failed > 0
            : newPanels.some((p) => p.status === "completed" || p.status === "failed");
          const done = pending === 0 && settledDb && hasOutcome;
          if (done) {
            setChapterPollActive(false);
            return;
          }
          const planned = Math.max(
            data.imageStats?.total ?? 0,
            initialStatsTotal ?? 0,
            newPanels.length,
          );
          if (!hasOutcome && planned > 0) {
            zeroPanelPollsRef.current += 1;
          }
          return;
        }

        if (!jobRef.current && settledDb && newPanels.length > 0 && pendingDb === 0) {
          setChapterPollActive(false);
          return;
        }

        if (!jobRef.current && newPanels.length === 0 && (initialStatsTotal ?? 0) === 0) {
          setChapterPollActive(false);
        }
      } catch {
        setChapterFetchError("Réseau");
      }
    }

    void poll();
    intervalRef.current = setInterval(() => void poll(), 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [
    projectId,
    chapterId,
    chapterPollActive,
    jobTerminal,
    jobFailed,
    initialStatsTotal,
    jobRef,
  ]);

  return { panels, imageStats, chapterFetchError, chapterPollActive, zeroPanelPollsRef };
}
