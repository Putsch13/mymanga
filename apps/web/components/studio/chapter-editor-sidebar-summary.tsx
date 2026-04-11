"use client";

import type { ChapterReadinessIssue, ChapterStudioSnapshot } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WizardStepCard } from "./wizard-step-card";
import type { ChapterFlowStepId } from "./chapter-studio-flow";

export function ChapterEditorSidebarSummary({
  flowSteps,
  activeStep,
  snapshot,
  saving,
  blockerItems,
  warningItems,
  acceptedImages,
  minimumImages,
  generatedImages,
  onSelectStep,
  onSave,
}: {
  flowSteps: Array<{
    id: ChapterFlowStepId;
    title: string;
    description: string;
    blockerCount: number;
    done: boolean;
  }>;
  activeStep: ChapterFlowStepId;
  snapshot: ChapterStudioSnapshot;
  saving: boolean;
  blockerItems: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  acceptedImages: number;
  minimumImages: number;
  generatedImages: number;
  onSelectStep: (step: ChapterFlowStepId) => void;
  onSave: () => void;
}) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Résumé studio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Statut</p>
              <p className="mt-2 font-semibold">{snapshot.status}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Autosave</p>
              <p className="mt-2 font-semibold">{saving ? "Sauvegarde…" : "À jour"}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Readiness</p>
              <p className="mt-2 font-semibold">{snapshot.data.readinessReport?.preparationScore ?? 0}/100</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Budget images</p>
              <p className="mt-2 font-semibold">{acceptedImages}/{minimumImages}</p>
              <p className="text-xs text-muted-foreground">{generatedImages} générées</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Warnings</p>
            <p className="mt-2 font-semibold">{warningItems.length}</p>
            <p className="text-xs text-muted-foreground">{blockerItems.length} blocant{blockerItems.length > 1 ? "s" : ""}</p>
          </div>
          <Button data-testid="studio-save-button" type="button" onClick={onSave} disabled={saving}>
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {flowSteps.map((step) => (
          <button key={step.id} type="button" className="block w-full text-left" onClick={() => onSelectStep(step.id)}>
            <WizardStepCard
              title={step.title}
              description={step.description}
              state={activeStep === step.id ? "current" : step.done ? "done" : "blocked"}
              badge={step.blockerCount > 0 ? `${step.blockerCount} blocant${step.blockerCount > 1 ? "s" : ""}` : null}
            />
          </button>
        ))}
      </div>
    </aside>
  );
}
