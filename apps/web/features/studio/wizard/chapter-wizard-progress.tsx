"use client";

import type { ChapterWizardStepVm } from "./use-chapter-wizard-state";

export function ChapterWizardProgress(props: {
  steps: ChapterWizardStepVm[];
  onStepClick: (id: ChapterWizardStepVm["id"]) => void;
}) {
  const { steps, onStepClick } = props;
  if (steps.length === 0) return null;
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
      role="tablist"
      aria-label="Étapes du wizard chapitre"
    >
      {steps.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={s.isCurrent}
          onClick={() => onStepClick(s.id)}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors md:text-xs ${
            s.isCurrent
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-transparent bg-muted/30 text-muted-foreground hover:border-border/60"
          } ${
            s.status === "blocked"
              ? "border-destructive/30"
              : s.status === "warning"
                ? "border-amber-500/30"
                : ""
          }`}
        >
          {s.visited ? <span className="mr-0.5 text-emerald-500" aria-hidden>✓</span> : null}
          {s.label}
        </button>
      ))}
    </div>
  );
}
