"use client";

import type {
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { ChapterLivingWorldWizardPanel } from "@/features/studio/wizard/chapter-living-world-wizard-panel";
import { ChapterVisualStyleWizardPanel } from "@/features/studio/wizard/chapter-visual-style-wizard-panel";
import { StudioInlineIssues } from "./studio-inline-issues";
import { useCastMutations } from "./chapter-cast-canon/use-cast-mutations";
import { useRecurringNpcs } from "./chapter-cast-canon/use-recurring-npcs";
import { useNpcResolver } from "./chapter-cast-canon/use-npc-resolver";
import { CanonContextSection } from "./chapter-cast-canon/canon-context-section";

export function ChapterLivingWorldStep({
  draft,
  issues,
  warningItems,
  projectId,
  chapterId,
  chapterNumber,
  onUpdateDraft,
  onIssueAction,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  projectId: string;
  chapterId?: string;
  chapterNumber?: number | null;
  onUpdateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onContinue: () => void;
}) {
  const { updateCanon } = useCastMutations({ draft, onUpdateDraft });
  const { npcs: recurringNpcs, promoteNpc } = useRecurringNpcs(projectId);
  const npcResolver = useNpcResolver({ projectId, draft, onUpdateDraft });

  return (
    <div data-studio-section="living_world" className="max-w-3xl space-y-6">
      {chapterId ? (
        <ChapterLivingWorldWizardPanel
          chapterId={chapterId}
          draft={draft}
          onUpdateDraft={onUpdateDraft}
        />
      ) : null}

      {chapterNumber === 1 ? (
        <ChapterVisualStyleWizardPanel draft={draft} onUpdateDraft={onUpdateDraft} />
      ) : null}

      <CanonContextSection
        draft={draft}
        onUpdateCanon={updateCanon}
        recurringNpcs={recurringNpcs}
        onPromoteNpc={promoteNpc}
        npcRawDescription={npcResolver.npcRawDescription}
        onChangeNpcDescription={(value) => {
          npcResolver.setNpcRawDescription(value);
          npcResolver.setNpcResolveError(null);
        }}
        npcResolving={npcResolver.resolvingNpc}
        npcResolveError={npcResolver.npcResolveError}
        onResolveNpc={() => void npcResolver.resolveNpc()}
        npcRows={npcResolver.allNpcRows}
        onRemoveNpcRow={npcResolver.removeNpcRow}
        onContinue={onContinue}
        hideContinueButton
      />

      <div className="flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continuer vers le plan
        </Button>
      </div>

      <StudioInlineIssues
        title="Conseils monde vivant"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Blocants monde vivant"
        issues={issues}
        emptyLabel="Aucun blocant sur le monde vivant."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}
