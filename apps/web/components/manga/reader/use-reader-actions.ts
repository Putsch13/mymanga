/**
 * P5.2 — Hook : actions secondaires du reader (continuation IA + export PDF).
 *
 * `submitContinue(quickTag?)` : déclenche la création du chapitre suivant
 * sur intention libre ou tag rapide. Redirige vers le nouveau chapitre.
 *
 * `exportChapter()` : appelle `/api/chapters/[id]/export/pdf` et déclenche
 * le download côté client.
 */
import { useCallback, useState } from "react";

export interface UseReaderActionsArgs {
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
  intent: string;
}

export function useReaderActions(args: UseReaderActionsArgs) {
  const { projectId, chapterId, chapterNumber, intent } = args;

  const [continuing, setContinuing] = useState(false);
  const [continueMsg, setContinueMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const submitContinue = useCallback(
    async (quickTag?: string) => {
      const text = intent.trim();
      if (!text && !quickTag) return;
      setContinuing(true);
      setContinueMsg(null);
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIntent: text || `Préférence : ${quickTag}`, quickTag }),
      });
      const j = (await res.json()) as { message?: string; nextChapterId?: string };
      setContinuing(false);
      if (!res.ok) {
        setContinueMsg(j.message ?? "Erreur");
        return;
      }
      setContinueMsg(j.message ?? "OK");
      if (j.nextChapterId) {
        window.location.href = `/projects/${projectId}/chapters/${j.nextChapterId}/read`;
      }
    },
    [chapterId, intent, projectId],
  );

  const exportChapter = useCallback(async (): Promise<boolean> => {
    setExporting(true);
    const res = await fetch(`/api/chapters/${chapterId}/export/pdf`, { method: "POST" });
    setExporting(false);
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chapter-${chapterNumber ?? chapterId}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
    return true;
  }, [chapterId, chapterNumber]);

  return {
    continuing,
    continueMsg,
    setContinueMsg,
    exporting,
    submitContinue,
    exportChapter,
  };
}
