"use client";

import type {
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { ChapterLocationsWizardPanel } from "@/features/studio/wizard/chapter-locations-wizard-panel";
import { StudioInlineIssues } from "./studio-inline-issues";

export function ChapterLocationsStep({
  draft,
  issues,
  warningItems,
  chapterId,
  onUpdateDraft,
  onIssueAction,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  chapterId?: string;
  onUpdateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onContinue: () => void;
}) {
  return (
    <div data-studio-section="locations" className="max-w-3xl space-y-6">
      {chapterId ? (
        <ChapterLocationsWizardPanel
          chapterId={chapterId}
          draft={draft}
          onUpdateDraft={onUpdateDraft}
        />
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continuer
        </Button>
      </div>

      <StudioInlineIssues
        title="Conseils décors"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Blocants décors"
        issues={issues}
        emptyLabel="Aucun blocant sur les décors."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}
