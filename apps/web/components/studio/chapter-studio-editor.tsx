"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChapterStudioData,
  ChapterStudioSnapshot,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WizardStepCard } from "./wizard-step-card";
import { NarrativeContractCard } from "./narrative-contract-card";
import { ProductionPlanCard } from "./production-plan-card";

type StudioResponse = {
  chapter: {
    id: string;
    chapterNumber: number;
    title: string | null;
  };
  snapshot: ChapterStudioSnapshot;
};

function joinList(value: string[] | undefined) {
  return (value ?? []).join(", ");
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const STEP_ORDER: Array<{ id: ChapterStudioStep; title: string; description: string }> = [
  { id: "intent", title: "1. Intention", description: "Pitch, titre, place dans l’arc." },
  { id: "narrative_contract", title: "2. Contrat narratif", description: "Objectif émotionnel et promesse dramatique." },
  { id: "characters", title: "3. Personnages", description: "Casting actif, héros verrouillé, voix." },
  { id: "canon", title: "4. Canon chapitre", description: "Lieu, tenue, météo, blessures, continuité." },
  { id: "editorial_outline", title: "5. Outline éditorial", description: "Macro-blocs lisibles humain." },
  { id: "production_outline", title: "6. Outline production", description: "Beats détaillés 55+ images." },
  { id: "production_plan", title: "7. Plan de production", description: "Pages, panels, compteur images." },
  { id: "readiness", title: "8. Validation", description: "Checklist et score de préparation." },
];

export function ChapterStudioEditor({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [snapshot, setSnapshot] = useState<ChapterStudioSnapshot | null>(null);
  const [draft, setDraft] = useState<ChapterStudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const [activeStep, setActiveStep] = useState<ChapterStudioStep>("intent");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/studio`);
      const json = (await res.json()) as StudioResponse;
      setSnapshot(json.snapshot);
      setDraft(json.snapshot.data);
      setActiveStep(json.snapshot.currentStep);
      setLoading(false);
    }

    void load();
  }, [chapterId, projectId]);

  async function save(nextDraft: ChapterStudioData, step = activeStep) {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/studio`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStep: step,
        transitionReason: "autosave",
        data: nextDraft,
      }),
    });
    const json = await res.json();
    setSnapshot(json.snapshot);
    setDraft(json.snapshot.data);
    setSaving(false);
    setMessage("Brouillon studio sauvegardé.");
  }

  function updateDraft(next: ChapterStudioData, step = activeStep) {
    setDraft(next);
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      void save(next, step);
    }, 900);
  }

  const readiness = snapshot?.data.readinessReport;
  const stepIndex = STEP_ORDER.findIndex((step) => step.id === activeStep);

  const derivedStepState = useMemo(() => {
    const completed = new Set(readiness?.completedSteps ?? []);
    return STEP_ORDER.map((step, index) => ({
      ...step,
      state: completed.has(step.id)
        ? ("done" as const)
        : index === stepIndex
          ? ("current" as const)
          : ("blocked" as const),
    }));
  }, [readiness?.completedSteps, stepIndex]);

  async function generateOutlines() {
    if (!draft?.intent?.shortPitch) {
      setMessage("Ajoute d’abord un pitch de chapitre.");
      return;
    }
    setGeneratingOutline(true);
    const res = await fetch(`/api/projects/${projectId}/chapters/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIntent: draft.intent.shortPitch }),
    });
    const json = await res.json();
    const nextDraft: ChapterStudioData = {
      ...draft,
      editorialOutline: json.editorialOutline,
      productionOutline: json.productionOutline,
      productionPlan: json.productionPlan,
    };
    setActiveStep("production_plan");
    await save(nextDraft, "production_plan");
    setGeneratingOutline(false);
    setMessage("Outline éditorial, outline production et plan calculés.");
  }

  if (loading || !draft || !snapshot) {
    return <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">Chargement du studio…</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        {derivedStepState.map((step) => (
          <button key={step.id} type="button" className="block w-full text-left" onClick={() => setActiveStep(step.id)}>
            <WizardStepCard title={step.title} description={step.description} state={step.state} />
          </button>
        ))}
      </div>
      <div className="space-y-6">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Chapter Studio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Titre de travail</Label>
                <Input
                  data-testid="studio-working-title"
                  value={draft.intent?.workingTitle ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      intent: { ...draft.intent, workingTitle: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Place dans l’arc</Label>
                <Input
                  value={draft.intent?.arcPosition ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      intent: { ...draft.intent, arcPosition: e.target.value },
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pitch du chapitre</Label>
              <Textarea
                data-testid="studio-short-pitch"
                value={draft.intent?.shortPitch ?? ""}
                onChange={(e) =>
                  updateDraft({
                    ...draft,
                    intent: { ...draft.intent, shortPitch: e.target.value },
                  })
                }
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Objectif émotionnel</Label>
                <Input
                  data-testid="studio-emotional-goal"
                  value={draft.narrativeContract?.emotionalGoal ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      narrativeContract: {
                        emotionalGoal: e.target.value,
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
                  value={draft.narrativeContract?.centralConflict ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      narrativeContract: {
                        emotionalGoal: draft.narrativeContract?.emotionalGoal ?? "",
                        heroStateAtStart: draft.narrativeContract?.heroStateAtStart ?? "",
                        heroStateAtEnd: draft.narrativeContract?.heroStateAtEnd ?? "",
                        centralConflict: e.target.value,
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
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Héros actif</Label>
                <Input
                  data-testid="studio-hero-character"
                  value={draft.characterSelection?.heroCharacterId ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      characterSelection: {
                        heroCharacterId: e.target.value,
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
                  value={joinList(draft.characterSelection?.activeCharacterIds)}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      characterSelection: {
                        heroCharacterId: draft.characterSelection?.heroCharacterId ?? null,
                        activeCharacterIds: splitList(e.target.value),
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
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Décor principal</Label>
                <Input
                  data-testid="studio-location"
                  value={draft.chapterCanon?.currentLocation ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: e.target.value,
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
                <Label>Météo</Label>
                <Input
                  value={draft.chapterCanon?.weather ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: draft.chapterCanon?.currentLocation ?? null,
                        weather: e.target.value,
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
                  value={draft.chapterCanon?.timeOfDay ?? ""}
                  onChange={(e) =>
                    updateDraft({
                      ...draft,
                      chapterCanon: {
                        heroOutfitId: draft.chapterCanon?.heroOutfitId ?? null,
                        activeCharacters: draft.chapterCanon?.activeCharacters ?? [],
                        allowedVisualChanges: draft.chapterCanon?.allowedVisualChanges ?? [],
                        currentLocation: draft.chapterCanon?.currentLocation ?? null,
                        weather: draft.chapterCanon?.weather ?? null,
                        timeOfDay: e.target.value,
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
            </div>
            <div className="space-y-2">
              <Label>Notes de continuité</Label>
              <Textarea
                value={joinList(draft.chapterCanon?.continuityNotes)}
                onChange={(e) =>
                  updateDraft({
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
                      continuityNotes: splitList(e.target.value),
                      inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                      universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                    },
                  }, "canon")
                }
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button data-testid="studio-save-button" type="button" onClick={() => void save(draft, activeStep)} disabled={saving}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button data-testid="studio-generate-outline-button" type="button" variant="secondary" onClick={() => void generateOutlines()} disabled={generatingOutline}>
                {generatingOutline ? "Génération..." : "Générer outline & plan"}
              </Button>
            </div>
            {message ? <p data-testid="studio-message" className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

        <NarrativeContractCard contract={draft.narrativeContract} />
        <ProductionPlanCard plan={draft.productionPlan} />

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Pré-validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Score de préparation: {readiness?.preparationScore ?? 0}/100</p>
            <div>
              <p className="font-medium">Blocants</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {(readiness?.blockingIssues ?? []).length > 0 ? (
                  readiness?.blockingIssues.map((issue) => <li key={issue}>- {issue}</li>)
                ) : (
                  <li>- Aucun blocant</li>
                )}
              </ul>
            </div>
            <div>
              <p className="font-medium">Warnings</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {(readiness?.warnings ?? []).length > 0 ? (
                  readiness?.warnings.map((warning) => <li key={warning}>- {warning}</li>)
                ) : (
                  <li>- Aucun warning</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
