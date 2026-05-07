"use client";

import { ChapterWizardProgress } from "./chapter-wizard-progress";
import { ChapterWizardStepCard } from "./chapter-wizard-step-card";
import type { ChapterWizardStepVm } from "./use-chapter-wizard-state";

export function ChapterWizardShell(props: {
  /** Afficher le cadre wizard (chapitre 1). */
  enabled: boolean;
  /** Bandeau ouvert. */
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  steps: ChapterWizardStepVm[];
  onStepClick: (id: ChapterWizardStepVm["id"]) => void;
}) {
  const { enabled, expanded, onExpandedChange, steps, onStepClick } = props;
  if (!enabled) return null;
  return (
    <section className="rounded-xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <div>
          <p className="text-xs font-semibold tracking-tight text-foreground">Parcours guidé — chapitre 1</p>
          <p className="text-[11px] text-muted-foreground">
            Étapes sauvegardées avec ton brouillon (tu peux revenir en arrière sans perdre les données).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40"
        >
          {expanded ? "Réduire" : "Déplier"}
        </button>
      </div>
      {expanded ? (
        <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Vue rapide</p>
            <ChapterWizardProgress steps={steps} onStepClick={onStepClick} />
          </div>
          <div className="hidden space-y-1.5 md:block">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Détail</p>
            <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
              {steps.map((s) => (
                <ChapterWizardStepCard
                  key={s.id}
                  label={s.label}
                  status={s.status}
                  isCurrent={s.isCurrent}
                  visited={s.visited}
                  onClick={() => onStepClick(s.id)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2">
          <ChapterWizardProgress steps={steps} onStepClick={onStepClick} />
        </div>
      )}
    </section>
  );
}
