/**
 * ARCH-6 — Preview du dernier panel "vivant" pendant la génération.
 *
 * On affiche en priorité le dernier panel `generating`, sinon le dernier
 * panel `completed` avec une URL d'image stable.
 */
"use client";

import { Loader2, Sparkles } from "lucide-react";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import type { PanelStatus } from "./types";

export interface ProgressFocusPanelProps {
  panel: PanelStatus | null;
}

export function ProgressFocusPanel({ panel }: ProgressFocusPanelProps) {
  if (!panel) return null;
  const image = getStableImageUrl(panel);
  return (
    <div
      className="rounded-2xl border border-border/60 bg-card/40 p-4"
      data-testid="generation-focus-panel"
    >
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
          {panel.status === "generating" ? "En cours de rendu" : "Dernier panel généré"}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          scène {panel.sceneNumber} · panel {panel.panelNumber}
        </span>
      </div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl border border-border/60 bg-background/40">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={`Aperçu panel ${panel.panelNumber}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="panel-pulse flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {panel.status === "generating" ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-center text-[11px] font-medium text-white">
            Le moteur peint cette case…
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function pickFocusPanel(panels: PanelStatus[]): PanelStatus | null {
  for (let i = panels.length - 1; i >= 0; i -= 1) {
    if (panels[i].status === "generating") return panels[i];
  }
  for (let i = panels.length - 1; i >= 0; i -= 1) {
    const p = panels[i];
    if (p.status === "completed" && getStableImageUrl(p)) return p;
  }
  return null;
}
