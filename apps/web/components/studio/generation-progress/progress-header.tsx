/**
 * En-tête du board de progression : status global, chrono, ETA,
 * bandeaux d'erreur / "job terminé sans panel".
 */
"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export interface ProgressHeaderProps {
  isWorking: boolean;
  jobFailed: boolean;
  jobTerminal: boolean;
  showEmptySuccessWarning: boolean;
  elapsed: number;
  etaLabel: string | null;
  jobErrorMessage?: string | null;
  jobError?: string | null;
  chapterFetchError: string | null;
}

function formatTimer(elapsed: number): string {
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ProgressHeader(props: ProgressHeaderProps) {
  const {
    isWorking,
    jobFailed,
    jobTerminal,
    showEmptySuccessWarning,
    elapsed,
    etaLabel,
    jobErrorMessage,
    jobError,
    chapterFetchError,
  } = props;

  const errorMessage = jobErrorMessage || (jobError ? String(jobError) : null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isWorking ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          <span className="text-sm font-medium">
            {showEmptySuccessWarning
              ? "Pipeline terminé — aucun panel enregistré"
              : isWorking
                ? "Génération en cours…"
                : jobFailed
                  ? "Génération arrêtée (erreur)"
                  : jobTerminal
                    ? "Génération terminée"
                    : "Prêt"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {elapsed > 0 ? (
            <span className="font-mono text-muted-foreground" data-testid="generation-elapsed">
              {formatTimer(elapsed)}
            </span>
          ) : null}
          {etaLabel ? (
            <span
              className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent"
              data-testid="generation-eta"
              title="Temps restant estimé d'après l'avancement actuel"
            >
              ETA {etaLabel}
            </span>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {errorMessage}
        </div>
      ) : null}

      {showEmptySuccessWarning ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Le job est marqué terminé mais aucune image n&apos;apparaît encore côté chapitre.
            Vérifie les logs du job ou relance la génération.
          </span>
        </div>
      ) : null}

      {chapterFetchError ? (
        <p className="mb-2 text-xs text-muted-foreground">Sync chapitre : {chapterFetchError}</p>
      ) : null}
    </>
  );
}
