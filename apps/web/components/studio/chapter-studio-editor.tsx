"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChapterCreativeControls,
  ChapterReadinessIssue,
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
import { ChapterGenerateLauncher } from "./chapter-generate-launcher";
import { ChapterReviewBoard } from "./chapter-review-board";

type StudioResponse = {
  project: {
    id: string;
    title: string;
  };
  chapter: {
    id: string;
    chapterNumber: number;
    title: string | null;
    summary: string | null;
    status: string;
    userIntent: string | null;
  };
  snapshot: ChapterStudioSnapshot;
  generationContext: {
    stack: {
      canGenerateChapters: boolean;
      blockers: string[];
    };
    imageStats: {
      total: number;
      completed: number;
      failed: number;
      pending: number;
    };
  };
};

type TunnelSectionId = ChapterStudioStep | "generation" | "review";

const STEP_ORDER: Array<{ id: ChapterStudioStep; title: string; description: string }> = [
  { id: "intent", title: "1. Intention", description: "Pitch, rythme et réglages créatifs." },
  { id: "narrative_contract", title: "2. Contrat narratif", description: "Promesse dramatique et trajectoire émotionnelle." },
  { id: "characters", title: "3. Personnages", description: "Casting actif, héros verrouillé et présence chapter-ready." },
  { id: "canon", title: "4. Canon chapitre", description: "Lieu, météo, continuité et contraintes visuelles." },
  { id: "editorial_outline", title: "5. Outline éditorial", description: "Vue humaine du déroulé du chapitre." },
  { id: "production_outline", title: "6. Outline production", description: "Beats détaillés avant génération." },
  { id: "production_plan", title: "7. Plan de production", description: "Budget images, pages et panels critiques." },
  { id: "readiness", title: "8. Readiness", description: "Blocants restants avant le run final." },
];

const EXTRA_SECTIONS: Array<{ id: "generation" | "review"; title: string; description: string }> = [
  { id: "generation", title: "9. Génération", description: "Lancement pipeline et suivi d’exécution." },
  { id: "review", title: "10. QA / Review", description: "Validation visuelle et clôture chapitre." },
];

const PLOT_OPTIONS: Array<{ id: "safe" | "bold" | "shock"; label: string; description: string }> = [
  { id: "safe", label: "Progressif", description: "Montée en douceur avec variations maîtrisées." },
  { id: "bold", label: "Intense", description: "Équilibre entre tension, rythme et surprise." },
  { id: "shock", label: "Explosif", description: "Rebondissements plus agressifs et pics forts." },
];

