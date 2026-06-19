"use client";

import { useMemo, useState } from "react";
import { QAResultCard } from "./qa-result-card";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewSummaryCard } from "./chapter-review/review-summary-card";
import { ReviewFiltersCard } from "./chapter-review/review-filters-card";
import { ReviewPanelCard } from "./chapter-review/review-panel-card";
import { useReviewBoard } from "./chapter-review/use-review-board";
import type { FilterState } from "./chapter-review/types";

export interface ChapterReviewBoardProps {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  projectTitle: string;
}

export function ChapterReviewBoard(input: ChapterReviewBoardProps) {
  const {
    report,
    loading,
    actionMessage,
    reviewError,
    comparePanels,
    toggleCompare,
    validatedPanels,
    rerollPanel,
    validatePanel,
    completeReview,
  } = useReviewBoard({ projectId: input.projectId, chapterId: input.chapterId });

  const [filters, setFilters] = useState<FilterState>({
    status: "all",
    criticality: "all",
    qa: "all",
    score: "all",
  });

  const filteredPanels = useMemo(() => {
    const panels = report?.panelResults ?? [];
    return panels.filter((panel) => {
      if (filters.status !== "all" && panel.status !== filters.status) return false;
      if (filters.criticality === "critical" && !panel.critical) return false;
      if (filters.criticality === "non_critical" && panel.critical) return false;
      if (filters.qa === "missing" && panel.qaWasExecuted) return false;
      if (filters.qa === "executed" && !panel.qaWasExecuted) return false;
      if (filters.score === "weak" && panel.score >= 0.72) return false;
      return true;
    });
  }, [filters, report?.panelResults]);

  return (
    <div className="space-y-6">
      <ReviewSummaryCard
        projectTitle={input.projectTitle}
        chapterTitle={input.chapterTitle}
        report={report}
        loading={loading}
        reviewError={reviewError}
        onCompleteReview={completeReview}
      />

      <QAResultCard report={report ?? undefined} />

      <ReviewFiltersCard filters={filters} onChange={setFilters} />

      {actionMessage ? (
        <p data-testid="review-action-message" className="text-sm text-muted-foreground">
          {actionMessage}
        </p>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Chargement du rapport QA…
            </CardContent>
          </Card>
        ) : filteredPanels.length === 0 ? (
          <Card className="border-border/60 bg-card/40">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Aucun panel ne correspond aux filtres.
            </CardContent>
          </Card>
        ) : (
          filteredPanels.map((panel) => (
            <ReviewPanelCard
              key={panel.panelId}
              panel={panel}
              comparePanels={comparePanels}
              validatedPanels={validatedPanels}
              onValidate={validatePanel}
              onToggleCompare={toggleCompare}
              onReroll={rerollPanel}
            />
          ))
        )}
      </div>
    </div>
  );
}
