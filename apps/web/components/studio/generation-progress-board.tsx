"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, Sparkles, XCircle } from "lucide-react";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";

interface PanelStatus {
  id: string;
  panelNumber: number;
  sceneNumber: number;
  status: "pending" | "generating" | "completed" | "failed";
  imageUrl?: string | null;
  persistedUrl?: string | null;
}

export function GenerationProgressBoard({
  projectId,
  chapterId,
  initialStats,
}: {
  projectId?: string;
  chapterId?: string;
  initialStats?: { total?: number; completed?: number; failed?: number; pending?: number } | null;
  // Compat avec l'ancienne API (props statiques)
  title?: string;
  progress?: number;
  currentStep?: string | null;
  stats?: { total?: number; completed?: number; failed?: number; pending?: number } | null;
}) {
  const [panels, setPanels] = useState<PanelStatus[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [isPolling, setIsPolling] = useState(!!(projectId && chapterId));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(Date.now());

  // Polling toutes les 3 secondes si projectId + chapterId fournis
  useEffect(() => {
    if (!projectId || !chapterId) return;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          chapter?: { scenes?: Array<{ sceneNumber: number; images?: PanelStatus[] }> };
        };

        const newPanels: PanelStatus[] = (data.chapter?.scenes ?? []).flatMap((scene) =>
          (scene.images ?? []).map((img) => ({
            ...img,
            sceneNumber: scene.sceneNumber,
          })),
        );
        setPanels(newPanels);

        const allDone =
          newPanels.length > 0 &&
          newPanels.every((p) => p.status === "completed" || p.status === "failed");
        if (allDone) setIsPolling(false);
      } catch {
        // silently ignore network errors during polling
      }
    }

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectId, chapterId]);

  // Timer
  useEffect(() => {
    if (!isPolling) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [isPolling]);

  const completed = panels.filter((p) => p.status === "completed").length;
  const failed = panels.filter((p) => p.status === "failed").length;
  const total = panels.length || initialStats?.total || 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="space-y-6">
      {/* Header avec progression */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPolling ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            <span className="text-sm font-medium">
              {isPolling ? "Génération en cours…" : "Génération terminée"}
            </span>
          </div>
          {elapsed > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          )}
        </div>

        {/* Barre de progression */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-rose-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-emerald-400">{completed}</span> générées
          </span>
          {failed > 0 && (
            <span>
              <span className="font-medium text-red-400">{failed}</span> échecs
            </span>
          )}
          <span>
            <span className="font-medium text-white/70">{total}</span> total
          </span>
          <span className="ml-auto font-medium text-accent">{progress}%</span>
        </div>
      </div>

      {/* Grille des panels */}
      {panels.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border/60 bg-card/40"
            >
              {panel.status === "completed" && getStableImageUrl(panel) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getStableImageUrl(panel) ?? ""}
                  alt={`Panel ${panel.panelNumber}`}
                  className="h-full w-full object-cover"
                />
              ) : panel.status === "failed" ? (
                <div className="flex h-full items-center justify-center">
                  <XCircle className="h-4 w-4 text-red-400" />
                </div>
              ) : panel.status === "generating" ? (
                <div className="panel-pulse flex h-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Clock className="h-3 w-3 text-muted-foreground/40" />
                </div>
              )}
              <div className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] text-white/70">
                {panel.panelNumber}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions post-génération */}
      {!isPolling && projectId && chapterId && (
        <div className="flex flex-wrap gap-3">
          <a
            href={`/projects/${projectId}/chapters/${chapterId}/read`}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/80"
          >
            <Sparkles className="h-4 w-4" />
            Lire le chapitre
          </a>
          {failed > 0 && (
            <span className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground">
              {failed} panel{failed > 1 ? "s" : ""} en échec — relance la génération
            </span>
          )}
        </div>
      )}
    </div>
  );
}
