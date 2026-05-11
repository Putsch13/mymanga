/**
 * Grille des sélecteurs de personnages (héros, héros 2, déuteragoniste, actifs).
 *
 * Lorsque le catalogue est non vide on utilise `<CharacterPicker>`, sinon on
 * fallback sur des inputs/tags pour saisie manuelle d'IDs.
 */
"use client";

import type { ChapterStudioData } from "@manga-ai-studio/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CharacterPicker } from "../character-picker";
import { TagInput } from "../tag-input";
import type { CharacterCatalogEntry } from "./types";

export interface CharacterPickersGridProps {
  catalog: CharacterCatalogEntry[];
  draft: ChapterStudioData;
  onUpdate: (
    patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>,
  ) => void;
}

export function CharacterPickersGrid({
  catalog,
  draft,
  onUpdate,
}: CharacterPickersGridProps) {
  const sel = draft.characterSelection;
  const hasCatalog = catalog.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasCatalog ? (
        <CharacterPicker
          label="Héros actif"
          characters={catalog}
          value={sel?.heroCharacterId ?? null}
          onChange={(v) =>
            onUpdate({ heroCharacterId: typeof v === "string" ? v : null })
          }
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
            value={sel?.heroCharacterId ?? ""}
            onChange={(e) => onUpdate({ heroCharacterId: e.target.value || null })}
            placeholder="ID ou nom du héros"
          />
        </div>
      )}

      {hasCatalog ? (
        <CharacterPicker
          label="Héros 2 / co-protagoniste"
          characters={catalog}
          value={sel?.secondaryHeroCharacterId ?? null}
          onChange={(v) =>
            onUpdate({
              secondaryHeroCharacterId: typeof v === "string" ? v : null,
            })
          }
          multiple={false}
          placeholder="Optionnel…"
          dataStudioField="studio-secondary-hero-character"
        />
      ) : (
        <div className="space-y-2">
          <Label>Héros 2 / co-protagoniste</Label>
          <Input
            data-studio-field="studio-secondary-hero-character"
            value={sel?.secondaryHeroCharacterId ?? ""}
            onChange={(e) =>
              onUpdate({ secondaryHeroCharacterId: e.target.value || null })
            }
            placeholder="ID optionnel"
          />
        </div>
      )}

      {hasCatalog ? (
        <CharacterPicker
          label="Déuteragoniste"
          characters={catalog}
          value={sel?.deuteragonistCharacterId ?? null}
          onChange={(v) =>
            onUpdate({
              deuteragonistCharacterId: typeof v === "string" ? v : null,
            })
          }
          multiple={false}
          placeholder="Optionnel (distinct du héros 2)…"
          dataStudioField="studio-deuteragonist-character"
        />
      ) : (
        <div className="space-y-2">
          <Label>Déuteragoniste</Label>
          <Input
            data-studio-field="studio-deuteragonist-character"
            value={sel?.deuteragonistCharacterId ?? ""}
            onChange={(e) =>
              onUpdate({ deuteragonistCharacterId: e.target.value || null })
            }
            placeholder="ID optionnel"
          />
        </div>
      )}

      {hasCatalog ? (
        <CharacterPicker
          label="Personnages actifs"
          characters={catalog}
          value={sel?.activeCharacterIds ?? []}
          onChange={(v) =>
            onUpdate({
              activeCharacterIds: Array.isArray(v) ? v : v ? [v] : [],
            })
          }
          multiple
          placeholder="Ajouter des personnages…"
          dataStudioField="studio-active-characters"
        />
      ) : (
        <div className="space-y-2">
          <Label>Personnages actifs</Label>
          <TagInput
            values={sel?.activeCharacterIds ?? []}
            onChange={(v) => onUpdate({ activeCharacterIds: v })}
            placeholder="Noms ou IDs des personnages"
            dataStudioField="studio-active-characters"
          />
        </div>
      )}
    </div>
  );
}
