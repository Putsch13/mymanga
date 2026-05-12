"use client";

import { useEffect } from "react";
import {
  type ChapterReadinessIssue,
  type ChapterStudioData,
  isAntagonistRole,
  isHeroRole,
  isSupportingRole,
} from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudioInlineIssues } from "./studio-inline-issues";
import { ChapterHeroWizardPanel } from "@/features/studio/wizard/chapter-hero-wizard-panel";
import { ChapterSecondaryCastWizardPanel } from "@/features/studio/wizard/chapter-secondary-cast-wizard-panel";
import { ChapterLocationsWizardPanel } from "@/features/studio/wizard/chapter-locations-wizard-panel";
import { ChapterLivingWorldWizardPanel } from "@/features/studio/wizard/chapter-living-world-wizard-panel";
import { ChapterVisualStyleWizardPanel } from "@/features/studio/wizard/chapter-visual-style-wizard-panel";
import type { HeroWizardReadiness } from "@/features/studio/wizard/chapter-wizard-model";

import type { CharacterCatalogEntry } from "./chapter-cast-canon/types";
import { useCastMutations } from "./chapter-cast-canon/use-cast-mutations";
import { useRecurringNpcs } from "./chapter-cast-canon/use-recurring-npcs";
import { useNpcResolver } from "./chapter-cast-canon/use-npc-resolver";
import { CharacterQuickActions } from "./chapter-cast-canon/character-quick-actions";
import { CharacterPickersGrid } from "./chapter-cast-canon/character-pickers-grid";
import { CanonContextSection } from "./chapter-cast-canon/canon-context-section";

export interface ChapterCastCanonStepProps {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  characterCatalog?: CharacterCatalogEntry[];
  projectId: string;
  chapterId?: string;
  chapterNumber?: number | null;
  onHeroReadinessChange?: (readiness: HeroWizardReadiness | null) => void;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onContinue: () => void;
}

export function ChapterCastCanonStep({
  draft,
  issues,
  warningItems,
  characterCatalog,
  projectId,
  chapterId,
  chapterNumber,
  onHeroReadinessChange,
  onIssueAction,
  onUpdateDraft,
  onContinue,
}: ChapterCastCanonStepProps) {
  const catalog = characterCatalog ?? [];
  const heroes = catalog.filter((c) => isHeroRole(c.roleType));
  const antagonists = catalog.filter((c) => isAntagonistRole(c.roleType));
  const mainChars = catalog.filter(
    (c) => isHeroRole(c.roleType) || isSupportingRole(c.roleType),
  );

  const { updateCharacterSelection, updateCanon } = useCastMutations({
    draft,
    onUpdateDraft,
  });

  // Auto-sélection silencieuse du héros si `heroCharacterId` vide mais le
  // catalogue propose au moins un rôle "hero".
  const autoHeroId =
    !draft.characterSelection?.heroCharacterId && heroes.length > 0
      ? (heroes.find((h) =>
          draft.characterSelection?.activeCharacterIds?.includes(h.id),
        ) ?? heroes[0])?.id ?? null
      : null;

  useEffect(() => {
    if (autoHeroId) {
      updateCharacterSelection({ heroCharacterId: autoHeroId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateCharacterSelection est stable (setter draft), inclure ferait re-tirer à chaque rerender parent.
  }, [autoHeroId]);

  const { npcs: recurringNpcs, promoteNpc } = useRecurringNpcs(projectId);

  const npcResolver = useNpcResolver({ projectId, draft, onUpdateDraft });

  const showWizards = chapterNumber === 1 && Boolean(chapterId);

  return (
    <div data-studio-section="cast_canon" className="max-w-3xl space-y-6">
      {showWizards && onHeroReadinessChange ? (
        <ChapterHeroWizardPanel
          projectId={projectId}
          chapterId={chapterId!}
          draft={draft}
          characterCatalog={catalog}
          onUpdateDraft={onUpdateDraft}
          onHeroReadinessChange={onHeroReadinessChange}
        />
      ) : null}

      {showWizards ? (
        <ChapterSecondaryCastWizardPanel
          projectId={projectId}
          chapterId={chapterId!}
          draft={draft}
          characterCatalog={catalog}
          onPatchCharacterSelection={updateCharacterSelection}
        />
      ) : null}

      {showWizards ? (
        <ChapterLocationsWizardPanel
          chapterId={chapterId!}
          draft={draft}
          onUpdateDraft={onUpdateDraft}
        />
      ) : null}

      {showWizards ? (
        <ChapterLivingWorldWizardPanel
          chapterId={chapterId!}
          draft={draft}
          onUpdateDraft={onUpdateDraft}
        />
      ) : null}

      {chapterNumber === 1 ? (
        <ChapterVisualStyleWizardPanel draft={draft} onUpdateDraft={onUpdateDraft} />
      ) : null}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Personnages du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <CharacterQuickActions
            catalog={catalog}
            heroes={heroes}
            mainChars={mainChars}
            antagonists={antagonists}
            onUpdate={updateCharacterSelection}
          />
          <CharacterPickersGrid
            catalog={catalog}
            draft={draft}
            onUpdate={updateCharacterSelection}
          />
        </CardContent>
      </Card>

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
      />

      <StudioInlineIssues
        title="Blocants casting & canon"
        issues={issues}
        emptyLabel="Aucun blocant sur le casting et le canon."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Points à surveiller"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}
