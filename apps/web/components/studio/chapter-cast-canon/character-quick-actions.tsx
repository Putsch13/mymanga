/**
 * Bandeau de raccourcis "Remplissage rapide" du step Cast & Canon.
 *
 * Permet en un clic de pousser le héros principal, le casting, les antagonistes
 * ou tout le catalogue dans la sélection en cours.
 */
"use client";

import type { ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import type { CharacterCatalogEntry } from "./types";

export interface CharacterQuickActionsProps {
  catalog: CharacterCatalogEntry[];
  heroes: CharacterCatalogEntry[];
  mainChars: CharacterCatalogEntry[];
  antagonists: CharacterCatalogEntry[];
  onUpdate: (
    patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>,
  ) => void;
}

export function CharacterQuickActions({
  catalog,
  heroes,
  mainChars,
  antagonists,
  onUpdate,
}: CharacterQuickActionsProps) {
  if (catalog.length === 0) return null;

  return (
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
              onUpdate({ heroCharacterId: hero.id });
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
              onUpdate({
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
              onUpdate({
                antagonistCharacterIds: antagonists.map((c) => c.id),
              });
            }}
          >
            Antagonistes
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const hero = heroes[0];
            onUpdate({
              heroCharacterId: hero?.id ?? null,
              activeCharacterIds: catalog.map((c) => c.id),
              antagonistCharacterIds: antagonists.map((c) => c.id),
            });
          }}
        >
          Tout le casting
        </Button>
      </div>
    </div>
  );
}
