"use client";

import type { WizardStepUiStatus } from "./chapter-wizard-model";

export function ChapterWizardStepCard(props: {
  label: string;
  status: WizardStepUiStatus;
  isCurrent: boolean;
  visited?: boolean;
  onClick: () => void;
}) {
  const { label, status, isCurrent, visited, onClick } = props;
  const ring = isCurrent ? "ring-2 ring-primary/50 border-primary/40" : "border-border/50";
  const dotColor: Record<WizardStepUiStatus, string> = {
    ready: "bg-emerald-500",
    warning: "bg-amber-500",
    blocked: "bg-destructive",
    pending: "bg-muted-foreground/40",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/30 ${ring}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor[status]}`} aria-hidden />
      {visited ? <span className="text-emerald-500" aria-hidden>✓ </span> : null}
      <span className="font-medium">{label}</span>
    </button>
  );
}
