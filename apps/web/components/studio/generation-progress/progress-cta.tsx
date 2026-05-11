/**
 * Bouton "Lire le chapitre" + récap d'éventuels échecs en fin de génération.
 */
"use client";

import { Sparkles } from "lucide-react";

export interface ProgressCtaProps {
  projectId: string;
  chapterId: string;
  statsFailed: number;
}

export function ProgressCta({ projectId, chapterId, statsFailed }: ProgressCtaProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={`/projects/${projectId}/chapters/${chapterId}/read`}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/80"
      >
        <Sparkles className="h-4 w-4" />
        Lire le chapitre
      </a>
      {statsFailed > 0 ? (
        <span className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground">
          {statsFailed} panel{statsFailed > 1 ? "s" : ""} en échec — relance la génération ou
          ouvre le studio
        </span>
      ) : null}
    </div>
  );
}
