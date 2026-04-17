"use client";

/**
 * DIFF-2 — Panel-level editing UI.
 *
 * Overlay léger qui s'affiche au survol d'un panel (mode editable) et permet :
 *   - Redraw frame       → relance la génération du panel (POST /retry)
 *   - Redraw as closeup  → relance en forçant shotType=closeup
 *   - Redraw as wide     → relance en forçant shotType=wide
 *   - Toggle bubbles     → masque/affiche les bulles côté client (callback parent)
 *
 * Ne remplace pas le chapter-review-board (interface QA avancée) mais fournit
 * une édition rapide depuis le lecteur / la mosaïque de pages.
 */

import { useState } from "react";

type AltShot = "wide" | "closeup";

export interface PanelEditOverlayProps {
  sceneImageId: string;
  bubblesHidden: boolean;
  onToggleBubbles: () => void;
  /** Appelée après un retry réussi (pour rafraîchir le parent). */
  onRedrawSuccess?: () => void;
  className?: string;
}

export function PanelEditOverlay({
  sceneImageId,
  bubblesHidden,
  onToggleBubbles,
  onRedrawSuccess,
  className,
}: PanelEditOverlayProps) {
  const [busy, setBusy] = useState<null | "redraw" | AltShot>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerRedraw = async (mode: "redraw" | AltShot) => {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (mode === "wide" || mode === "closeup") {
        body.forceOverrides = { shotType: mode };
      }
      const res = await fetch(`/api/scene-images/${sceneImageId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`);
      }
      if (onRedrawSuccess) {
        onRedrawSuccess();
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "retry_failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-end gap-1 border-t border-white/10 bg-black/65 px-2 py-1.5 text-[10px] opacity-0 backdrop-blur-sm transition-opacity group-hover/panel:opacity-100 ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
        onClick={() => triggerRedraw("redraw")}
        disabled={busy !== null}
        title="Regénérer cette case avec les mêmes paramètres"
      >
        {busy === "redraw" ? "…" : "Redraw"}
      </button>
      <button
        type="button"
        className="rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
        onClick={() => triggerRedraw("wide")}
        disabled={busy !== null}
        title="Regénérer en plan large"
      >
        {busy === "wide" ? "…" : "Wide"}
      </button>
      <button
        type="button"
        className="rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
        onClick={() => triggerRedraw("closeup")}
        disabled={busy !== null}
        title="Regénérer en gros plan"
      >
        {busy === "closeup" ? "…" : "Closeup"}
      </button>
      <button
        type="button"
        className={`rounded-md border px-2 py-1 font-medium transition-colors ${
          bubblesHidden
            ? "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
            : "border-white/15 bg-white/10 text-white/90 hover:bg-white/20"
        }`}
        onClick={onToggleBubbles}
        title={bubblesHidden ? "Afficher les bulles de dialogue" : "Masquer les bulles de dialogue"}
      >
        {bubblesHidden ? "Bubbles: off" : "Bubbles: on"}
      </button>
      {error && (
        <span className="ml-auto max-w-[12rem] truncate rounded bg-red-500/25 px-2 py-1 text-red-100" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}

export default PanelEditOverlay;
