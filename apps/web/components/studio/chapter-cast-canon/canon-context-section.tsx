/**
 * Section "Contexte de la scène" : lieu, notes de continuité, PNJ récurrents,
 * résolveur PNJ libre, et mode expert (météo / heure / contraintes d'univers).
 */
"use client";

import type { ChapterStudioData } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Button } from "@/components/ui/button";
import { TagInput } from "../tag-input";
import { RecurringNpcsSection } from "./recurring-npcs-section";
import { NpcResolverSection } from "./npc-resolver-section";
import type { NpcRow, RecurringNpc } from "./types";

export interface CanonContextSectionProps {
  draft: ChapterStudioData;
  onUpdateCanon: (
    patch: Partial<NonNullable<ChapterStudioData["chapterCanon"]>>,
  ) => void;
  recurringNpcs: RecurringNpc[];
  onPromoteNpc: (stableNpcId: string, currentLabel: string) => void;
  npcRawDescription: string;
  onChangeNpcDescription: (value: string) => void;
  npcResolving: boolean;
  npcResolveError: string | null;
  onResolveNpc: () => void;
  npcRows: NpcRow[];
  onRemoveNpcRow: (row: NpcRow) => void;
  onContinue: () => void;
}

export function CanonContextSection({
  draft,
  onUpdateCanon,
  recurringNpcs,
  onPromoteNpc,
  npcRawDescription,
  onChangeNpcDescription,
  npcResolving,
  npcResolveError,
  onResolveNpc,
  npcRows,
  onRemoveNpcRow,
  onContinue,
}: CanonContextSectionProps) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Contexte de la scène</CardTitle>
        <p className="text-xs text-muted-foreground">
          Décris le cadre de ton chapitre. Ces informations alimentent
          directement les décors et le monde visuel.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Où se passe l&apos;action ?</Label>
              <FieldTooltip
                text="Le lieu principal de la scène. Utilisé pour les backgrounds et le monde visuel."
                example="Ruines d'une tour — nuit / Marché couvert"
              />
            </div>
            <Input
              data-testid="studio-location"
              data-studio-field="studio-location"
              value={draft.chapterCanon?.currentLocation ?? ""}
              onChange={(e) => onUpdateCanon({ currentLocation: e.target.value })}
              placeholder="Ex : Dojo de l'académie, Toit de la tour…"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label>Ce que l&apos;IA ne doit pas inventer</Label>
              <FieldTooltip
                text="Éléments importants de continuité ou interdictions pour l'IA."
                example="Pas de combat, le héros porte son katana brisé"
              />
            </div>
            <TagInput
              values={draft.chapterCanon?.continuityNotes ?? []}
              onChange={(v) => onUpdateCanon({ continuityNotes: v })}
              placeholder="Ex : Pas de combat dans ce chapitre"
              dataStudioField="studio-continuity-notes"
            />
          </div>
        </div>

        <RecurringNpcsSection
          recurringNpcs={recurringNpcs}
          onPromote={onPromoteNpc}
        />

        <NpcResolverSection
          rawDescription={npcRawDescription}
          onChangeDescription={onChangeNpcDescription}
          resolving={npcResolving}
          error={npcResolveError}
          onResolve={onResolveNpc}
          rows={npcRows}
          onRemove={onRemoveNpcRow}
        />

        <details className="rounded-xl border border-border/60 bg-background/30 p-4">
          <summary className="cursor-pointer text-sm font-medium">Mode expert</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Météo</Label>
              <Input
                data-studio-field="studio-weather"
                value={draft.chapterCanon?.weather ?? ""}
                onChange={(e) => onUpdateCanon({ weather: e.target.value })}
                placeholder="pluie, nuit étoilée…"
              />
            </div>
            <div className="space-y-2">
              <Label>Moment de la journée</Label>
              <Input
                data-studio-field="studio-time-of-day"
                value={draft.chapterCanon?.timeOfDay ?? ""}
                onChange={(e) => onUpdateCanon({ timeOfDay: e.target.value })}
                placeholder="aube, crépuscule…"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraintes d&apos;univers</Label>
              <TagInput
                values={draft.chapterCanon?.universeConstraints ?? []}
                onChange={(v) => onUpdateCanon({ universeConstraints: v })}
                placeholder="Ex : magie interdite dans cette zone"
                dataStudioField="studio-universe-constraints"
              />
            </div>
          </div>
        </details>

        <div className="flex justify-end">
          <Button type="button" onClick={onContinue}>
            Continuer vers le plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