const DEFAULT_CREATIVE_CONTROLS: ChapterCreativeControls = {
  noveltyLevel: 55,
  worldStrictness: 85,
  visualExoticism: 50,
  npcVariety: 60,
  environmentRichness: 78,
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

function isStudioStep(value: TunnelSectionId): value is ChapterStudioStep {
  return STEP_ORDER.some((step) => step.id === value);
}

function normalizeCreativeControls(value: Partial<ChapterCreativeControls> | undefined): ChapterCreativeControls {
  return {
    noveltyLevel: value?.noveltyLevel ?? DEFAULT_CREATIVE_CONTROLS.noveltyLevel,
    worldStrictness: value?.worldStrictness ?? DEFAULT_CREATIVE_CONTROLS.worldStrictness,
    visualExoticism: value?.visualExoticism ?? DEFAULT_CREATIVE_CONTROLS.visualExoticism,
    npcVariety: value?.npcVariety ?? DEFAULT_CREATIVE_CONTROLS.npcVariety,
    environmentRichness: value?.environmentRichness ?? DEFAULT_CREATIVE_CONTROLS.environmentRichness,
  };
}

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

export function ChapterStudioEditor({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [chapterTitle, setChapterTitle] = useState<string>("");
  const [snapshot, setSnapshot] = useState<ChapterStudioSnapshot | null>(null);
  const [draft, setDraft] = useState<ChapterStudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generationContext, setGenerationContext] = useState<StudioResponse["generationContext"] | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const [activeStep, setActiveStep] = useState<ChapterStudioStep>("intent");
  const [activeSection, setActiveSection] = useState<TunnelSectionId>("intent");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/studio`, { cache: "no-store" });
      const json = (await response.json()) as StudioResponse;
      setProjectTitle(json.project.title);
      setChapterTitle(json.chapter.title ?? `Chapitre ${json.chapter.chapterNumber}`);
      setSnapshot(json.snapshot);
      setGenerationContext(json.generationContext);
      setDraft({
        ...json.snapshot.data,
        selectedPlotLabel: json.snapshot.data.selectedPlotLabel ?? "bold",
        creativityControls: normalizeCreativeControls(json.snapshot.data.creativityControls),
      });
      setActiveStep(json.snapshot.currentStep);
      setActiveSection(json.snapshot.currentStep);
      setLoading(false);
    }

    void load();
  }, [chapterId, projectId]);

  useEffect(() => () => {
    if (autosaveRef.current) {
      window.clearTimeout(autosaveRef.current);
    }
  }, []);

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
    const nextSnapshot = json.snapshot as ChapterStudioSnapshot;
    setSnapshot(nextSnapshot);
    setDraft({
      ...nextSnapshot.data,
      selectedPlotLabel: nextSnapshot.data.selectedPlotLabel ?? nextDraft.selectedPlotLabel ?? "bold",
      creativityControls: normalizeCreativeControls(nextSnapshot.data.creativityControls ?? nextDraft.creativityControls),
    });
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

  function goToSection(section: TunnelSectionId, fieldId?: string | null) {
    setActiveSection(section);
    if (isStudioStep(section)) {
      setActiveStep(section);
    }

    if (fieldId) {
      window.setTimeout(() => {
        const target = document.querySelector<HTMLElement>(`[data-studio-field="${fieldId}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
      }, 120);
      return;
    }

    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-studio-section="${section}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  const readiness = snapshot?.data.readinessReport;
  const blockerItems = useMemo(() => readiness?.blockerItems ?? [], [readiness?.blockerItems]);
  const warningItems = useMemo(() => readiness?.warningItems ?? [], [readiness?.warningItems]);
  const generatedImages = generationContext?.imageStats.total ?? readiness?.imageCounts.generatedImages ?? 0;
  const acceptedImages = readiness?.imageCounts.acceptedImages ?? 0;
  const minimumImages = readiness?.imageCounts.minimumImages ?? 55;
  const stackReady = generationContext?.stack.canGenerateChapters ?? true;
  const canAccessGeneration = blockerItems.length === 0 || generatedImages > 0 || snapshot?.status === "GENERATING";
  const canAccessReview = generatedImages > 0 || ["QA_REVIEW", "NEEDS_FIXES", "COMPLETED", "PUBLISHED", "GENERATION_PARTIAL"].includes(snapshot?.status ?? "");

  const derivedStepState = useMemo(() => {
    const completed = new Set(readiness?.completedSteps ?? []);
    const blockersByStep = new Map<ChapterStudioStep, number>();
    for (const issue of blockerItems) {
      blockersByStep.set(issue.step, (blockersByStep.get(issue.step) ?? 0) + 1);
    }

    return STEP_ORDER.map((step) => {
      const blockerCount = blockersByStep.get(step.id) ?? 0;
      return {
        ...step,
        badge: blockerCount > 0 ? `${blockerCount} blocant${blockerCount > 1 ? "s" : ""}` : null,
        state:
          activeSection === step.id
            ? ("current" as const)
            : completed.has(step.id) && blockerCount === 0
              ? ("done" as const)
              : ("blocked" as const),
      };
    });
  }, [activeSection, blockerItems, readiness?.completedSteps]);

  const extraSectionState = useMemo(() => ([
    {
      ...EXTRA_SECTIONS[0],
      badge: blockerItems.length > 0 && generatedImages === 0 ? `${blockerItems.length} blocant${blockerItems.length > 1 ? "s" : ""}` : generatedImages > 0 ? `${generatedImages} image${generatedImages > 1 ? "s" : ""}` : null,
      state: activeSection === "generation" ? ("current" as const) : canAccessGeneration ? ("done" as const) : ("blocked" as const),
    },
    {
      ...EXTRA_SECTIONS[1],
      badge: generatedImages > 0 ? `${acceptedImages}/${minimumImages}` : null,
      state: activeSection === "review" ? ("current" as const) : canAccessReview ? ("done" as const) : ("blocked" as const),
    },
  ]), [acceptedImages, activeSection, blockerItems.length, canAccessGeneration, canAccessReview, generatedImages, minimumImages]);

  async function generateOutlines() {
    if (!draft?.intent?.shortPitch) {
      setMessage("Ajoute d’abord un pitch de chapitre.");
      goToSection("intent", "studio-short-pitch");
      return;
    }
    setGeneratingOutline(true);
    setMessage(null);
    const response = await fetch(`/api/projects/${projectId}/chapters/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIntent: draft.intent.shortPitch,
        selectedPlotLabel: draft.selectedPlotLabel ?? "bold",
        creativityControls: normalizeCreativeControls(draft.creativityControls),
        focusCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setGeneratingOutline(false);
      setMessage(json.error ?? "La génération des outlines a échoué.");
      return;
    }
    const nextDraft: ChapterStudioData = {
      ...draft,
      editorialOutline: json.editorialOutline,
      productionOutline: json.productionOutline,
      productionPlan: json.productionPlan,
    };
    setActiveStep("production_plan");
    setActiveSection("production_plan");
    await save(nextDraft, "production_plan");
    setGeneratingOutline(false);
    setMessage("Outline éditorial, outline production et plan calculés.");
  }

  async function handleIssueAction(issue: ChapterReadinessIssue) {
    if (issue.action === "generate_outline") {
      goToSection(issue.step, issue.field);
      await generateOutlines();
      return;
    }
    if (issue.action === "open_generation") {
      goToSection("generation");
      return;
    }
    if (issue.action === "open_review") {
      goToSection("review");
      return;
    }
    goToSection(issue.step, issue.field);
  }

  if (loading || !draft || !snapshot) {
    return <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">Chargement du studio…</div>;
  }

  const creativityControls = normalizeCreativeControls(draft.creativityControls);
  const title = draft.intent?.workingTitle ?? chapterTitle;
  const chapterSummary = draft.editorialOutline?.summary ?? snapshot.data.editorialOutline?.summary ?? snapshot.data.intent?.shortPitch ?? "Configure puis débloque le chapitre depuis ce tunnel unique.";
  const launchBlockedByReadiness = blockerItems.length > 0 && generatedImages === 0;
  const launchDisabledMessage = launchBlockedByReadiness
    ? "Corrige d’abord les blocants du studio pour lancer la génération."
    : !stackReady
      ? "La stack de génération n’est pas prête. Corrige les blocants techniques ci-dessous."
      : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        {derivedStepState.map((step) => (
          <button key={step.id} type="button" className="block w-full text-left" onClick={() => goToSection(step.id)}>
            <WizardStepCard title={step.title} description={step.description} state={step.state} badge={step.badge} />
          </button>
        ))}
        {extraSectionState.map((section) => (
          <button key={section.id} type="button" className="block w-full text-left" onClick={() => goToSection(section.id)}>
            <WizardStepCard title={section.title} description={section.description} state={section.state} badge={section.badge} />
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Tunnel Chapter Studio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Statut</p>
                <p className="mt-2 text-lg font-semibold">{snapshot.status}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Préparation</p>
                <p className="mt-2 text-lg font-semibold">{readiness?.preparationScore ?? 0}/100</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Blocants</p>
                <p className="mt-2 text-lg font-semibold">{blockerItems.length}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Images acceptées</p>
                <p className="mt-2 text-lg font-semibold">{acceptedImages}/{minimumImages}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{chapterSummary}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button data-testid="studio-save-button" type="button" onClick={() => void save(draft, activeStep)} disabled={saving}>
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
              <Button data-testid="studio-generate-outline-button" type="button" variant="secondary" onClick={() => void generateOutlines()} disabled={generatingOutline}>
                {generatingOutline ? "Génération..." : "Générer outline & plan"}
              </Button>
              <Button type="button" variant="outline" onClick={() => goToSection("generation")}>
                Aller à la génération
              </Button>
              <Button type="button" variant="outline" onClick={() => goToSection("review")} disabled={!canAccessReview}>
                Ouvrir la review
              </Button>
            </div>

            {message ? <p data-testid="studio-message" className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Blocants actionnables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {blockerItems.length > 0 ? blockerItems.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/30 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{issue.message}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{issue.step.replaceAll("_", " ")}</p>
                </div>
                <Button data-testid={`blocker-action-${issue.id}`} type="button" variant="secondary" onClick={() => void handleIssueAction(issue)}>
                  {issue.ctaLabel ?? "Corriger"}
                </Button>
              </div>
            )) : (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                Aucun blocant métier: le tunnel est prêt pour la génération.
              </div>
            )}

            {warningItems.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-border/60 bg-background/30 p-4">
                <p className="font-medium">Warnings à traiter si possible</p>
                {warningItems.map((issue) => (
                  <button key={issue.id} data-testid={`warning-action-${issue.id}`} type="button" className="block text-left text-muted-foreground hover:text-foreground" onClick={() => goToSection(issue.step, issue.field)}>
                    - {issue.message}
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {activeSection === "intent" ? (
          <Card className="border-border/60 bg-card/40" data-studio-section="intent">
            <CardHeader>
              <CardTitle className="text-base">Intention chapitre</CardTitle>
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
                      updateDraft({
                        ...draft,
                        intent: { ...draft.intent, workingTitle: event.target.value },
                      }, "intent")
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Place dans l’arc</Label>
                  <Input
                    data-studio-field="studio-arc-position"
                    value={draft.intent?.arcPosition ?? ""}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        intent: { ...draft.intent, arcPosition: event.target.value },
                      }, "intent")
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pitch du chapitre</Label>
                <Textarea
                  data-testid="studio-short-pitch"
                  data-studio-field="studio-short-pitch"
                  value={draft.intent?.shortPitch ?? ""}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      intent: { ...draft.intent, shortPitch: event.target.value },
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
                    updateDraft({
                      ...draft,
                      intent: { ...draft.intent, mainConflict: event.target.value },
                    }, "intent")
                  }
                />
              </div>

              <div className="space-y-3">
                <Label>Rythme du chapitre</Label>
                <div className="flex flex-wrap gap-2">
                  {PLOT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        updateDraft({
                          ...draft,
                          selectedPlotLabel: option.id,
                        }, "intent")
                      }
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

              <div className="space-y-4 rounded-xl border border-border/60 bg-background/30 p-4">
                <div>
                  <p className="text-sm font-medium">Curseurs créatifs</p>
                  <p className="text-xs text-muted-foreground">Ces réglages seront utilisés à la prévisualisation puis au lancement pipeline.</p>
                </div>
                <SliderField
                  label="Novelty"
                  value={creativityControls.noveltyLevel}
                  helper="Plus haut = plus de variation contrôlée dans les propositions."
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      creativityControls: { ...creativityControls, noveltyLevel: value },
                    }, "intent")
                  }
                />
                <SliderField
                  label="World strictness"
                  value={creativityControls.worldStrictness}
                  helper="Plus haut = moteur plus collé au canon et au lore."
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      creativityControls: { ...creativityControls, worldStrictness: value },
                    }, "intent")
                  }
                />
                <SliderField
                  label="Visual exoticism"
                  value={creativityControls.visualExoticism}
                  helper="Plus haut = silhouettes et détails plus atypiques."
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      creativityControls: { ...creativityControls, visualExoticism: value },
                    }, "intent")
                  }
                />
                <SliderField
                  label="NPC variety"
                  value={creativityControls.npcVariety}
                  helper="Plus haut = PNJ plus variés et plus visibles."
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      creativityControls: { ...creativityControls, npcVariety: value },
                    }, "intent")
                  }
                />
                <SliderField
                  label="Environment richness"
                  value={creativityControls.environmentRichness}
                  helper="Plus haut = décors plus denses et persistants."
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      creativityControls: { ...creativityControls, environmentRichness: value },
                    }, "intent")
                  }
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "narrative_contract" ? (
          <>
            <Card className="border-border/60 bg-card/40" data-studio-section="narrative_contract">
              <CardHeader>
                <CardTitle className="text-base">Contrat narratif</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Objectif émotionnel</Label>
                  <Input
                    data-testid="studio-emotional-goal"
                    data-studio-field="studio-emotional-goal"
                    value={draft.narrativeContract?.emotionalGoal ?? ""}
                    onChange={(event) =>
                      updateDraft({
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
                      updateDraft({
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
              </CardContent>
            </Card>
            <NarrativeContractCard contract={draft.narrativeContract} />
          </>
        ) : null}

        {activeSection === "characters" ? (
          <Card className="border-border/60 bg-card/40" data-studio-section="characters">
            <CardHeader>
              <CardTitle className="text-base">Casting du chapitre</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Héros actif</Label>
                <Input
                  data-testid="studio-hero-character"
                  data-studio-field="studio-hero-character"
                  value={draft.characterSelection?.heroCharacterId ?? ""}
                  onChange={(event) =>
                    updateDraft({
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
                    updateDraft({
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
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "canon" ? (
          <Card className="border-border/60 bg-card/40" data-studio-section="canon">
            <CardHeader>
              <CardTitle className="text-base">Canon chapitre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Décor principal</Label>
                  <Input
                    data-testid="studio-location"
                    data-studio-field="studio-location"
                    value={draft.chapterCanon?.currentLocation ?? ""}
                    onChange={(event) =>
                      updateDraft({
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
                  <Label>Météo</Label>
                  <Input
                    data-studio-field="studio-weather"
                    value={draft.chapterCanon?.weather ?? ""}
                    onChange={(event) =>
                      updateDraft({
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
                      updateDraft({
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
              </div>

              <div className="space-y-2">
                <Label>Notes de continuité</Label>
                <Textarea
                  data-studio-field="studio-continuity-notes"
                  value={joinList(draft.chapterCanon?.continuityNotes)}
                  onChange={(event) =>
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
                        continuityNotes: splitList(event.target.value),
                        inheritedFromPreviousChapter: draft.chapterCanon?.inheritedFromPreviousChapter ?? true,
                        universeConstraints: draft.chapterCanon?.universeConstraints ?? [],
                      },
                    }, "canon")
                  }
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "editorial_outline" ? (
          <div data-studio-section="editorial_outline" className="space-y-6">
            <BeatList title="Outline éditorial" emptyLabel="Aucun outline éditorial généré pour l’instant." beats={draft.editorialOutline?.beats} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => void generateOutlines()} disabled={generatingOutline}>
                {generatingOutline ? "Génération..." : "Générer / régénérer l’outline"}
              </Button>
            </div>
          </div>
        ) : null}

        {activeSection === "production_outline" ? (
          <div data-studio-section="production_outline" className="space-y-6">
            <BeatList title="Outline production" emptyLabel="Aucun outline de production généré pour l’instant." beats={draft.productionOutline?.beats} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => void generateOutlines()} disabled={generatingOutline}>
                {generatingOutline ? "Génération..." : "Recalculer outline & plan"}
              </Button>
            </div>
          </div>
        ) : null}

        {activeSection === "production_plan" ? (
          <div data-studio-section="production_plan" className="space-y-6">
            <ProductionPlanCard plan={draft.productionPlan} />
            <Card className="border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base">Budget images</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm md:grid-cols-4">
                <div><p className="text-muted-foreground">Estimées</p><p>{readiness?.imageCounts.estimatedImages ?? 0}</p></div>
                <div><p className="text-muted-foreground">Cibles</p><p>{readiness?.imageCounts.targetImages ?? 0}</p></div>
                <div><p className="text-muted-foreground">Minimum</p><p>{readiness?.imageCounts.minimumImages ?? 55}</p></div>
                <div><p className="text-muted-foreground">Manquantes</p><p>{readiness?.imageCounts.missingImages ?? 0}</p></div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeSection === "readiness" ? (
          <Card className="border-border/60 bg-card/40" data-studio-section="readiness">
            <CardHeader>
              <CardTitle className="text-base">Readiness avant lancement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">Score de préparation: {readiness?.preparationScore ?? 0}/100</p>
              <div>
                <p className="font-medium">Blocants</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {blockerItems.length > 0 ? blockerItems.map((issue) => <li key={issue.id}>- {issue.message}</li>) : <li>- Aucun blocant</li>}
                </ul>
              </div>
              <div>
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {warningItems.length > 0 ? warningItems.map((issue) => <li key={issue.id}>- {issue.message}</li>) : <li>- Aucun warning</li>}
                </ul>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={() => goToSection("generation")} disabled={!canAccessGeneration}>
                  Continuer vers la génération
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "generation" ? (
          <div data-studio-section="generation" className="space-y-6">
            <Card className="border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base">Lancement pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {blockerItems.length > 0 && generatedImages === 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-50">
                    Corrige d’abord les blocants readiness pour lancer un run propre depuis le studio.
                  </div>
                ) : null}
                <ChapterGenerateLauncher
                  projectId={projectId}
                  chapterId={chapterId}
                  initialStats={generationContext?.imageStats ?? null}
                  disabled={launchBlockedByReadiness || !stackReady}
                  disabledMessage={launchDisabledMessage}
                  stackBlockers={generationContext?.stack.blockers ?? []}
                />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {activeSection === "review" ? (
          <div data-studio-section="review" className="space-y-6">
            {canAccessReview ? (
              <ChapterReviewBoard projectId={projectId} chapterId={chapterId} chapterTitle={title} projectTitle={projectTitle} />
            ) : (
              <Card className="border-border/60 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-base">QA / Review</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  La review apparaîtra ici dès qu’un premier lot d’images existera ou qu’un statut QA sera atteint.
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
