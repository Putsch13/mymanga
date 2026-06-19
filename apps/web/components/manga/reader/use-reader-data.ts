"use client";

/**
 * Hook qui encapsule le chargement, l'auto-refresh et le retry panel pour
 * `MangaBookReader`. Il regroupe les fetches, l'état "data" du chapitre,
 * et le polling tant qu'un job actif est en cours.
 *
 * Extrait de `manga-book-reader.tsx` pour réduire le composant principal
 * et isoler la logique I/O.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  CanonStateData,
  ChapterPayload,
  ReaderResponse,
} from "./reader-types";

export type RetryPanelMode = "environment" | "character" | "composition";

export interface UseReaderDataInput {
  projectId: string;
  chapterId: string;
  /** Appelé au reset du chapitre (changement de chapitre) — équivalent à
   *  `setPageIndex(0)` + `setShowEnd(false)` dans le composant parent.  */
  onChapterLoaded?: (options: { preserveIndex: boolean }) => void;
  /** Appelé quand le format projet est connu (premier load uniquement,
   *  sauf si `skipModeInit: true`). */
  onProjectFormatDetected?: (format: "manga" | "webtoon") => void;
}

export interface UseReaderDataResult {
  chapter: ChapterPayload | null;
  memorySummary: string | null;
  imageStats: ReaderResponse["imageStats"];
  activeJob: ReaderResponse["activeJob"];
  generationDiagnostics: ReaderResponse["generationDiagnostics"];
  canonState: CanonStateData | null;
  loadError: string | null;
  retryingPanel: string | null;
  load: (options?: { preserveIndex?: boolean; skipModeInit?: boolean }) => Promise<void>;
  retryPanel: (panelId: string, mode: RetryPanelMode) => Promise<void>;
}

export function useReaderData(input: UseReaderDataInput): UseReaderDataResult {
  const { projectId, chapterId, onChapterLoaded, onProjectFormatDetected } = input;

  const [chapter, setChapter] = useState<ChapterPayload | null>(null);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  const [imageStats, setImageStats] = useState<ReaderResponse["imageStats"]>(null);
  const [activeJob, setActiveJob] = useState<ReaderResponse["activeJob"]>(null);
  const [generationDiagnostics, setGenerationDiagnostics] =
    useState<ReaderResponse["generationDiagnostics"]>(null);
  const [canonState, setCanonState] = useState<CanonStateData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryingPanel, setRetryingPanel] = useState<string | null>(null);

  const load = useCallback(
    async (options?: { preserveIndex?: boolean; skipModeInit?: boolean }) => {
      setLoadError(null);
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`);
      if (!res.ok) {
        setLoadError("Chapitre introuvable");
        return;
      }
      const j = (await res.json()) as ReaderResponse;
      setChapter(j.chapter);
      setMemorySummary(j.memorySnapshot?.narrativeSummary ?? null);
      setImageStats(j.imageStats ?? null);
      setActiveJob(j.activeJob ?? null);
      setGenerationDiagnostics(j.generationDiagnostics ?? null);
      onChapterLoaded?.({ preserveIndex: options?.preserveIndex === true });
      // PHASE 5: initialiser le mode lecteur basé sur le format du projet.
      if (!options?.skipModeInit && j.projectFormat) {
        onProjectFormatDetected?.(j.projectFormat);
        console.info(
          "[reader] projectFormat",
          j.projectFormat,
          "initialMode",
          j.projectFormat,
        );
      }
      // Charger le canon state en parallèle.
      fetch(`/api/projects/${projectId}/chapters/${chapterId}/canon-state`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setCanonState(data as CanonStateData))
        .catch(() => setCanonState(null));
    },
    [projectId, chapterId, onChapterLoaded, onProjectFormatDetected],
  );

  const retryPanel = useCallback(
    async (panelId: string, mode: RetryPanelMode) => {
      setRetryingPanel(`${panelId}:${mode}`);
      try {
        // BUG-READER-C : on passe désormais `mode` en body JSON plutôt qu'en
        // query string. Le endpoint /retry supporte les deux pendant la
        // transition mais le body est la voie officielle (BUG-13/BUG-14).
        const res = await fetch(`/api/scene-images/${panelId}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        if (res.ok) {
          await load({ preserveIndex: true, skipModeInit: true });
        }
      } finally {
        setRetryingPanel(null);
      }
    },
    [load],
  );

  // Initial fetch.
  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh pendant une génération d'images / pipeline pour éviter
  // le besoin de refresh manuel.
  useEffect(() => {
    if (!activeJob) return;
    if (!["queued", "running", "waiting_external"].includes(activeJob.status)) return;
    const interval = window.setInterval(() => {
      void load({ preserveIndex: true, skipModeInit: true });
    }, 2500);
    return () => window.clearInterval(interval);
  }, [activeJob, load]);

  return {
    chapter,
    memorySummary,
    imageStats,
    activeJob,
    generationDiagnostics,
    canonState,
    loadError,
    retryingPanel,
    load,
    retryPanel,
  };
}
