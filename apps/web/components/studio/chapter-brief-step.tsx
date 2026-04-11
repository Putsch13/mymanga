"use client";

import type { ChapterCreativeControls, ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  onIssueAction,
  onUpdateDraft,
  onGenerateBase,
}: {
  draft: ChapterStudioData;
  creativityControls: ChapterCreativeControls;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatingOutline: boolean;
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
              <Label>Titre de travail</Label>
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
              <Label>Pitch du chapitre</Label>
              <Textarea
                data-testid="studio-short-pitch"
                data-studio-field="studio-short-pitch"
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

          <details className="rounded-xl border border-border/60 bg-background/30 p-4">
            <summary className="cursor-pointer text-sm font-medium">Mode expert</summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Place dans l’arc</Label>
                  <Input
                    data-studio-field="studio-arc-position"
                    value={draft.intent?.arcPosition ?? ""}
                    onChange={(event) =>
                      onUpdateDraft({
                        ...draft,
                        intent: { ...draft.intent, arcPosition: event.target.value },
                      }, "intent")
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conflit principal</Label>
                  <Input
                    data-studio-field="studio-main-conflict"
                    value={draft.intent?.mainConflict ?? ""}
                    onChange={(event) =>
                      onUpdateDraft({
                        ...draft,
                        intent: { ...draft.intent, mainConflict: event.target.value },
                      }, "intent")
                    }
                  />
                </div>
              </div>

              <SliderField
                label="Novelty"
                value={creativityControls.noveltyLevel}
                helper="Plus haut = plus de variation contrôlée."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, noveltyLevel: value } }, "intent")}
              />
              <SliderField
                label="World strictness"
                value={creativityControls.worldStrictness}
                helper="Plus haut = plus collé au canon."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, worldStrictness: value } }, "intent")}
              />
              <SliderField
                label="Visual exoticism"
                value={creativityControls.visualExoticism}
                helper="Plus haut = silhouettes et détails plus atypiques."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, visualExoticism: value } }, "intent")}
              />
              <SliderField
                label="NPC variety"
                value={creativityControls.npcVariety}
                helper="Plus haut = PNJ plus variés."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, npcVariety: value } }, "intent")}
              />
              <SliderField
                label="Environment richness"
                value={creativityControls.environmentRichness}
                helper="Plus haut = décors plus denses."
                onChange={(value) => onUpdateDraft({ ...draft, creativityControls: { ...creativityControls, environmentRichness: value } }, "intent")}
              />
            </div>
          </details>

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
