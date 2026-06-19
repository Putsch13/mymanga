/**
 * Vue produit (parallèle aux étapes techniques) de la progression du job.
 */
"use client";

import { CheckCircle2, Circle, Loader2, ListChecks, XCircle } from "lucide-react";
import type { ChecklistRow } from "./types";

export function ProgressProductChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <div
      className="mb-4 rounded-xl border border-border/50 bg-background/25 px-3 py-2.5"
      data-testid="generation-product-checklist"
    >
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5 shrink-0" />
        Parcours génération (vue produit)
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2 text-[11px] leading-snug">
            {row.state === "done" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : row.state === "active" ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
            ) : row.state === "error" ? (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
            )}
            <span>
              <span className="font-medium text-foreground/90">{row.label}</span>
              {row.hint ? (
                <span className="mt-0.5 block text-muted-foreground">{row.hint}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
