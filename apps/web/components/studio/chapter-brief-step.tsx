"use client";

import type { ChapterCreativeControls, ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLOT_OPTIONS } from "./chapter-studio-flow";
import { StudioInlineIssues } from "./studio-inline-issues";

function SliderField({
  label,
  value,
  helper,
  onChange,
}: {
  label: string;
  value: number;
  helper: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{value}/100</span>
      </div>
      <input type="range" min={0} max={100} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-primary" />
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export function ChapterBriefStep({
  draft,
  creativityControls,
  issues,
  warningItems,
  generatingOutline,
  expertMode,
  onIssueAction,
  onUpdateDraft,
  onGenerateBase,
}: {
  draft: ChapterStudioData;
  creativityControls: ChapterCreativeControls;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatingOutline: boolean;
  expertMode?: boolean;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "intent") => void;
  onGenerateBase: () => void | Promise<void>;
}) {
  return (
    <div data-studio-section="brief" className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Brief du chapitre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Titre de travail</Label>
                <FieldTooltip
                  text="Le titre provisoire utilisé pendant la création. Il peut changer."
                  example="L'Éveil du Traître / La Nuit des Lames"
                />
              </div>
              <Input
                data-testid="studio-working-title"
                data-studio-field="studio-working-title"
                value={draft.intent?.workingTitle ?? ""}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    intent: { ...draft.intent, workingTitle: event.target.value },
                  }, "intent")
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Label>Pitch du chapitre</Label>
                <FieldTooltip
                  text="Décris en 1-2 phrases ce qui se passe dans ce chapitre. C'est la boussole de l'IA."
                  example="Le héros affronte son mentor dans les ruines."
                />
                <span className="text-xs text-rose-400">*requis</span>
              </div>
              <Textarea
                data-testid="studio-short-pitch"
                data-studio-field="studio-short-pitch"
                rows={3}
                placeholder="Ex. : Le héros affronte son ancien mentor dans les ruines de la tour. Il découvre que la trahison vient de plus haut…"
                value={draft.intent?.shortPitch ?? ""}
                onChange={(event) =>
                  onUpdateDraft({
                    ...draft,
                    intent: { ...draft.intent, shortPitch: event.target.value },
                  }, "intent")
                }
              />
            </div>
          </div>

          {/* Conflit principal — sorti du mode expert car requis pour la génération */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Label>Conflit principal du chapitre</Label>
              <FieldTooltip
                text="L'obstacle concret que le héros doit surmonter dans CE chapitre."
                example="Lyra doit choisir entre sauver son ami et révéler son secret."
              />
              <span className="text-xs text-rose-400">*requis</span>
            </div>
            <Input
              data-testid="studio-main-conflict"
              data-studio-field="studio-main-conflict"
              placeholder="Ex. : Lyra découvre que son mentor l'a trahie et doit choisir entre vengeance et pardon"
              value={draft.intent?.mainConflict ?? ""}
              onChange={(event) =>
                onUpdateDraft({
                  ...draft,
                  intent: { ...draft.intent, mainConflict: event.target.value },
                }, "intent")
              }
            />
            <p className="text-xs text-muted-foreground">
              Le conflit central qui structure ce chapitre — utilisé par l&apos;IA pour construire les beats et les dialogues.
            </p>
          </div>

          <div className="space-y-3">
            <Label>Rythme principal</Label>
            <div className="grid gap-3 lg:grid-cols-3">
              {PLOT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onUpdateDraft({ ...draft, selectedPlotLabel: option.id }, "intent")}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    (draft.selectedPlotLabel ?? "bold") === option.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-card/30 text-muted-foreground hover:border-border"
                  }`}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs opacity-70">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          {expertMode && (
          <details className="rounded-xl border border-border/60 bg-background/30 p-4">
            <summary className="cursor-pointer text-sm font-medium">Réglages avancés (optionnel)</summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label>Place dans l’arc narratif</Label>
                  <FieldTooltip
                    text="Où en est-on dans le récit global ? Aide l'IA à doser la tension."
                    example="Milieu d'arc — montée en tension"
                  />
                </div>
                <Input
                  data-studio-field="studio-arc-position"
                  placeholder="Ex. : Milieu d’arc, montée en tension"
                  value={draft.intent?.arcPosition ?? ""}
                  onChange={(event) =>
                    onUpdateDraft({
                      ...draft,
                      intent: { ...draft.intent, arcPosition: event.target.value },
                    }, "intent")
                  }
                />
                <p className="text-xs text-muted-foreground">Positionne ce chapitre dans l’arc global (début, pivot, climax, résolution…).</p>
              </div>

              <SliderField
                label="Originalité contrôlée"
                value={creativityControls.noveltyLevel}
                helper="Plus haut = l'IA introduit plus de variations et de surprises dans le chapitre."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, noveltyLevel: value } }, "intent")}
              />
              <SliderField
                label="Respect du canon"
                value={creativityControls.worldStrictness}
                helper="Plus haut = l'IA reste très proche de l'univers et des règles établies."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, worldStrictness: value } }, "intent")}
              />
              <SliderField
                label="Audace visuelle"
                value={creativityControls.visualExoticism}
                helper="Plus haut = silhouettes, tenues et détails visuels plus atypiques et originaux."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, visualExoticism: value } }, "intent")}
              />
              <SliderField
                label="Variété des figurants"
                value={creativityControls.npcVariety}
                helper="Plus haut = les personnages secondaires et la foule sont plus variés et distinctifs."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, npcVariety: value } }, "intent")}
              />
              <SliderField
                label="Richesse des décors"
                value={creativityControls.environmentRichness}
                helper="Plus haut = les environnements sont plus détaillés et immersifs."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, environmentRichness: value } }, "intent")}
              />
            </div>
          </details>
          )}

          <div className="flex justify-end">
            <Button data-testid="studio-generate-outline-button" type="button" onClick={() => void onGenerateBase()} disabled={generatingOutline}>
              {generatingOutline ? "Génération..." : "Générer une base de chapitre"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <StudioInlineIssues title="Blocants du brief" issues={issues} emptyLabel="Aucun blocant sur le brief." testIdPrefix={null} onAction={onIssueAction} />
      <StudioInlineIssues title="Warnings du brief" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
