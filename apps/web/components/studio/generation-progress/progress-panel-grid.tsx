/**
 * Grille miniature de l'état de chaque panel (mosaïque rapide).
 */
"use client";

import { Clock, Loader2, XCircle } from "lucide-react";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import type { PanelStatus } from "./types";

export function ProgressPanelGrid({ panels }: { panels: PanelStatus[] }) {
  if (panels.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {panels.map((panel) => {
        const url = getStableImageUrl(panel);
        return (
          <div
            key={panel.id}
            className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border/60 bg-card/40"
          >
            {panel.status === "completed" && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={`Panel ${panel.panelNumber}`}
                className="h-full w-full object-cover"
              />
            ) : panel.status === "failed" || panel.status === "blocked" ? (
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
        );
      })}
    </div>
  );
}
