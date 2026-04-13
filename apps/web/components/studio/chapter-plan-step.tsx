"use client";

import type { ChapterReadinessIssue, ChapterStudioData } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NarrativeContractCard } from "./narrative-contract-card";
import { ProductionPlanCard } from "./production-plan-card";
import { StudioInlineIssues } from "./studio-inline-issues";

function BeatList({
  title,
  emptyLabel,
  beats,
}: {
  title: string;
  emptyLabel: string;
  beats: Array<{ beatId?: string; label?: string; summary: string }> | undefined;
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(beats ?? []).length > 0 ? (
          beats?.map((beat, index) => (
            <div key={beat.beatId ?? `${title}-${index}`} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="font-medium">{beat.label ?? beat.beatId ?? `Bloc ${index + 1}`}</p>
              <p className="mt-1 text-muted-foreground">{beat.summary}</p>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ChapterPlanStep({
  draft,
  preparationScore,
  issues,
  warningItems,
  generatingOutline,
  imageCounts,
  onIssueAction,
  onUpdateDraft,
  onGenerateOutlines,
  onValidatePlan,
}: {
  draft: ChapterStudioData;
  preparationScore: number;
  issues: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  generatingOutline: boolean;
  imageCounts: {
    estimatedImages: number;
    targetImages: number;
    minimumImages: number;
    missingImages: number;
  };
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: "narrative_contract") => void;
  onGenerateOutlines: () => void | Promise<void>;
  onValidatePlan: () => void;
}) {
  return (
    <div data-studio-section="plan" className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Contrat narratif proposé</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Objectif émotionnel</Label>
            <Input
              data-testid="studio-emotional-goal"
              data-studio-field="studio-emotional-goal"
              value={draft.narrativeContract?.emotionalGoal ?? ""}
              onChange={(event) =>
                onUpdateDraft({
                  ...draft,
                  narrativeContract: {
                    emotionalGoal: event.target.value,
                    heroStateAtStart: draft.narrativeContract?.heroStateAtStart ?? "",
                    heroStateAtEnd: draft.narrativeContract?.heroStateAtEnd ?? "",
                    centralConflict: draft.narrativeContract?.centralConflict ?? "",
                    revealOrInformationGain: draft.narrativeContract?.revealOrInformationGain ?? "",
                    relationshipShift: draft.narrativeContract?.relationshipShift ?? "",
                    chapterQuestion: draft.narrativeContract?.chapterQuestion ?? "",
                    endingMode: draft.narrativeContract?.endingMode ?? "cliffhanger",
                    tone: draft.narrativeContract?.tone ?? "dramatic",
                    intensityCurve: draft.narrativeContract?.intensityCurve ?? [],
                    forbiddenNarrativeMisses: draft.narrativeContract?.forbiddenNarrativeMisses ?? [],
                  },
                }, "narrative_contract")
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Conflit central</Label>
            <Input
              data-testid="studio-central-conflict"
              data-studio-field="studio-central-conflict"
              value={draft.narrativeContract?.centralConflict ?? ""}
              onChange={(event) =>
                onUpdateDraft({
                  ...draft,
                  narrativeContract: {
                    emotionalGoal: draft.narrativeContract?.emotionalGoal ?? "",
                    heroStateAtStart: draft.narrativeContract?.heroStateAtStart ?? "",
                    heroStateAtEnd: draft.narrativeContract?.heroStateAtEnd ?? "",
                    centralConflict: event.target.value,
                    revealOrInformationGain: draft.narrativeContract?.revealOrInformationGain ?? "",
                    relationshipShift: draft.narrativeContract?.relationshipShift ?? "",
                    chapterQuestion: draft.narrativeContract?.chapterQuestion ?? "",
                    endingMode: draft.narrativeContract?.endingMode ?? "cliffhanger",
                    tone: draft.narrativeContract?.tone ?? "dramatic",
                    intensityCurve: draft.narrativeContract?.intensityCurve ?? [],
                    forbiddenNarrativeMisses: draft.narrativeContract?.forbiddenNarrativeMisses ?? [],
                  },
                }, "narrative_contract")
              }
            />
          </div>
          <div className="lg:col-span-2">
            <NarrativeContractCard contract={draft.narrativeContract} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <BeatList title="Outline éditorial" emptyLabel="Aucun outline éditorial généré." beats={draft.editorialOutline?.beats} />
        <BeatList title="Plan de production" emptyLabel="Aucun outline de production généré." beats={draft.productionOutline?.beats} />
      </div>

      <ProductionPlanCard plan={draft.productionPlan} />

      {/* Section Auto-déductions (lecture seule) */}
      {draft.productionPlan?.premiumReadinessScore !== undefined && (
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Auto-déductions narratives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Ces informations sont inférées automatiquement par le backend — aucune configuration manuelle requise.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {draft.productionPlan?.propCoverage?.covered && draft.productionPlan.propCoverage.covered.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Props inférés</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(draft.productionPlan.propCoverage.covered)].slice(0, 6).map((prop) => (
                      <span key={prop} className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">{prop}</span>
                    ))}
                  </div>
                </div>
              )}
              {draft.productionPlan?.cutawayCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Plans de coupe prévus</p>
                  <p className="font-semibold">{draft.productionPlan.cutawayCoverage.count}</p>
                </div>
              )}
              {draft.productionPlan?.enemyCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Panels focus ennemi</p>
                  <p className="font-semibold">{draft.productionPlan.enemyCoverage.panelCount}</p>
                </div>
              )}
              {draft.productionPlan?.dialogueAnchorCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Dialogues ancrés</p>
                  <p className="font-semibold">{draft.productionPlan.dialogueAnchorCoverage.anchored}</p>
                </div>
              )}
              {draft.productionPlan?.npcCoverage && (
                <div>
                  <p className="text-muted-foreground text-xs">Densité PNJ moy.</p>
                  <p className="font-semibold">{draft.productionPlan.npcCoverage.avgNpcCount.toFixed(1)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Readiness du plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-5">
            <div><p className="text-muted-foreground">Préparation</p><p>{preparationScore}/100</p></div>
            <div><p className="text-muted-foreground">Estimées</p><p>{imageCounts.estimatedImages}</p></div>
            <div><p className="text-muted-foreground">Cibles</p><p>{imageCounts.targetImages}</p></div>
            <div><p className="text-muted-foreground">Minimum</p><p>{imageCounts.minimumImages}</p></div>
            <div><p className="text-muted-foreground">Manquantes</p><p>{imageCounts.missingImages}</p></div>
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => void onGenerateOutlines()} disabled={generatingOutline}>
              {generatingOutline ? "Génération..." : "Régénérer le plan"}
            </Button>
            <Button type="button" onClick={onValidatePlan}>
              Valider le plan
            </Button>
          </div>
        </CardContent>
      </Card>

      <StudioInlineIssues title="Blocants du plan" issues={issues} emptyLabel="Aucun blocant: le plan peut partir en génération." testIdPrefix={null} onAction={onIssueAction} />
      <StudioInlineIssues title="Warnings du plan" issues={warningItems} tone="neutral" testIdPrefix={null} onAction={onIssueAction} />
    </div>
  );
}
