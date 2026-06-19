"use client";

import { useEffect } from "react";
import {
  type ChapterReadinessIssue,
  type ChapterStudioData,
  isAntagonistRole,
  isHeroRole,
  isSupportingRole,
} from "@manga-ai-studio/core";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChapterHeroWizardPanel } from "@/features/studio/wizard/chapter-hero-wizard-panel";
import { ChapterSecondaryCastWizardPanel } from "@/features/studio/wizard/chapter-secondary-cast-wizard-panel";
import type { HeroWizardReadiness } from "@/features/studio/wizard/chapter-wizard-model";
import { StudioInlineIssues } from "./studio-inline-issues";
import type { CharacterCatalogEntry } from "./chapter-cast-canon/types";
import { useCastMutations } from "./chapter-cast-canon/use-cast-mutations";
import { useNpcResolver } from "./chapter-cast-canon/use-npc-resolver";
import { CharacterQuickActions } from "./chapter-cast-canon/character-quick-actions";
import { CharacterPickersGrid } from "./chapter-cast-canon/character-pickers-grid";

export interface ChapterCharactersStepProps {
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

export function ChapterCharactersStep({
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
}: ChapterCharactersStepProps) {
  const catalog = characterCatalog ?? [];
  const heroes = catalog.filter((c) => isHeroRole(c.roleType));
  const antagonists = catalog.filter((c) => isAntagonistRole(c.roleType));
  const mainChars = catalog.filter(
    (c) => isHeroRole(c.roleType) || isSupportingRole(c.roleType),
  );

  const { updateCharacterSelection } = useCastMutations({ draft, onUpdateDraft });
  const npcResolver = useNpcResolver({ projectId, draft, onUpdateDraft });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHeroId]);

  const showWizards = chapterNumber === 1 && Boolean(chapterId);

  return (
    <div data-studio-section="characters" className="max-w-3xl space-y-6">
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

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Cast du chapitre</CardTitle>
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
            hideHeroPicker
          />
        </CardContent>
      </Card>

      <Card className="border-violet-500/25 bg-card/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Qui peuple le chapitre ?</CardTitle>
          <p className="text-xs text-muted-foreground">
            Nomme un PNJ ou une créature en une ligne — l&apos;IA complète le reste.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nom + indice libre</Label>
              <Input
                value={npcResolver.npcRawDescription}
                onChange={(e) => {
                  npcResolver.setNpcRawDescription(e.target.value);
                  npcResolver.setNpcResolveError(null);
                }}
                placeholder="Ex. : Bartender — tient le pub, vieux, bourru"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void npcResolver.resolveNpc();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={npcResolver.resolvingNpc || !npcResolver.npcRawDescription.trim()}
              onClick={() => void npcResolver.resolveNpc()}
            >
              {npcResolver.resolvingNpc ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              L&apos;IA complète
            </Button>
          </div>

          {npcResolver.npcResolveError ? (
            <p className="text-xs text-destructive">{npcResolver.npcResolveError}</p>
          ) : null}

          {npcResolver.allNpcRows.length > 0 ? (
            <div className="space-y-2">
              {npcResolver.allNpcRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 p-3"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-foreground truncate">{row.label}</p>
                    {row.promptFragment ? (
                      <p className="text-xs text-muted-foreground line-clamp-2">{row.promptFragment}</p>
                    ) : null}
                    {row.narrativeHook ? (
                      <p className="text-xs text-muted-foreground/80 italic">{row.narrativeHook}</p>
                    ) : null}
                    <NpcRecurrenceToggle
                      npcId={row.id}
                      draft={draft}
                      onUpdateDraft={onUpdateDraft}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive/60 hover:text-destructive"
                    onClick={() => npcResolver.removeNpcRow(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continuer vers l&apos;histoire
        </Button>
      </div>

      <StudioInlineIssues
        title="Conseils personnages"
        issues={warningItems}
        tone="neutral"
        testIdPrefix={null}
        onAction={onIssueAction}
      />
      <StudioInlineIssues
        title="Blocants personnages"
        issues={issues}
        emptyLabel="Aucun blocant sur les personnages."
        testIdPrefix={null}
        onAction={onIssueAction}
      />
    </div>
  );
}

function NpcRecurrenceToggle({
  npcId,
  draft,
  onUpdateDraft,
}: {
  npcId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}) {
  const npc = (draft.chapterEntities?.npcs ?? []).find((n) => n.id === npcId);
  if (!npc) return null;
  const isRecurring = npc.recurrence === "recurring";

  function toggle(v: boolean) {
    const npcs = (draft.chapterEntities?.npcs ?? []).map((n) =>
      n.id === npcId ? { ...n, recurrence: v ? ("recurring" as const) : ("one_shot" as const) } : n,
    );
    onUpdateDraft(
      {
        ...draft,
        chapterEntities: {
          ...draft.chapterEntities!,
          npcs,
        },
      },
      "characters",
    );
  }

  return (
    <div className="flex items-center gap-1.5 pt-0.5">
      <Switch
        checked={isRecurring}
        onCheckedChange={toggle}
        className="scale-75 origin-left"
      />
      <span className="text-[11px] text-muted-foreground">
        {isRecurring ? "Récurrent (réutilisé entre chapitres)" : "Ponctuel"}
      </span>
    </div>
  );
}
