/**
 * Hook orchestrant les appels API du board de review chapitre :
 * GET QA report, POST retry, POST validate, POST review/complete.
 *
 * Maintient un état de validation panel optimiste (`validatedPanels`) pour
 * éviter de bloquer l'UI sur le round-trip réseau, avec rollback en cas
 * d'échec serveur.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { QAReportResponse, ReviewReport } from "./types";

export interface UseReviewBoardArgs {
  projectId: string;
  chapterId: string;
}

export interface UseReviewBoardResult {
  report: ReviewReport | null;
  loading: boolean;
  actionMessage: string | null;
  setActionMessage: (msg: string | null) => void;
  reviewError: string | null;
  comparePanels: Record<string, boolean>;
  toggleCompare: (panelId: string) => void;
  validatedPanels: Record<string, boolean>;
  refresh: () => Promise<void>;
  rerollPanel: (panelId: string, mode?: string) => Promise<void>;
  validatePanel: (panelId: string, validated: boolean) => Promise<void>;
  completeReview: () => Promise<void>;
}

export function useReviewBoard(args: UseReviewBoardArgs): UseReviewBoardResult {
  const { projectId, chapterId } = args;

  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [comparePanels, setComparePanels] = useState<Record<string, boolean>>({});
  const [validatedPanels, setValidatedPanels] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/qa-report`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as QAReportResponse;
      setReport(data.report);
    } finally {
      setLoading(false);
    }
  }, [chapterId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleCompare = useCallback((panelId: string) => {
    setComparePanels((value) => ({ ...value, [panelId]: !value[panelId] }));
  }, []);

  const rerollPanel = useCallback(
    async (panelId: string, mode = "character") => {
      setActionMessage(null);
      // BUG-14 : on utilise désormais le body JSON plutôt que la query string.
      const response = await fetch(`/api/scene-images/${panelId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        ok?: boolean;
      };
      setActionMessage(
        response.ok
          ? `Reroll ${mode} lancé pour ${panelId}.`
          : data.message ?? data.error ?? "Le reroll a échoué.",
      );
      await refresh();
    },
    [refresh],
  );

  const validatePanel = useCallback(
    async (panelId: string, validated: boolean) => {
      setActionMessage(null);
      // Optimistic update — instantané côté UI, reconcilié après refresh.
      setValidatedPanels((value) => ({ ...value, [panelId]: validated }));
      const response = await fetch(`/api/scene-images/${panelId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validated }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        ok?: boolean;
      };
      if (!response.ok) {
        setValidatedPanels((value) => ({ ...value, [panelId]: !validated }));
        setActionMessage(data.message ?? data.error ?? "La validation a échoué.");
        return;
      }
      setActionMessage(
        validated
          ? `Case ${panelId} validée (protégée des regens globales).`
          : `Validation retirée pour ${panelId}.`,
      );
    },
    [],
  );

  const completeReview = useCallback(async () => {
    setActionMessage(null);
    setReviewError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/review/complete`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        details?: unknown;
      };
      if (response.ok) {
        setReviewError(null);
        setActionMessage("Revue clôturée.");
      } else {
        setReviewError(data.message ?? data.error ?? "La clôture de review a échoué.");
      }
    } catch {
      setReviewError("Impossible de joindre le serveur. Réessaie dans un instant.");
    }
    await refresh();
  }, [chapterId, projectId, refresh]);

  return {
    report,
    loading,
    actionMessage,
    setActionMessage,
    reviewError,
    comparePanels,
    toggleCompare,
    validatedPanels,
    refresh,
    rerollPanel,
    validatePanel,
    completeReview,
  };
}
