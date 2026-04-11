"use client";

import type { ChapterReadinessIssue } from "@manga-ai-studio/core";
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
  acceptedImages,
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
  acceptedImages: number;
  minimumImages: number;
  stackReady: boolean;
  stackBlockers: string[];
  initialStats: { total: number; completed: number; failed: number; pending: number } | null;
  canAccessReview: boolean;
  disabledMessage: string | null;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
}) {
  const launchBlockedByReadiness = blockerItems.length > 0 && generatedImages === 0;

  return (
    <div data-studio-section="generation_review" className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Génération & Review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Générées</p><p>{generatedImages}</p></div>
          <div><p className="text-muted-foreground">Acceptées</p><p>{acceptedImages}</p></div>
          <div><p className="text-muted-foreground">Minimum</p><p>{minimumImages}</p></div>
          <div><p className="text-muted-foreground">Stack</p><p>{stackReady ? "prête" : "bloquée"}</p></div>
        </CardContent>
      </Card>

      {(blockerItems.length > 0 || warningItems.length > 0) ? (
        <StudioInlineIssues title="Blocants avant run" issues={blockerItems} onAction={onIssueAction} emptyLabel={null} testIdPrefix={null} />
      ) : null}

      {warningItems.length > 0 ? (
        <StudioInlineIssues title="Warnings avant run" issues={warningItems} tone="neutral" onAction={onIssueAction} testIdPrefix={null} />
      ) : null}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Lancement pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {launchBlockedByReadiness ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-50">
              Corrige d’abord les blocants readiness pour lancer un run propre depuis le studio.
            </div>
          ) : null}
          <ChapterGenerateLauncher
            projectId={projectId}
            chapterId={chapterId}
            initialStats={initialStats}
            disabled={launchBlockedByReadiness || !stackReady}
            disabledMessage={disabledMessage}
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
            La review apparaîtra ici dès qu’un premier lot d’images existera ou qu’un statut QA sera atteint.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
