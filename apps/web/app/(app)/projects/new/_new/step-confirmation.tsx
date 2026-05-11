/**
 * Étape 5 du wizard — Récapitulatif visuel + lancement chapitre 1.
 */
"use client";

import { FORMAT_LABELS, type FormatKey } from "./constants";
import type { WizardState } from "./use-wizard-state";

export function StepConfirmation({ state }: { state: WizardState }) {
  const formatLabel =
    FORMAT_LABELS[state.format as FormatKey] ?? state.format;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-semibold text-primary">{state.title || "Sans titre"}</p>
        {state.pitch ? (
          <p className="text-xs italic text-muted-foreground line-clamp-3">
            &ldquo;{state.pitch}&rdquo;
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concept</p>
          {state.primaryGenre ? <p className="mt-1">{state.primaryGenre}</p> : null}
          {state.subGenres.length > 0 ? (
            <p className="text-muted-foreground">+ {state.subGenres.join(", ")}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Style</p>
          <p className="mt-1">
            {formatLabel} · {state.tone || "ton libre"}
          </p>
          {state.visualStyle ? (
            <p className="text-muted-foreground line-clamp-2">{state.visualStyle}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Personnages
          </p>
          {state.heroName ? (
            <p className="mt-1">
              ★ {state.heroName}{" "}
              {state.heroRole ? (
                <span className="text-muted-foreground">({state.heroRole})</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-1 text-amber-300">Héros manquant !</p>
          )}
          {state.secondaryName ? (
            <p className="text-muted-foreground">
              + {state.secondaryName}{" "}
              {state.secondaryRole ? `(${state.secondaryRole})` : null}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border/60 bg-background/30 p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Univers</p>
          {state.era ? (
            <p className="mt-1">{state.era}</p>
          ) : (
            <p className="mt-1 text-muted-foreground italic">époque libre</p>
          )}
          {state.theme ? (
            <p className="text-muted-foreground">Thème : {state.theme}</p>
          ) : null}
          {state.keyLocations ? (
            <p className="text-muted-foreground line-clamp-2">
              Lieux : {state.keyLocations.split(/\n/).filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-background/20 p-3 text-xs text-muted-foreground">
        Au lancement : on crée le projet, on génère le chapitre 1 avec ton héros et
        l&apos;univers défini, puis on t&apos;ouvre l&apos;éditeur premium. Tu peux
        toujours raffiner avant la génération d&apos;images.
      </div>
    </div>
  );
}
