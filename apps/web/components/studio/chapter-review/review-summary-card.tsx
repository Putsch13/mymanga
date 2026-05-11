/**
 * Carte de synthèse en tête du board de review : score chapitre + compteurs
 * principaux + bouton "Clôturer la review".
 */
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QualityScoreBadge } from "../quality-score-badge";
import type { ReviewReport } from "./types";

export interface ReviewSummaryCardProps {
  projectTitle: string;
  chapterTitle: string;
  report: ReviewReport | null;
  loading: boolean;
  reviewError: string | null;
  onCompleteReview: () => void | Promise<void>;
}

export function ReviewSummaryCard(props: ReviewSummaryCardProps) {
  const { projectTitle, chapterTitle, report, loading, reviewError, onCompleteReview } = props;
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>
            {projectTitle} · {chapterTitle}
          </span>
          <QualityScoreBadge score={report?.chapterScore ?? null} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-5">
        <div data-testid="review-minimum-images">
          <p className="text-muted-foreground">Minimum</p>
          <p>{report?.imageCounts.minimumImages ?? "-"}</p>
        </div>
        <div data-testid="review-accepted-images">
          <p className="text-muted-foreground">Acceptées</p>
          <p>{report?.imageCounts.acceptedImages ?? "-"}</p>
        </div>
        <div data-testid="review-missing-images">
          <p className="text-muted-foreground">Manquantes</p>
          <p>{report?.imageCounts.missingImages ?? "-"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Critiques sans QA</p>
          <p>{report?.criticalPanelsMissingQA ?? "-"}</p>
        </div>
        <div className="flex flex-col items-end justify-end gap-1">
          <Button
            data-testid="review-complete-button"
            onClick={() => void onCompleteReview()}
            disabled={loading}
          >
            Clôturer la review
          </Button>
          {reviewError ? (
            <p
              data-testid="review-complete-error"
              className="max-w-[min(100%,20rem)] text-right text-xs text-destructive"
            >
              {reviewError}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
