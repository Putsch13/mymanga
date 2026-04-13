"use client";

import type { ChapterReadinessIssue } from "@manga-ai-studio/core";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChapterGenerateLauncher } from "./chapter-generate-launcher";
import { ChapterReviewBoard } from "./chapter-review-board";
import { StudioInlineIssues } from "./studio-inline-issues";

export function ChapterGenerationReviewStep({
  projectId,
  chapterId,
  projectTitle,
  chapterTitle,
  blockerItems,
  warningItems,
  generatedImages,
  minimumImages,
  stackReady,
  stackBlockers,
  initialStats,
  canAccessReview,
  disabledMessage,
  onIssueAction,
}: {
  projectId: string;
  chapterId: string;
  projectTitle: string;
  chapterTitle: string;
  blockerItems: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatedImages: number;
  minimumImages: number;
  stackReady: boolean;
  stackBlockers: string[];
  initialStats: { total: number; completed: number; failed: number; pending: number } | null;
  canAccessReview: boolean;
  disabledMessage: string | null;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
}) {
  const launchBlockedByReadiness = blockerItems.length > 0 && generatedImages === 0;
  const planReady = blockerItems.length === 0;
  const minimumReached = generatedImages >= minimumImages && minimumImages > 0;

  return (
    <div data-studio-section="generation_review" className="space-y-6">

      {/* Cockpit de statut lisible */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Prêt à générer ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${planReady ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
              {planReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <XCircle className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className={planReady ? "text-green-200" : "text-amber-200"}>
                {planReady ? "Plan prêt" : "Plan à corriger"}
              </span>
            </div>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${stackReady ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              {stackReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
              <span className={stackReady ? "text-green-200" : "text-red-200"}>
                {stackReady ? "Stack prête" : "Stack bloquée"}
              </span>
            </div>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${minimumReached ? "border-green-500/30 bg-green-500/10" : "border-border/60 bg-background/30"}`}>
              {minimumReached
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className={minimumReached ? "text-green-200" : "text-muted-foreground"}>
                {minimumReached ? "Minimum atteint" : `${generatedImages}/${minimumImages} images`}
              </span>
            </div>
          </div>

          {launchBlockedByReadiness && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-xs space-y-1">
              <p className="font-medium">Le chapitre ne peut pas être lancé tant que des points bloquants existent.</p>
              <p>Retourne dans les étapes précédentes pour corriger les problèmes listés ci-dessous.</p>
            </div>
          )}
          {!stackReady && stackBlockers.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-100 text-xs space-y-1">
              <p className="font-medium">La stack IA n&apos;est pas prête : configure les dépendances manquantes.</p>
              <ul className="space-y-0.5 pl-3">
                {stackBlockers.map((b) => <li key={b}>· {b}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocants détaillés avec CTA "Corriger" */}
      {blockerItems.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-200">
              <XCircle className="h-4 w-4" />
              Pourquoi la génération est bloquée ?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {blockerItems.map((issue, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div>
                  <p className="font-medium text-amber-100">{issue.message}</p>
                  {issue.ctaLabel && <p className="mt-0.5 text-xs text-amber-300/80">{issue.ctaLabel}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                  onClick={() => void onIssueAction(issue)}
                >
                  Corriger maintenant
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {warningItems.length > 0 ? (
        <StudioInlineIssues title="Points à surveiller" issues={warningItems} tone="neutral" onAction={onIssueAction} testIdPrefix={null} />
      ) : null}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Lancer la génération</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ChapterGenerateLauncher
            projectId={projectId}
            chapterId={chapterId}
            initialStats={initialStats}
            disabled={launchBlockedByReadiness || !stackReady}
            disabledMessage={
              launchBlockedByReadiness
                ? `${blockerItems.length} point${blockerItems.length > 1 ? "s" : ""} bloquant${blockerItems.length > 1 ? "s" : ""} à corriger avant de lancer`
                : !stackReady
                  ? "La stack IA n'est pas prête"
                  : disabledMessage
            }
            stackBlockers={stackBlockers}
          />
        </CardContent>
      </Card>

      {canAccessReview ? (
        <ChapterReviewBoard projectId={projectId} chapterId={chapterId} chapterTitle={chapterTitle} projectTitle={projectTitle} />
      ) : (
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            La review apparaîtra ici dès qu&apos;un premier lot d&apos;images existera ou qu&apos;un statut QA sera atteint.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
