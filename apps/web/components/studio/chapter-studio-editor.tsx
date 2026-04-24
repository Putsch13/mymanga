"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AutofillMeta, ChapterReadinessIssue, ChapterStudioData, ChapterStudioSnapshot, ChapterStudioStep } from "@manga-ai-studio/core";
import { buildChapterReadinessReport, PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { ChapterBriefStep } from "./chapter-brief-step";
import { ChapterCastCanonStep } from "./chapter-cast-canon-step";
import { ChapterEditorSidebarSummary } from "./chapter-editor-sidebar-summary";
import { ChapterGenerationReviewStep } from "./chapter-generation-review-step";
import { ChapterOnboardingBanner } from "./chapter-onboarding-banner";
import { ChapterPlanStep } from "./chapter-plan-step";
import { IncompletePlanRepairBanner } from "./incomplete-plan-repair-banner";
import {
  computeChapterSummary,
  computeFlowCompletion,
  groupIssuesByFlowStep,
  mapStudioStepToFlowStep,
  normalizeCreativeControls,
  type ChapterFlowStepId,
  type StudioResponse,
} from "./chapter-studio-flow";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

function primaryStudioStepForFlowStep(flowStep: ChapterFlowStepId): ChapterStudioStep {
  if (flowStep === "brief") return "intent";
  if (flowStep === "cast_canon") return "characters";
  if (flowStep === "plan") return "production_plan";
  return "generation";
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
  const [characterCatalog, setCharacterCatalog] = useState<CharacterCatalogEntry[]>([]);
  const [progressionIssues, setProgressionIssues] = useState<OutlineProgressionIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    setProjectTitle(json.project.title);
    setChapterTitle(json.chapter.title ?? `Chapitre ${json.chapter.chapterNumber}`);
    setSnapshot(json.snapshot);
    setGenerationContext(json.generationContext);
    setCharacterCatalog(json.characterCatalog ?? []);
    const loadedData = json.snapshot.data;
    // Auto-créer le narrativeContract si absent (blocant récurrent sur chapitres existants)
    const autoContract = loadedData.narrativeContract ?? (loadedData.intent?.shortPitch ? {
      emotionalGoal: loadedData.intent?.emotionalGoal ?? "Faire évoluer le héros face au conflit",
      heroStateAtStart: `Avant : ${(loadedData.intent.shortPitch ?? "").slice(0, 60)}`,
      heroStateAtEnd: "Transformation après les événements du chapitre",
      centralConflict: loadedData.intent?.mainConflict ?? loadedData.intent?.shortPitch ?? "Conflit central",
      revealOrInformationGain: "",
      relationshipShift: "",
      chapterQuestion: `Comment le héros va-t-il traverser ${loadedData.intent?.workingTitle ?? "ce chapitre"} ?`,
      endingMode: "cliffhanger" as const,
      tone: "dramatic" as const,
      intensityCurve: [],
      forbiddenNarrativeMisses: [],
    } : undefined);
    setDraft({
      ...loadedData,
      selectedPlotLabel: loadedData.selectedPlotLabel ?? "bold",
      creativityControls: normalizeCreativeControls(loadedData.creativityControls),
      narrativeContract: autoContract,
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
    // BUG-B : créer automatiquement un narrativeContract minimal si absent
    // Sans lui, le readiness check bloque toujours (étape narrative_contract manquante)
    const autoNarrativeContract = draft.narrativeContract ?? {
      emotionalGoal: draft.intent?.emotionalGoal ?? "Faire évoluer le héros face au conflit",
      heroStateAtStart: draft.intent?.shortPitch ? `Avant : ${draft.intent.shortPitch.slice(0, 60)}` : "État initial",
      heroStateAtEnd: "Transformation après les événements du chapitre",
      centralConflict: draft.intent?.mainConflict ?? draft.intent?.shortPitch ?? "Conflit central du chapitre",
      revealOrInformationGain: "",
      relationshipShift: "",
      chapterQuestion: `Comment le héros va-t-il traverser ${draft.intent?.workingTitle ?? "ce chapitre"} ?`,
      endingMode: "cliffhanger" as const,
      tone: "dramatic" as const,
      intensityCurve: [],
      forbiddenNarrativeMisses: [],
    };

    const mergedEstimateContext = (() => {
      if (!json.estimateContext && !json.canonicalProductionPlan) return undefined;
      const base = json.estimateContext ?? {
        estimatedAt: new Date().toISOString(),
        estimateSource: json.estimateMode === "existing_chapter" ? "existing_chapter" : "new_chapter",
      };
      return {
        ...base,
        ...(!base.canonicalProductionPlan && json.canonicalProductionPlan
          ? { canonicalProductionPlan: json.canonicalProductionPlan }
          : {}),
      };
    })();

    const nextDraft: ChapterStudioData = {
      ...draft,
      editorialOutline: json.editorialOutline,
      productionOutline: json.productionOutline,
      productionPlan: json.productionPlan,
      narrativeContract: autoNarrativeContract,
      ...(mergedEstimateContext ? { estimateContext: mergedEstimateContext } : {}),
    };

    // Vérification de progression narrative côté client
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

  // BUG-09 : réécrire un beat unique via autofill `rewrite_beat`.
  // Le backend (autofill/route.ts) supporte déjà ce mode avec targetBeatId +
  // userInstructions. Ce callback expose cette capacité au composant Plan.
  const rewriteBeat = useCallback(async (beatId: string, userInstructions: string) => {
    if (!draft || !beatId) return;
    setAutofilling(true);
    setAutofillResult(null);
    setMessage("Réécriture du temps en cours…");
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "rewrite_beat",
          force: false,
          targetBeatId: beatId,
          userInstructions: userInstructions.length > 0 ? userInstructions : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "La réécriture du beat a échoué.");
        return;
      }
      if (json.blocked) {
        setMessage(json.blockedMessage ?? "Réécriture impossible pour le moment.");
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
        setMessage(`Beat réécrit. L'IA a touché : ${json.appliedFields.join(", ")}.`);
      } else {
        setMessage(json.emptyPatchReason ?? "Aucune modification retournée par l'IA.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setMessage(`Erreur lors de la réécriture : ${msg}`);
    } finally {
      setAutofilling(false);
    }
  }, [activeStudioStep, chapterId, draft, projectId, save]);

  const runAutofill = useCallback(async (mode: "all_missing" | "repair_readiness" | "brief") => {
    if (!draft) return;
    setAutofilling(true);
    setAutofillResult(null);
    setMessage("Complétion IA en cours…");
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, force: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "La complétion IA a échoué.");
        return;
      }
      // Autofill bloqué côté serveur (ex: pitch trop court)
      if (json.blocked) {
        setMessage(json.blockedMessage ?? "Complétion IA impossible pour le moment.");
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
        setMessage(`L'IA a complété ${json.appliedFields.length} champ(s). À vérifier : ${json.appliedFields.join(", ")}.`);
      } else {
        // Patch vide : afficher la raison explicite
        const reason = json.emptyPatchReason ?? "Aucun champ vide détecté";
        setMessage(reason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      const isParseError = msg.includes("did not match") || msg.includes("JSON") || msg.includes("SyntaxError");
      const isNetwork = msg.includes("fetch") || msg.includes("network") || msg.includes("Failed");
      setMessage(isParseError
        ? "La réponse du serveur était inattendue. Réessaie dans quelques secondes."
        : isNetwork
          ? "Erreur réseau — vérifie ta connexion et réessaie."
          : `Erreur lors de la complétion IA : ${msg}`);
    } finally {
      setAutofilling(false);
    }
  }, [activeStudioStep, chapterId, draft, projectId, save]);

  // Recalculer le readiness depuis le draft local en temps réel (pas depuis le snapshot DB)
  // → les blocants disparaissent dès que l'utilisateur remplit un champ, sans attendre l'autosave
  const liveReadiness = useMemo(() => {
    if (!draft || !snapshot) return null;
    const liveSnapshot: ChapterStudioSnapshot = {
      ...snapshot,
      data: { ...draft },
    };
    try {
      return buildChapterReadinessReport(liveSnapshot);
    } catch {
      return snapshot.data.readinessReport ?? null;
    }
  }, [draft, snapshot]);

  if (loading || !draft || !snapshot) {
    return <div className="rounded-2xl border border-border/60 bg-card/30 p-6 text-sm text-muted-foreground">Chargement du studio…</div>;
  }

  const readiness = liveReadiness ?? snapshot.data.readinessReport;
  const blockerItems = readiness?.blockerItems ?? [];
  const warningItems = readiness?.warningItems ?? [];
  const generatedImages = generationContext?.imageStats.total ?? readiness?.imageCounts.generatedImages ?? 0;
  const acceptedImages = readiness?.imageCounts.acceptedImages ?? 0;
  const minimumImages = readiness?.imageCounts.minimumImages ?? PREMIUM_PANEL_RANGE.target;
  const stackReady = generationContext?.stack.canGenerateChapters ?? true;
  const canAccessReview = generatedImages > 0 || ["QA_REVIEW", "NEEDS_FIXES", "COMPLETED", "PUBLISHED", "GENERATION_PARTIAL"].includes(snapshot.status);
  const launchDisabledMessage =
    blockerItems.length > 0 && generatedImages === 0
      ? "Corrige d’abord les blocants du studio pour lancer la génération."
      : !stackReady
        ? "La stack de génération n’est pas prête. Corrige les blocants techniques ci-dessous."
        : null;
  const creativityControls = normalizeCreativeControls(draft.creativityControls);
  const flowSteps = computeFlowCompletion(snapshot, blockerItems, liveReadiness?.completedSteps);
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpertMode(m => !m)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              expertMode
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border/50 bg-background/30 text-muted-foreground hover:border-border"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${expertMode ? "bg-accent" : "bg-muted-foreground/40"}`} />
            {expertMode ? "Mode expert" : "Mode simplifié"}
          </button>
          {!expertMode && (
            <span className="text-[11px] text-muted-foreground/60">Champs avancés masqués</span>
          )}
        </div>

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
              onClick={() => {
                // BUG-C : choisir le mode selon l'état du pitch pour éviter le blocage serveur
                const pitch = draft?.intent?.shortPitch?.trim() ?? "";
                const mode = pitch.length < 5 ? "brief" : "all_missing";
                void runAutofill(mode);
              }}
            >
              {autofilling
                ? "IA en cours…"
                : (draft?.intent?.shortPitch?.trim().length ?? 0) < 5
                  ? "L'IA génère le brief pour moi"
                  : "Complétion IA des champs manquants"}
            </Button>
            {blockerItems.length > 0 ? (
              <Button
                data-testid="autofill-repair-readiness"
                size="sm"
                variant="ghost"
                disabled={autofilling}
                onClick={() => {
                  // BUG-D : même logique adaptative pour "Réparer"
                  const pitch = draft?.intent?.shortPitch?.trim() ?? "";
                  void runAutofill(pitch.length < 5 ? "brief" : "repair_readiness");
                }}
              >
                Réparer ce qui bloque
              </Button>
            ) : null}
          </div>

          {autofillResult ? (
            <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1" data-testid="autofill-result">
              <p className="font-medium text-foreground/80">
                Complétion IA — confiance : {Math.round(autofillResult.meta.confidence * 100)}%
              </p>
              {autofillResult.appliedFields.length > 0 ? (
                <p className="text-muted-foreground">
                  L&apos;IA a complété {autofillResult.appliedFields.length} champ(s) : {autofillResult.appliedFields.join(", ")}
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
            expertMode={expertMode}
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
            characterCatalog={characterCatalog}
            projectId={projectId}
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
            progressionIssues={progressionIssues}
            onIssueAction={handleIssueAction}
            onUpdateDraft={updateDraft}
            onGenerateOutlines={generateOutlines}
            onRewriteBeat={rewriteBeat}
            rewritingBeat={autofilling}
            onValidatePlan={() => {
              // P0.3 — si le contrat de production est incomplet (blueprints <
              // minimumImages), on reste sur l'étape `plan` et on remonte le
              // blocant spécifique au user, pas un blocant générique.
              // Priorité au blocant "plan incomplet" car c'est celui qui empêche
              // réellement le launch côté backend (IncompletePlanError).
              const planBlocker =
                blockerItems.find(
                  (issue) =>
                    issue.id === "production_plan_incomplete_blueprints" ||
                    issue.id === "production_plan_missing_blueprints" ||
                    issue.id === "missing_production_plan",
                ) ?? blockerItems[0];
              if (planBlocker) {
                if (
                  planBlocker.id === "production_plan_incomplete_blueprints" ||
                  planBlocker.id === "production_plan_missing_blueprints"
                ) {
                  setMessage(planBlocker.message);
                }
                void handleIssueAction(planBlocker);
                return;
              }
              if (readiness?.launchBlocked) {
                setMessage(
                  "Le plan n'est pas lançable : régénère le plan de production avant validation.",
                );
                goToFlowStep("plan", null, "production_plan");
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
