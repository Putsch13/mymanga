"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioSnapshot,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { ChapterEditorSidebarSummary } from "./chapter-editor-sidebar-summary";
import { ChapterOnboardingBanner } from "./chapter-onboarding-banner";
import { ChapterStudioActionBar } from "./chapter-studio-action-bar";
import { ChapterStudioExpertModeToggle } from "./chapter-studio-expert-mode-toggle";
import { ChapterStudioFlowBody } from "./chapter-studio-flow-body";
import { ChapterVisualContractPolicyPanel } from "./chapter-visual-contract-policy-panel";
import { IncompletePlanRepairBanner } from "./incomplete-plan-repair-banner";
import { buildAutoNarrativeContract } from "./chapter-studio-helpers";
import { computeChapterStudioDerived } from "./chapter-studio-derived";
import {
  mapStudioStepToFlowStep,
  normalizeCreativeControls,
  type ChapterFlowStepId,
  type StudioResponse,
} from "./chapter-studio-flow";
import { useChapterStudioAutofill } from "./use-chapter-studio-autofill";
import { useChapterStudioNavigation } from "./use-chapter-studio-navigation";
import { useChapterStudioReadiness } from "./use-chapter-studio-readiness";
import { ChapterWizardShell } from "@/features/studio/wizard/chapter-wizard-shell";
import {
  studioStepToWizardStepId,
  type ChapterWizardDeriveExtras,
  type HeroWizardReadiness,
} from "@/features/studio/wizard/chapter-wizard-model";
import { useChapterWizardState } from "@/features/studio/wizard/use-chapter-wizard-state";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

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
  const [characterCatalog, setCharacterCatalog] = useState<CharacterCatalogEntry[]>([]);
  const [progressionIssues, setProgressionIssues] = useState<OutlineProgressionIssue[]>([]);
  const [chapterVisualContract, setChapterVisualContract] = useState<unknown>(null);
  const [chapterVisualContractUi, setChapterVisualContractUi] = useState<StudioResponse["chapterVisualContractUi"]>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chapterNumber, setChapterNumber] = useState<number | null>(null);
  const [heroWizardReadiness, setHeroWizardReadiness] = useState<HeroWizardReadiness | null>(null);
  const [wizardExpanded, setWizardExpanded] = useState(true);
  const hasExistingContent = Boolean(
    snapshot?.data?.intent?.shortPitch ||
    snapshot?.data?.narrativeContract?.centralConflict
  );
  const [expertMode, setExpertMode] = useState(hasExistingContent);
  const autosaveRef = useRef<number | null>(null);

  const loadStudio = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/studio`, { cache: "no-store" });
    const json = (await response.json()) as StudioResponse & { characterCatalog?: CharacterCatalogEntry[] };
    setChapterVisualContract(json.chapterVisualContract ?? null);
    setChapterVisualContractUi(json.chapterVisualContractUi);
    setProjectTitle(json.project.title);
    setChapterTitle(json.chapter.title ?? `Chapitre ${json.chapter.chapterNumber}`);
    setChapterNumber(json.chapter.chapterNumber);
    setSnapshot(json.snapshot);
    setGenerationContext(json.generationContext);
    setCharacterCatalog(json.characterCatalog ?? []);
    const loadedData = json.snapshot.data;
    const autoContract = buildAutoNarrativeContract(loadedData);
    const initialWizard = loadedData.chapterWizard
      ? {
          currentStep: loadedData.chapterWizard.currentStep,
          completedSteps: loadedData.chapterWizard.completedSteps ?? [],
          dismissedTips: loadedData.chapterWizard.dismissedTips ?? [],
        }
      : {
          currentStep: studioStepToWizardStepId(json.snapshot.currentStep),
          completedSteps: [] as string[],
          dismissedTips: [] as string[],
        };
    setDraft({
      ...loadedData,
      selectedPlotLabel: loadedData.selectedPlotLabel ?? "bold",
      creativityControls: normalizeCreativeControls(loadedData.creativityControls),
      narrativeContract: autoContract,
      chapterWizard: initialWizard,
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

  useEffect(() => {
    if (chapterNumber !== 1) setHeroWizardReadiness(null);
  }, [chapterNumber]);

  const save = useCallback(async (nextDraft: ChapterStudioData, step = activeStudioStep) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/studio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: step,
          transitionReason: "autosave",
          data: nextDraft,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSaveError((errData as { message?: string }).message ?? "La sauvegarde a échoué. Vos modifications ne sont pas enregistrées.");
        setSaving(false);
        return;
      }
      const json = await res.json();
      const nextSnapshot = json.snapshot as ChapterStudioSnapshot;
      setSnapshot(nextSnapshot);
      setDraft({
        ...nextSnapshot.data,
        selectedPlotLabel: nextSnapshot.data.selectedPlotLabel ?? nextDraft.selectedPlotLabel ?? "bold",
        creativityControls: normalizeCreativeControls(nextSnapshot.data.creativityControls ?? nextDraft.creativityControls),
        chapterWizard: nextSnapshot.data.chapterWizard ?? nextDraft.chapterWizard,
      });
      setActiveStudioStep(step);
      setSaving(false);
      setMessage("Brouillon studio sauvegardé.");
    } catch {
      setSaveError("Erreur réseau — la sauvegarde a échoué.");
      setSaving(false);
    }
  }, [activeStudioStep, chapterId, projectId]);

  const updateDraft = useCallback((next: ChapterStudioData, step = activeStudioStep) => {
    setDraft(next);
    setActiveStudioStep(step);
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current);
    autosaveRef.current = window.setTimeout(() => {
      void save(next, step);
    }, 900);
  }, [activeStudioStep, save]);

  const { goToFlowStep, navigateWizardStep } = useChapterStudioNavigation({
    projectId,
    chapterId,
    chapterNumber,
    loading,
    draft,
    setActiveFlowStep,
    setActiveStudioStep,
    updateDraft,
  });

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
      // BUG-B : créer automatiquement un narrativeContract minimal si absent.
      narrativeContract: buildAutoNarrativeContract(draft) ?? draft.narrativeContract,
      ...(json.estimateContext ? { estimateContext: json.estimateContext } : {}),
    };

    if (json.productionOutline?.beats?.length > 0) {
      try {
        const { validateOutlineProgression } = await import("@/lib/outline-progression-guard");
        const result = validateOutlineProgression({
          editorialOutline: json.editorialOutline,
          productionOutline: json.productionOutline,
        });
        setProgressionIssues(result.issues);
      } catch {
        setProgressionIssues([]);
      }
    } else {
      setProgressionIssues([]);
    }

    setActiveFlowStep("plan");
    setActiveStudioStep("production_plan");
    await save(nextDraft, "production_plan");
    setGeneratingOutline(false);
    setMessage("Base de chapitre générée: contrat, outlines et plan mis à jour.");
  }, [chapterId, draft, goToFlowStep, projectId, save, snapshot?.data.intent?.chapterNumber]);

  const handleIssueAction = useCallback(async (issue: ChapterReadinessIssue) => {
    try {
      if (issue.action === "generate_outline") {
        goToFlowStep("plan", issue.field, issue.step);
        setGeneratingOutline(true);
        try {
          await generateOutlines();
        } finally {
          setGeneratingOutline(false);
        }
        return;
      }
      if (issue.action === "open_generation" || issue.action === "open_review") {
        goToFlowStep("generation_review", issue.field, issue.step);
        return;
      }
      goToFlowStep(mapStudioStepToFlowStep(issue.step), issue.field, issue.step);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur lors de l'action corrective");
    }
  }, [generateOutlines, goToFlowStep]);

  const {
    autofilling,
    autofillResult,
    runAutofill,
    rewriteBeat,
  } = useChapterStudioAutofill({
    projectId,
    chapterId,
    draft,
    activeStudioStep,
    save,
    setMessage,
  });

  const { liveReadiness, livePremiumDashboard } = useChapterStudioReadiness({
    draft,
    snapshot,
    projectId,
    chapterId,
    chapterNumber,
  });

  const wizardExtras: ChapterWizardDeriveExtras | null = useMemo(() => {
    if (chapterNumber !== 1) return null;
    return { chapterNumber: 1, heroReadiness: heroWizardReadiness };
  }, [chapterNumber, heroWizardReadiness]);

  const wizardVm = useChapterWizardState({
    draft,
    liveReadiness,
    chapterNumber,
    wizardExtras,
  });

  if (loading || !draft || !snapshot) {
    return <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">Chargement du studio…</div>;
  }

  const derived = computeChapterStudioDerived({
    draft,
    snapshot,
    chapterTitle,
    liveReadiness,
    livePremiumDashboardStatus: livePremiumDashboard?.status,
    generationContext,
    chapterVisualContractUi,
  });
  const {
    readiness,
    blockerItems,
    warningItems,
    generatedImages,
    acceptedImages,
    minimumImages,
    stackReady,
    canAccessReview,
    launchDisabledMessage,
    creativityControls,
    flowSteps,
    summary,
    briefIssues,
    briefWarnings,
    castCanonIssues,
    castCanonWarnings,
    planIssues,
    planWarnings,
    planReadyForFirstLaunch,
    preLaunchBlocked,
  } = derived;

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
        {saveError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive flex items-center justify-between">
            <span>{saveError}</span>
            <button onClick={() => setSaveError(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Bandeau onboarding si premier chapitre sans personnages */}
        <ChapterOnboardingBanner
          projectId={projectId}
          hasCharacters={characterCatalog.length > 0}
        />

        <ChapterWizardShell
          enabled={chapterNumber === 1}
          expanded={wizardExpanded}
          onExpandedChange={setWizardExpanded}
          steps={wizardVm.steps}
          onStepClick={navigateWizardStep}
        />

        {/* P1.4 — bannière de réparation guidée : reste visible en haut du
            studio tant que le contrat images est incomplet. Clic "Régénérer
            le plan" = on rejoue l'étape `plan` sans perdre le reste. */}
        <IncompletePlanRepairBanner
          contractStatus={readiness?.contractStatus}
          panelBlueprintCount={readiness?.panelBlueprintCount}
          minimumImages={readiness?.imageCounts.minimumImages}
          generatingOutline={generatingOutline}
          onRegeneratePlan={() => {
            goToFlowStep("plan", null, "production_plan");
            void generateOutlines();
          }}
        />

        {planReadyForFirstLaunch && generatedImages === 0 ? (
          <ChapterVisualContractPolicyPanel
            projectId={projectId}
            chapterId={chapterId}
            ui={chapterVisualContractUi ?? undefined}
            generatedImages={generatedImages}
            planReadyForFirstLaunch={planReadyForFirstLaunch}
            onUpdated={() => void loadStudio()}
          />
        ) : null}

        <ChapterStudioExpertModeToggle
          expertMode={expertMode}
          onToggle={() => setExpertMode((m) => !m)}
        />

        <ChapterStudioActionBar
          summary={summary}
          pitch={draft.intent?.shortPitch ?? ""}
          blockerItems={blockerItems}
          autofilling={autofilling}
          autofillResult={autofillResult}
          message={message}
          onRunAutofill={(mode) => void runAutofill(mode)}
        />

        <ChapterStudioFlowBody
          activeFlowStep={activeFlowStep}
          draft={draft}
          creativityControls={creativityControls}
          blockerItems={blockerItems}
          warningItems={warningItems}
          briefIssues={briefIssues}
          briefWarnings={briefWarnings}
          castCanonIssues={castCanonIssues}
          castCanonWarnings={castCanonWarnings}
          planIssues={planIssues}
          planWarnings={planWarnings}
          generatingOutline={generatingOutline}
          expertMode={expertMode}
          chapterNumber={chapterNumber}
          projectId={projectId}
          chapterId={chapterId}
          characterCatalog={characterCatalog}
          preparationScore={readiness?.preparationScore ?? 0}
          imageCounts={{
            estimatedImages: readiness?.imageCounts.estimatedImages ?? 0,
            targetImages: readiness?.imageCounts.targetImages ?? 0,
            minimumImages,
            missingImages: readiness?.imageCounts.missingImages ?? 0,
          }}
          progressionIssues={progressionIssues}
          chapterVisualContract={chapterVisualContract}
          chapterVisualContractForReview={chapterVisualContract ?? undefined}
          preLaunchBlocked={preLaunchBlocked}
          projectTitle={projectTitle}
          chapterTitle={summary.title}
          generationContextUserIntent={draft?.intent?.shortPitch ?? snapshot?.data.intent?.shortPitch ?? null}
          generatedImages={generatedImages}
          minimumImages={minimumImages}
          stackReady={stackReady}
          stackBlockers={generationContext?.stack.blockers ?? []}
          initialStats={generationContext?.imageStats ?? null}
          canAccessReview={canAccessReview}
          launchDisabledMessage={launchDisabledMessage}
          livePremiumDashboard={livePremiumDashboard}
          rewritingBeat={autofilling}
          readinessLaunchBlocked={readiness?.launchBlocked}
          setMessage={setMessage}
          onIssueAction={handleIssueAction}
          onUpdateDraft={updateDraft}
          onGenerateOutlines={generateOutlines}
          onRewriteBeat={rewriteBeat}
          onHeroReadinessChange={setHeroWizardReadiness}
          onContinueCastCanon={() => goToFlowStep("plan")}
          onValidatePlan={() => goToFlowStep("dialogues")}
          onContinueDialogues={() => goToFlowStep("generation_review")}
          onUpdateDraftAtCurrentStep={(next) => updateDraft(next, activeStudioStep)}
          onNavigateToPlan={() => goToFlowStep("plan", null, "production_plan")}
          onRepairApplied={(actionId, json) => {
            // P0 fix : quand "Analyser l'histoire" rend un contrat compilé,
            // on l'injecte localement dans le draft pour que le dashboard
            // live re-évalue immédiatement.
            if (actionId === "analyze_story" && json && typeof json === "object" && draft) {
              const contract = (json as { contract?: unknown }).contract;
              if (contract && typeof contract === "object") {
                updateDraft(
                  { ...draft, chapterIntentContract: contract as typeof draft.chapterIntentContract },
                  activeStudioStep,
                );
              }
            }
          }}
          onSceneDialogueEnrichPreferredChange={(value) => {
            if (!draft) return;
            updateDraft(
              {
                ...draft,
                pipelinePreferences: {
                  ...draft.pipelinePreferences,
                  sceneDialogueEnrich: value,
                },
              },
              activeStudioStep,
            );
          }}
          goToFlowStep={goToFlowStep}
        />
      </div>
    </div>
  );
}
