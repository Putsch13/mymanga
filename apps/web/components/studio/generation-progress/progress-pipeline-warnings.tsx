/**
 * Liste des warnings non bloquants du pipeline (côté utilisateur).
 */
"use client";

import { AlertTriangle } from "lucide-react";

export function ProgressPipelineWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
      data-testid="generation-job-warnings"
    >
      <div className="flex items-center gap-2 font-medium text-amber-200/95">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Avertissements pipeline (non bloquants)
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[11px] leading-snug text-amber-50/95">
        {warnings.slice(0, 24).map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {warnings.length > 24 ? (
        <p className="text-[10px] text-amber-200/70">
          + {warnings.length - 24} autres (voir logs job)
        </p>
      ) : null}
    </div>
  );
}
