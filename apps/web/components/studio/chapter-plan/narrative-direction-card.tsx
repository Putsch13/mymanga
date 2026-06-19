/**
 * Carte "Direction narrative du chapitre" — édition rapide de l'objectif
 * émotionnel et du conflit central + lien vers la vue détaillée du contrat
 * narratif (`NarrativeContractCard`).
 *
 * Note : on garde une logique "merge" verbeuse pour ne pas perdre les autres
 * champs du `narrativeContract` lors d'une édition partielle d'un seul
 * input — ce comportement existait déjà avant la refacto.
 */
"use client";

import type { ChapterStudioData, ChapterStudioStep } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NarrativeContractCard } from "../narrative-contract-card";

export interface NarrativeDirectionCardProps {
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
}

export function NarrativeDirectionCard({ draft, onUpdateDraft }: NarrativeDirectionCardProps) {
  const setField = (
    key: "emotionalGoal" | "centralConflict",
    value: string,
  ) => {
    const current = draft.narrativeContract;
    onUpdateDraft(
      {
        ...draft,
        narrativeContract: {
          emotionalGoal: current?.emotionalGoal ?? "",
          heroStateAtStart: current?.heroStateAtStart ?? "",
          heroStateAtEnd: current?.heroStateAtEnd ?? "",
          centralConflict: current?.centralConflict ?? "",
          revealOrInformationGain: current?.revealOrInformationGain ?? "",
          relationshipShift: current?.relationshipShift ?? "",
          chapterQuestion: current?.chapterQuestion ?? "",
          endingMode: current?.endingMode ?? "cliffhanger",
          tone: current?.tone ?? "dramatic",
          intensityCurve: current?.intensityCurve ?? [],
          forbiddenNarrativeMisses: current?.forbiddenNarrativeMisses ?? [],
          [key]: value,
        },
      },
      "narrative_contract",
    );
  };

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Direction narrative du chapitre</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Objectif émotionnel</Label>
            <FieldTooltip
              text="Ce que le lecteur doit ressentir à la fin du chapitre."
              example="Tension insoutenable / Soulagement inattendu"
            />
          </div>
          <Input
            data-testid="studio-emotional-goal"
            data-studio-field="studio-emotional-goal"
            value={draft.narrativeContract?.emotionalGoal ?? ""}
            onChange={(event) => setField("emotionalGoal", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Conflit central</Label>
            <FieldTooltip
              text="L'obstacle principal qui structure le chapitre."
              example="Le héros doit choisir entre deux loyautés."
            />
          </div>
          <Input
            data-testid="studio-central-conflict"
            data-studio-field="studio-central-conflict"
            value={draft.narrativeContract?.centralConflict ?? ""}
            onChange={(event) => setField("centralConflict", event.target.value)}
          />
        </div>
        <div className="lg:col-span-2">
          <NarrativeContractCard contract={draft.narrativeContract} />
        </div>
      </CardContent>
    </Card>
  );
}
