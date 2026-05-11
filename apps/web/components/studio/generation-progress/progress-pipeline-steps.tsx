/**
 * Liste des étapes pipeline (vue technique). Affiche le status de chaque
 * étape Inngest + une mini-barre de progression spécifique à `generate_images`.
 */
"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { phaseLabelForStepKey } from "./derive-product-checklist";

export interface ProgressPipelineStepsProps {
  steps: Array<{ key: string; label?: string; status?: string; detail?: string }>;
  currentStep?: string | null;
  effectiveTotal: number;
  statsCompleted: number;
  progressPct: number;
}

export function ProgressPipelineSteps(props: ProgressPipelineStepsProps) {
  const { steps, currentStep, effectiveTotal, statsCompleted, progressPct } = props;
  return (
    <div className="mb-4 rounded-xl border border-border/50 bg-background/30 p-3 text-xs">
      <p className="mb-2 font-medium text-muted-foreground">Étapes pipeline</p>
      <ul className="space-y-1.5">
        {steps.map((s, idx) => {
          const st = s.status ?? "queued";
          const ok = st === "completed";
          const bad = st === "failed";
          const isImageStep = s.key === "generate_images";
          const isImageStepRunning = isImageStep && st === "running";
          return (
            <li key={`${s.key}-${idx}`} className="flex items-start gap-2">
              {bad ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
              )}
              <span className="flex-1">
                <span className="text-muted-foreground">{phaseLabelForStepKey(s.key)}</span>
                {s.label ? <span className="text-foreground/80"> — {s.label}</span> : null}
                {s.detail ? (
                  <span className="block text-[11px] text-muted-foreground">{s.detail}</span>
                ) : null}
                {isImageStepRunning && effectiveTotal > 0 ? (
                  <span className="mt-1 block">
                    <span className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {statsCompleted}/{effectiveTotal} panels rendus
                      </span>
                      <span className="font-medium text-accent">{progressPct}%</span>
                    </span>
                    <span className="block h-1 w-full overflow-hidden rounded-full bg-border/50">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, progressPct)}%` }}
                      />
                    </span>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {currentStep ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Étape technique : <code className="rounded bg-muted px-1">{currentStep}</code>
        </p>
      ) : null}
    </div>
  );
}
