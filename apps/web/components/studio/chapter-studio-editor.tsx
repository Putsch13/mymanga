"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AutofillMeta, ChapterReadinessIssue, ChapterStudioData, ChapterStudioSnapshot, ChapterStudioStep } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { ChapterBriefStep } from "./chapter-brief-step";
import { ChapterCastCanonStep } from "./chapter-cast-canon-step";
import { ChapterEditorSidebarSummary } from "./chapter-editor-sidebar-summary";
import { ChapterGenerationReviewStep } from "./chapter-generation-review-step";
import { ChapterPlanStep } from "./chapter-plan-step";
import {
  computeChapterSummary,
  computeFlowCompletion,
  groupIssuesByFlowStep,
  mapStudioStepToFlowStep,
  normalizeCreativeControls,
  type ChapterFlowStepId,
  type StudioResponse,
} from "./chapter-studio-flow";

function primaryStudioStepForFlowStep(flowStep: ChapterFlowStepId): ChapterStudioStep {
  if (flowStep === "brief") return "intent";
  if (flowStep === "cast_canon") return "characters";
  if (flowStep === "plan") return "production_plan";
  return "readiness";
}

export function ChapterStudioEditor({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const [projectTitle, setProjectTitle] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [snapshot, setSnapshot] = useState<ChapterStudioSnapshot | null>(null);
  const [draft, setDraft] = useState<ChapterStudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [generationContext, setGenerationContext] = useState<StudioResponse["generationContext"] | null>(null);
  const [activeStudioStep, setActiveStudioStep] = useState<ChapterStudioStep>("intent");
  const [activeFlowStep, setActiveFlowStep] = useState<ChapterFlowStepId>("brief");
  const [autofilling, setAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<{ meta: AutofillMeta; appliedFields: string[]; unresolvedQuestions: string[] } | null>(null);
  const autosaveRef = useRef<number | null>(null);

  const loadStudio = useCallback(async () => {
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
    setActiveStudioStep(json.snapshot.currentStep);
    setActiveFlowStep(mapStudioStepToFlowStep(json.snapshot.currentStep));
    setLoading(false);
  }, [chapterId, projectId]);

  useEffect(() => {
    void loadStudio();
  }, [loadStudio]);

  useEffect(() => () => {
    if (autosaveRef.current) {
      window.clearTimeout(autosaveRef.current);
    }
  }, []);

  const save = useCallback(async (nextDraft: ChapterStudioData, step = activeStudioStep) => {
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
    setActiveStudioStep(step);
    setSaving(false);
    setMessage("Brouillon studio sauvegardé.");
  }, [activeStudioStep, chapterId, projectId]);

  const updateDraft = useCallback((next: ChapterStudioData, step = activeStudioStep) => {
    setDraft(next);
    setActiveStudioStep(step);
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      void save(next, step);
    }, 900);
  }, [activeStudioStep, save]);

  const goToFlowStep = useCallback((flowStep: ChapterFlowStepId, fieldId?: string | null, stepOverride?: ChapterStudioStep) => {
    setActiveFlowStep(flowStep);
    setActiveStudioStep(stepOverride ?? primaryStudioStepForFlowStep(flowStep));

    window.setTimeout(() => {
      if (fieldId) {
        const target = document.querySelector<HTMLElement>(`[data-studio-field="${fieldId}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
        return;
      }
      const section = document.querySelector<HTMLElement>(`[data-studio-section="${flowStep}"]`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, []);

  const generateOutlines = useCallback(async () => {
    if (!draft?.intent?.shortPitch) {
      setMessage("Ajoute d’abord un pitch de chapitre.");
      goToFlowStep("brief", "studio-short-pitch", "intent");
      return;
    }
    setGeneratingOutline(true);
    setMessage(null);
    const response = await fetch(`/api/projects/${projectId}/chapters/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterId,
        chapterNumber: draft.intent?.chapterNumber ?? snapshot?.data.intent?.chapterNumber ?? null,
        userIntent: draft.intent.shortPitch,
        selectedPlotLabel: draft.selectedPlotLabel ?? "bold",
        creativityControls: normalizeCreativeControls(draft.creativityControls),
        focusCharacterIds: draft.characterSelection?.activeCharacterIds ?? [],
      }),
    });
    const json = await response.json();
    if (!response.ok) {
      setGeneratingOutline(false);
      setMessage(json.error ?? "La génération de la base de chapitre a échoué.");
      return;
    }
    const nextDraft: ChapterStudioData = {
      ...draft,
      editorialOutline: json.editorialOutline,
      productionOutline: json.productionOutline,
      productionPlan: json.productionPlan,
      ...(json.estimateContext ? { estimateContext: json.estimateContext } : {}),
    };
    setActiveFlowStep("plan");
    setActiveStudioStep("production_plan");
    await save(nextDraft, "production_plan");
    setGeneratingOutline(false);
    setMessage("Base de chapitre générée: contrat, outlines et plan mis à jour.");
  }, [chapterId, draft, goToFlowStep, projectId, save, snapshot?.data.intent?.chapterNumber]);

  const handleIssueAction = useCallback(async (issue: ChapterReadinessIssue) => {
    if (issue.action === "generate_outline") {
      goToFlowStep("plan", issue.field, issue.step);
      await generateOutlines();
      return;
    }
    if (issue.action === "open_generation" || issue.action === "open_review") {
      goToFlowStep("generation_review", issue.field, issue.step);
      return;
    }
    goToFlowStep(mapStudioStepToFlowStep(issue.step), issue.field, issue.step);
  }, [generateOutlines, goToFlowStep]);

  const runAutofill = useCallback(async (mode: "all_missing" | "repair_readiness") => {
    if (!draft) return;
    setAutofilling(true);
    setAutofillResult(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, force: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "L'autofill a échoué.");
        return;
      }
      if (json.appliedFields?.length > 0 && json.suggestedPatch) {
        const nextDraft: ChapterStudioData = {
          ...draft,
          ...json.suggestedPatch,
          autofillMeta: json.meta,
        };
        await save(nextDraft, activeStudioStep);
        setAutofillResult({ meta: json.meta, appliedFields: json.appliedFields, unresolvedQuestions: json.unresolvedQuestions ?? [] });
        setMessage(`L'IA a complété ${json.appliedFields.length} champ(s).`);
      } else {
        setMessage("Aucun champ manquant à compléter pour ce mode.");
      }
    } catch {
      setMessage("Erreur réseau lors de l'autofill.");
    } finally {
      setAutofilling(false);
    }
  }, [activeStudioStep, chapterId, draft, projectId, save]);

  if (loading || !draft || !snapshot) {
    return <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">Chargement du studio…</div>;
  }

  const readiness = snapshot.data.readinessReport;
  const blockerItems = readiness?.blockerItems ?? [];
  const warningItems = readiness?.warningItems ?? [];
  const generatedImages = generationContext?.imageStats.total ?? readiness?.imageCounts.generatedImages ?? 0;
  const acceptedImages = readiness?.imageCounts.acceptedImages ?? 0;
  const minimumImages = readiness?.imageCounts.minimumImages ?? 55;
  const stackReady = generationContext?.stack.canGenerateChapters ?? true;
  const canAccessReview = generatedImages > 0 || ["QA_REVIEW", "NEEDS_FIXES", "COMPLETED", "PUBLISHED", "GENERATION_PARTIAL"].includes(snapshot.status);
  const launchDisabledMessage =
    blockerItems.length > 0 && generatedImages === 0
      ? "Corrige d’abord les blocants du studio pour lancer la génération."
      : !stackReady
        ? "La stack de génération n’est pas prête. Corrige les blocants techniques ci-dessous."
        : null;
  const creativityControls = normalizeCreativeControls(draft.creativityControls);
  const flowSteps = computeFlowCompletion(snapshot, blockerItems);
  const summary = computeChapterSummary(draft, snapshot, chapterTitle);
  const briefIssues = groupIssuesByFlowStep(blockerItems, "brief");
  const briefWarnings = groupIssuesByFlowStep(warningItems, "brief");
  const castCanonIssues = groupIssuesByFlowStep(blockerItems, "cast_canon");
  const castCanonWarnings = groupIssuesByFlowStep(warningItems, "cast_canon");
  const planIssues = groupIssuesByFlowStep(blockerItems, "plan");
  const planWarnings = groupIssuesByFlowStep(warningItems, "plan");

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ChapterEditorSidebarSummary
        flowSteps={flowSteps}
        activeStep={activeFlowStep}
        snapshot={snapshot}
        saving={saving}
        blockerItems={blockerItems}
        warningItems={warningItems}
        acceptedImages={acceptedImages}
        minimumImages={minimumImages}
        generatedImages={generatedImages}
        estimateContext={draft.estimateContext}
        onSelectStep={(step) => goToFlowStep(step)}
        onSave={() => void save(draft, activeStudioStep)}
      />

      <div className="space-y-6">
        {/* Résumé chapitre + CTA autofill natif au flow */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">{summary.title}</p>
            {summary.summary ? (
              <p className="mt-1 text-sm text-muted-foreground">{summary.summary}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="autofill-all-missing"
              size="sm"
              variant="outline"
              disabled={autofilling}
              onClick={() => void runAutofill("all_missing")}
            >
              {autofilling ? "Complétion en cours…" : "L'IA complète les infos manquantes"}
            </Button>
            {blockerItems.length > 0 ? (
              <Button
                data-testid="autofill-repair-readiness"
                size="sm"
                variant="ghost"
                disabled={autofilling}
                onClick={() => void runAutofill("repair_readiness")}
              >
                Réparer ce qui bloque
              </Button>
            ) : null}
          </div>

          {autofillResult ? (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1" data-testid="autofill-result">
              <p className="font-medium text-foreground/80">
                Autofill IA — confiance : {Math.round(autofillResult.meta.confidence * 100)}%
              </p>
              {autofillResult.appliedFields.length > 0 ? (
                <p className="text-muted-foreground">
                  Champs complétés : {autofillResult.appliedFields.join(", ")}
                </p>
              ) : null}
              {autofillResult.unresolvedQuestions.length > 0 ? (
                <div>
                  <p className="text-amber-600 dark:text-amber-400 font-medium">À valider manuellement :</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                    {autofillResult.unresolvedQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {message ? <p data-testid="studio-message" className="text-sm text-muted-foreground">{message}</p> : null}
        </div>

        {/* Étapes du flow simple — blocants localisés dans chaque étape */}
        {activeFlowStep === "brief" ? (
          <ChapterBriefStep
            draft={draft}
            creativityControls={creativityControls}
            issues={briefIssues}
            warningItems={briefWarnings}
            generatingOutline={generatingOutline}
            onIssueAction={handleIssueAction}
            onUpdateDraft={updateDraft}
            onGenerateBase={generateOutlines}
          />
        ) : null}

        {activeFlowStep === "cast_canon" ? (
          <ChapterCastCanonStep
            draft={draft}
            issues={castCanonIssues}
            warningItems={castCanonWarnings}
            onIssueAction={handleIssueAction}
            onUpdateDraft={updateDraft}
            onContinue={() => goToFlowStep("plan")}
          />
        ) : null}

        {activeFlowStep === "plan" ? (
          <ChapterPlanStep
            draft={draft}
            preparationScore={readiness?.preparationScore ?? 0}
            issues={planIssues}
            warningItems={planWarnings}
            generatingOutline={generatingOutline}
            imageCounts={{
              estimatedImages: readiness?.imageCounts.estimatedImages ?? 0,
              targetImages: readiness?.imageCounts.targetImages ?? 0,
              minimumImages,
              missingImages: readiness?.imageCounts.missingImages ?? 0,
            }}
            onIssueAction={handleIssueAction}
            onUpdateDraft={updateDraft}
            onGenerateOutlines={generateOutlines}
            onValidatePlan={() => {
              const firstBlocker = blockerItems[0];
              if (firstBlocker) {
                void handleIssueAction(firstBlocker);
                return;
              }
              goToFlowStep("generation_review");
            }}
          />
        ) : null}

        {activeFlowStep === "generation_review" ? (
          <ChapterGenerationReviewStep
            projectId={projectId}
            chapterId={chapterId}
            projectTitle={projectTitle}
            chapterTitle={summary.title}
            blockerItems={blockerItems}
            warningItems={warningItems}
            generatedImages={generatedImages}
            acceptedImages={acceptedImages}
            minimumImages={minimumImages}
            stackReady={stackReady}
            stackBlockers={generationContext?.stack.blockers ?? []}
            initialStats={generationContext?.imageStats ?? null}
            canAccessReview={canAccessReview}
            disabledMessage={launchDisabledMessage}
            onIssueAction={handleIssueAction}
          />
        ) : null}
      </div>
    </div>
  );
}
