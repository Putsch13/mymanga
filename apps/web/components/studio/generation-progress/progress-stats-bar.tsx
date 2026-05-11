/**
 * Barre de progression + récap stats panels (générés / échecs / pending /
 * en rendu / verrouillés / relancés).
 */
"use client";

import { Loader2, Lock, RefreshCw } from "lucide-react";

export interface ProgressStatsBarProps {
  progressPct: number;
  statsCompleted: number;
  statsFailed: number;
  statsPending: number;
  statsGenerating: number;
  statsLocked: number;
  statsRetried: number;
  effectiveTotal: number;
}

export function ProgressStatsBar(props: ProgressStatsBarProps) {
  const {
    progressPct,
    statsCompleted,
    statsFailed,
    statsPending,
    statsGenerating,
    statsLocked,
    statsRetried,
    effectiveTotal,
  } = props;

  const showSecondary = statsGenerating > 0 || statsLocked > 0 || statsRetried > 0;

  return (
    <>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-rose-600 transition-all duration-500"
          style={{ width: `${Math.min(100, progressPct)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-emerald-400">{statsCompleted}</span> générées
        </span>
        {statsFailed > 0 ? (
          <span>
            <span className="font-medium text-red-400">{statsFailed}</span> échecs
          </span>
        ) : null}
        <span>
          <span className="font-medium text-white/70">{statsPending}</span> en attente
        </span>
        <span>
          <span className="font-medium text-white/70">{effectiveTotal}</span> total
        </span>
        <span className="ml-auto font-medium text-accent">{progressPct}%</span>
      </div>

      {showSecondary ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
          {statsGenerating > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
              <span className="font-medium text-foreground/90">{statsGenerating}</span>
              en rendu image
            </span>
          ) : null}
          {statsLocked > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3 shrink-0 text-emerald-400/90" />
              <span className="font-medium text-foreground/90">{statsLocked}</span>
              verrouillé{statsLocked > 1 ? "s" : ""} (validés)
            </span>
          ) : null}
          {statsRetried > 0 ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3 shrink-0 text-amber-400/90" />
              <span className="font-medium text-foreground/90">{statsRetried}</span>
              relance{statsRetried > 1 ? "s" : ""} auto
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
