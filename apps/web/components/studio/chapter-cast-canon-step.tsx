"use client";

import type { ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { joinList, splitList } from "./chapter-studio-flow";
import { StudioInlineIssues } from "./studio-inline-issues";

export function ChapterCastCanonStep({
  draft,
  issues,
  warningItems,
  onIssueAction,
  onUpdateDraft,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onContinue: () => void;
}) {
  return (
    <div data-studio-section="cast_canon" className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Casting & Canon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Héros actif</Label>
              <Input
                data-testid="studio-hero-character"
                data-studio-field="studio-hero-character"
                value={draft.characterSelection?.heroCharacterId ?? ""}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    characterSelection: {
                      heroCharacterId: event.target.value,
                      activeCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
                      lockedCharacterIds: draft.characterSelection?.lockedCharacterIds ?? [],
                      speakingCharacterIds: draft.characterSelection?.speakingCharacterIds ?? [],
                      evolvingCharacterIds: draft.characterSelection?.evolvingCharacterIds ?? [],
                      antagonistCharacterIds: draft.characterSelection?.antagonistCharacterIds ?? [],
                      recurringNpcIds: draft.characterSelection?.recurringNpcIds ?? [],
                    },
                  }, "characters")
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Personnages actifs</Label>
              <Input
                data-studio-field="studio-active-characters"
                value={joinList(draft.characterSelection?.activeCharacterIds)}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    characterSelection: {
                      heroCharacterId: draft.characterSelection?.heroCharacterId ?? null,
                      activeCharacterIds: splitList(event.target.value),
                      lockedCharacterIds: draft.characterSelection?.lockedCharacterIds ?? [],
                      speakingCharacterIds: draft.characterSelection?.speakingCharacterIds ?? [],
                      evolvingCharacterIds: draft.characterSelection?.evolvingCharacterIds ?? [],
                      antagonistCharacterIds: draft.characterSelection?.antagonistCharacterIds ?? [],
                      recurringNpcIds: draft.characterSelection?.recurringNpcIds ?? [],
                    },
                  }, "characters")
                }
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Décor principal</Label>
              <Input
                data-testid="studio-location"
                data-studio-field="studio-location"
                value={draft.chapterCanon?.currentLocation ?? ""}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    chapterCanon: {
                      heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                      activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                      allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                      currentLocation: event.target.value,
                      weather: draft.chapterCanon?.weather ?? null,
                      timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
                      injuries: draft.chapterCanon?.injuries ?? [],
                      carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
                      continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
                      inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                      universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                    },
                  }, "canon")
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Continuité essentielle</Label>
              <Textarea
                data-studio-field="studio-continuity-notes"
                value={joinList(draft.chapterCanon?.continuityNotes)}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    chapterCanon: {
                      heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                      activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                      allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                      currentLocation: draft.chapterCanon?.currentLocation ?? null,
                      weather: draft.chapterCanon?.weather ?? null,
                      timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
                      injuries: draft.chapterCanon?.injuries ?? [],
                      carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
                      continuityNotes: splitList(event.target.value),
                      inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                      universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                    },
                  }, "canon")
                }
              />
            </div>
          </div>

          <details className="rounded-xl border border-border/60 bg-background/30 p-4">
            <summary className="cursor-pointer text-sm font-medium">Mode expert</summary>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Météo</Label>
                <Input
                  data-studio-field="studio-weather"
                  value={draft.chapterCanon?.weather ?? ""}
                  onChange={(event) =>
                    onUpdateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: draft.chapterCanon?.currentLocation ?? null,
                        weather: event.target.value,
                        timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
                        injuries: draft.chapterCanon?.injuries ?? [],
                        carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
                        continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
                        inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                        universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                      },
                    }, "canon")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Moment de la journée</Label>
                <Input
                  data-studio-field="studio-time-of-day"
                  value={draft.chapterCanon?.timeOfDay ?? ""}
                  onChange={(event) =>
                    onUpdateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: draft.chapterCanon?.currentLocation ?? null,
                        weather: draft.chapterCanon?.weather ?? null,
                        timeOfDay: event.target.value,
                        injuries: draft.chapterCanon?.injuries ?? [],
                        carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
                        continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
                        inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                        universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                      },
                    }, "canon")
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Contraintes d’univers</Label>
                <Input
                  data-studio-field="studio-universe-constraints"
                  value={joinList(draft.chapterCanon?.universeConstraints)}
                  onChange={(event) =>
                    onUpdateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: draft.chapterCanon?.currentLocation ?? null,
                        weather: draft.chapterCanon?.weather ?? null,
                        timeOfDay: draft.chapterCanon?.timeOfDay ?? null,
                        injuries: draft.chapterCanon?.injuries ?? [],
                        carriedObjects: draft.chapterCanon?.carriedObjects ?? [],
                        continuityNotes: draft.chapterCanon?.continuityNotes ?? [],
                        inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                        universeConstraints: splitList(event.target.value),
                      },
                    }, "canon")
                  }
                />
              </div>
            </div>
          </details>

          <div className="flex justify-end">
            <Button type="button" onClick={onContinue}>Continuer vers le plan</Button>
          </div>
        </CardContent>
      </Card>

      <StudioInlineIssues title="Blocants casting & canon" issues={issues} emptyLabel="Aucun blocant sur le casting et le canon." testIdPrefix={null} onAction={onIssueAction} />
      <StudioInlineIssues title="Warnings casting & canon" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
