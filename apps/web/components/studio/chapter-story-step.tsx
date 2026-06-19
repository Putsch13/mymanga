"use client";

import type { ChapterCreativeControls, ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { ChapterBriefStep } from "./chapter-brief-step";
import { ChapterIntentCompilePanel } from "@/features/studio/wizard/chapter-intent-compile-panel";
import { StudioInlineIssues } from "./studio-inline-issues";

export function ChapterStoryStep({
  draft,
  creativityControls,
  issues,
  warningItems,
  generatingOutline,
  expertMode,
  chapterNumber,
  projectId,
  chapterId,
  onIssueAction,
  onUpdateDraft,
  onGenerateBase,
  onContinue,
}: {
  draft: ChapterStudioData;
  creativityControls: ChapterCreativeControls;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatingOutline: boolean;
  expertMode?: boolean;
  chapterNumber?: number | null;
  projectId?: string;
  chapterId?: string;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "intent") => void;
  onGenerateBase?: () => void | Promise<void>;
  onContinue: () => void;
}) {
  return (
    <div data-studio-section="story" className="max-w-3xl space-y-6">
      <ChapterBriefStep
        draft={draft}
        creativityControls={creativityControls}
        generatingOutline={generatingOutline}
        expertMode={expertMode}
        chapterNumber={chapterNumber}
        projectId={projectId}
        chapterId={chapterId}
        onUpdateDraft={onUpdateDraft}
        onGenerateBase={onGenerateBase ?? (() => {})}
        hideIntentCompilePanel
      />

      {chapterId && projectId ? (
        <ChapterIntentCompilePanel
          projectId={projectId}
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
        title="Conseils histoire"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Blocants histoire"
        issues={issues}
        emptyLabel="Aucun blocant sur l'histoire."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}
