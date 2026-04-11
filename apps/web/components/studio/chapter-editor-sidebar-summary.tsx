"use client";

import type { ChapterReadinessIssue, ChapterStudioSnapshot, EstimateContext } from "@manga-ai-studio/core";
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
  estimateContext,
  chapterLookProfileMode,
  genreMode,
  qualityScore,
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
  estimateContext?: EstimateContext | null;
  /** Profil look chapitre actif */
  chapterLookProfileMode?: string | null;
  /** Mode genre actif */
  genreMode?: string | null;
  /** Score qualité narratif (0–100) */
  qualityScore?: number | null;
  onSelectStep: (step: ChapterFlowStepId) => void;
  onSave: () => void;
}) {
  const readinessScore = snapshot.data.readinessReport?.preparationScore ?? 0;
  const readinessColor =
    readinessScore >= 80 ? "text-green-600 dark:text-green-400" :
    readinessScore >= 50 ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";

  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start" data-testid="studio-sidebar">
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
              <p className={`mt-2 font-semibold ${saving ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {saving ? "Sauvegarde…" : "À jour"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Readiness</p>
              <p className={`mt-2 font-semibold ${readinessColor}`}>{readinessScore}/100</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Budget images</p>
              <p className="mt-2 font-semibold">{acceptedImages}/{minimumImages}</p>
              <p className="text-xs text-muted-foreground">{generatedImages} générées</p>
            </div>
          </div>

          {(blockerItems.length > 0 || warningItems.length > 0) ? (
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Alertes</p>
              <div className="mt-2 space-y-1">
                {blockerItems.length > 0 ? (
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {blockerItems.length} blocant{blockerItems.length > 1 ? "s" : ""}
                  </p>
                ) : null}
                {warningItems.length > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {warningItems.length} warning{warningItems.length > 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
              <p className="text-xs font-medium text-green-600 dark:text-green-400">Aucun blocant</p>
            </div>
          )}

          {/* Look Profile + Genre Mode + Quality Score */}
          {(chapterLookProfileMode || genreMode || qualityScore !== null && qualityScore !== undefined) ? (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1" data-testid="chapter-look-profile-summary">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Profil visuel</p>
              {chapterLookProfileMode ? (
                <p className="text-xs font-medium">
                  {chapterLookProfileMode === "premium_manga_bw" ? "Manga BW Premium"
                    : chapterLookProfileMode === "premium_manga_color" ? "Manga Couleur Premium"
                    : chapterLookProfileMode === "anime_cel_shaded_consistent" ? "Anime Cel Shaded"
                    : chapterLookProfileMode}
                </p>
              ) : null}
              {genreMode ? (
                <p className="text-xs text-muted-foreground">Genre: {genreMode}</p>
              ) : null}
              {qualityScore !== null && qualityScore !== undefined ? (
                <p className={`text-xs font-medium ${qualityScore >= 80 ? "text-green-600 dark:text-green-400" : qualityScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                  Qualité narrative: {qualityScore}/100
                </p>
              ) : null}
            </div>
          ) : null}

          {estimateContext ? (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1" data-testid="estimate-context-summary">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Estimation</p>
              <p className="text-xs font-medium">
                {estimateContext.estimateSource === "existing_chapter" ? "Chapitre existant" : "Nouveau chapitre"}
                {estimateContext.targetChapterNumber ? ` · Ch. ${estimateContext.targetChapterNumber}` : ""}
              </p>
              {estimateContext.estimatedAt ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(estimateContext.estimatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : null}
            </div>
          ) : null}

          <Button data-testid="studio-save-button" type="button" onClick={onSave} disabled={saving} className="w-full">
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
