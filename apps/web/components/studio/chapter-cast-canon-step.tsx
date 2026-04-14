"use client";

import { useEffect } from "react";
import type { ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterPicker } from "./character-picker";
import { TagInput } from "./tag-input";
import { StudioInlineIssues } from "./studio-inline-issues";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

export function ChapterCastCanonStep({
  draft,
  issues,
  warningItems,
  characterCatalog,
  onIssueAction,
  onUpdateDraft,
  onContinue,
}: {
  draft: ChapterStudioData;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  characterCatalog?: CharacterCatalogEntry[];
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onContinue: () => void;
}) {
  const catalog = characterCatalog ?? [];
  const heroes = catalog.filter((c) => /hero|protagon|main_char/i.test(c.roleType ?? ""));
  const antagonists = catalog.filter((c) => /antagon|villain/i.test(c.roleType ?? ""));
  const mainChars = catalog.filter((c) => /hero|protagon|support|main/i.test(c.roleType ?? ""));

  // Auto-sélection silencieuse du héros si heroCharacterId vide mais actifs contiennent un héros
  const autoHeroId =
    !draft.characterSelection?.heroCharacterId && heroes.length > 0
      ? (heroes.find((h) => draft.characterSelection?.activeCharacterIds?.includes(h.id)) ?? heroes[0])?.id ?? null
      : null;

  useEffect(() => {
    if (autoHeroId) {
      updateCharacterSelection({ heroCharacterId: autoHeroId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHeroId]);

  function updateCharacterSelection(patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>) {
    onUpdateDraft({
      ...draft,
      characterSelection: {
        heroCharacterId: draft.characterSelection?.heroCharacterId ?? null,
        activeCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
        lockedCharacterIds: draft.characterSelection?.lockedCharacterIds ?? [],
        speakingCharacterIds: draft.characterSelection?.speakingCharacterIds ?? [],
        evolvingCharacterIds: draft.characterSelection?.evolvingCharacterIds ?? [],
        antagonistCharacterIds: draft.characterSelection?.antagonistCharacterIds ?? [],
        recurringNpcIds: draft.characterSelection?.recurringNpcIds ?? [],
        ...patch,
      },
    }, "characters");
  }

  function updateCanon(patch: Partial<NonNullable<ChapterStudioData["chapterCanon"]>>) {
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
        universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
        ...patch,
      },
    }, "canon");
  }

  return (
    <div data-studio-section="cast_canon" className="max-w-3xl space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Personnages du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick actions si des personnages existent dans le projet */}
          {catalog.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-background/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Remplissage rapide</p>
              <div className="flex flex-wrap gap-2">
                {heroes.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const hero = heroes[0];
                      if (!hero) return;
                      updateCharacterSelection({ heroCharacterId: hero.id });
                    }}
                  >
                    Héros principal
                  </Button>
                )}
                {mainChars.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCharacterSelection({
                        activeCharacterIds: mainChars.map((c) => c.id),
                      });
                    }}
                  >
                    Personnages principaux
                  </Button>
                )}
                {antagonists.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateCharacterSelection({
                        antagonistCharacterIds: antagonists.map((c) => c.id),
                      });
                    }}
                  >
                    Antagonistes
                  </Button>
                )}
                {catalog.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const hero = heroes[0];
                      updateCharacterSelection({
                        heroCharacterId: hero?.id ?? null,
                        activeCharacterIds: catalog.map((c) => c.id),
                        antagonistCharacterIds: antagonists.map((c) => c.id),
                      });
                    }}
                  >
                    Tout le casting
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {catalog.length > 0 ? (
              <CharacterPicker
                label="Héros actif"
                characters={catalog}
                value={draft.characterSelection?.heroCharacterId ?? null}
                onChange={(v) => updateCharacterSelection({ heroCharacterId: typeof v === "string" ? v : null })}
                multiple={false}
                placeholder="Choisir le héros…"
                dataStudioField="studio-hero-character"
              />
            ) : (
              <div className="space-y-2">
                <Label>Héros actif</Label>
                <Input
                  data-testid="studio-hero-character"
                  data-studio-field="studio-hero-character"
                  value={draft.characterSelection?.heroCharacterId ?? ""}
                  onChange={(e) => updateCharacterSelection({ heroCharacterId: e.target.value || null })}
                  placeholder="ID ou nom du héros"
                />
              </div>
            )}

            {catalog.length > 0 ? (
              <CharacterPicker
                label="Personnages actifs"
                characters={catalog}
                value={draft.characterSelection?.activeCharacterIds ?? []}
                onChange={(v) => updateCharacterSelection({ activeCharacterIds: Array.isArray(v) ? v : (v ? [v] : []) })}
                multiple={true}
                placeholder="Ajouter des personnages…"
                dataStudioField="studio-active-characters"
              />
            ) : (
              <div className="space-y-2">
                <Label>Personnages actifs</Label>
                <TagInput
                  values={draft.characterSelection?.activeCharacterIds ?? []}
                  onChange={(v) => updateCharacterSelection({ activeCharacterIds: v })}
                  placeholder="Noms ou IDs des personnages"
                  dataStudioField="studio-active-characters"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Cohérence du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Décor principal</Label>
              <Input
                data-testid="studio-location"
                data-studio-field="studio-location"
                value={draft.chapterCanon?.currentLocation ?? ""}
                onChange={(e) => updateCanon({ currentLocation: e.target.value })}
                placeholder="Ex : Dojo de l'académie, Toit de la tour…"
              />
            </div>
            <div className="space-y-2">
              <Label>Continuité essentielle</Label>
              <TagInput
                values={draft.chapterCanon?.continuityNotes ?? []}
                onChange={(v) => updateCanon({ continuityNotes: v })}
                placeholder="Ex : Ryuu porte son katana brisé"
                dataStudioField="studio-continuity-notes"
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
                  onChange={(e) => updateCanon({ weather: e.target.value })}
                  placeholder="pluie, nuit étoilée…"
                />
              </div>
              <div className="space-y-2">
                <Label>Moment de la journée</Label>
                <Input
                  data-studio-field="studio-time-of-day"
                  value={draft.chapterCanon?.timeOfDay ?? ""}
                  onChange={(e) => updateCanon({ timeOfDay: e.target.value })}
                  placeholder="aube, crépuscule…"
                />
              </div>
              <div className="space-y-2">
                <Label>Contraintes d&apos;univers</Label>
                <TagInput
                  values={draft.chapterCanon?.universeConstraints ?? []}
                  onChange={(v) => updateCanon({ universeConstraints: v })}
                  placeholder="Ex : magie interdite dans cette zone"
                  dataStudioField="studio-universe-constraints"
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
      <StudioInlineIssues title="Points à surveiller" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
