"use client";

/**
 * P5.2 — Corps "flow" du ChapterStudioEditor.
 *
 * Sélectionne, en fonction de `activeFlowStep`, l'un des 5 steps :
 *   - `brief`            → ChapterBriefStep
 *   - `cast_canon`       → ChapterCastCanonStep
 *   - `plan`             → ChapterPlanStep (avec validation orchestrée)
 *   - `dialogues`        → ChapterDialoguesStep
 *   - `generation_review`→ ChapterGenerationReviewStep
 *
 * Aucun état interne : tout est piloté par props (callbacks vers le parent).
 */
import type {
  ChapterCreativeControls,
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { ChapterBriefStep } from "./chapter-brief-step";
import { ChapterCastCanonStep } from "./chapter-cast-canon-step";
import { ChapterDialoguesStep } from "./chapter-dialogues-step";
import { ChapterGenerationReviewStep } from "./chapter-generation-review-step";
import { ChapterPlanStep } from "./chapter-plan-step";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

type ChapterFlowStepId = "brief" | "cast_canon" | "plan" | "dialogues" | "generation_review";

type ReviewStepProps = React.ComponentProps<typeof ChapterGenerationReviewStep>;

interface ChapterStudioFlowBodyProps {
  activeFlowStep: ChapterFlowStepId;
  draft: ChapterStudioData;
  creativityControls: ChapterCreativeControls;
  blockerItems: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  briefIssues: ChapterReadinessIssue[];
  briefWarnings: ChapterReadinessIssue[];
  castCanonIssues: ChapterReadinessIssue[];
  castCanonWarnings: ChapterReadinessIssue[];
  planIssues: ChapterReadinessIssue[];
  planWarnings: ChapterReadinessIssue[];
  generatingOutline: boolean;
  expertMode: boolean;
  chapterNumber: number | null;
  projectId: string;
  chapterId: string;
  characterCatalog: CharacterCatalogEntry[];
  preparationScore: number;
  imageCounts: {
    estimatedImages: number;
    targetImages: number;
    minimumImages: number;
    missingImages: number;
  };
  progressionIssues: OutlineProgressionIssue[];
  chapterVisualContract: unknown;
  chapterVisualContractForReview: unknown;
  preLaunchBlocked: boolean;
  projectTitle: string;
  chapterTitle: string;
  generationContextUserIntent: string | null;
  generatedImages: number;
  minimumImages: number;
  stackReady: boolean;
  stackBlockers: string[];
  initialStats: ReviewStepProps["initialStats"];
  canAccessReview: boolean;
  launchDisabledMessage: string | null;
  livePremiumDashboard: ReviewStepProps["premiumDashboard"];
  rewritingBeat: boolean;
  readinessLaunchBlocked: boolean | undefined;
  setMessage: (m: string | null) => void;
  onIssueAction: (issue: ChapterReadinessIssue) => Promise<void>;
  onUpdateDraft: (next: ChapterStudioData, step?: ChapterStudioStep) => void;
  onGenerateOutlines: () => Promise<void>;
  onRewriteBeat: (beatId: string, instructions: string) => Promise<void>;
  onHeroReadinessChange: (
    readiness: import("@/features/studio/wizard/chapter-wizard-model").HeroWizardReadiness | null,
  ) => void;
  onContinueCastCanon: () => void;
  onValidatePlan: () => void;
  onContinueDialogues: () => void;
  onUpdateDraftAtCurrentStep: (next: ChapterStudioData) => void;
  onNavigateToPlan: () => void;
  onRepairApplied: ReviewStepProps["onRepairApplied"];
  onSceneDialogueEnrichPreferredChange: (value: boolean) => void;
  goToFlowStep: (
    flowStep: ChapterFlowStepId,
    fieldId?: string | null,
    studioOverride?: ChapterStudioStep,
  ) => void;
}

export function ChapterStudioFlowBody(props: ChapterStudioFlowBodyProps) {
  const {
    activeFlowStep,
    draft,
    creativityControls,
    blockerItems,
    warningItems,
    briefIssues,
    briefWarnings,
    castCanonIssues,
    castCanonWarnings,
    planIssues,
    planWarnings,
    generatingOutline,
    expertMode,
    chapterNumber,
    projectId,
    chapterId,
    characterCatalog,
    preparationScore,
    imageCounts,
    progressionIssues,
    chapterVisualContract,
    chapterVisualContractForReview,
    preLaunchBlocked,
    projectTitle,
    chapterTitle,
    generationContextUserIntent,
    generatedImages,
    minimumImages,
    stackReady,
    stackBlockers,
    initialStats,
    canAccessReview,
    launchDisabledMessage,
    livePremiumDashboard,
    rewritingBeat,
    readinessLaunchBlocked,
    setMessage,
    onIssueAction,
    onUpdateDraft,
    onGenerateOutlines,
    onRewriteBeat,
    onHeroReadinessChange,
    onContinueCastCanon,
    onValidatePlan,
    onContinueDialogues,
    onUpdateDraftAtCurrentStep,
    onNavigateToPlan,
    onRepairApplied,
    onSceneDialogueEnrichPreferredChange,
    goToFlowStep,
  } = props;

  if (activeFlowStep === "brief") {
    return (
      <ChapterBriefStep
        draft={draft}
        creativityControls={creativityControls}
        issues={briefIssues}
        warningItems={briefWarnings}
        generatingOutline={generatingOutline}
        expertMode={expertMode}
        chapterNumber={chapterNumber}
        projectId={projectId}
        chapterId={chapterId}
        onIssueAction={onIssueAction}
        onUpdateDraft={onUpdateDraft}
        onGenerateBase={onGenerateOutlines}
      />
    );
  }

  if (activeFlowStep === "cast_canon") {
    return (
      <ChapterCastCanonStep
        draft={draft}
        issues={castCanonIssues}
        warningItems={castCanonWarnings}
        characterCatalog={characterCatalog}
        projectId={projectId}
        chapterId={chapterId}
        chapterNumber={chapterNumber}
        onHeroReadinessChange={onHeroReadinessChange}
        onIssueAction={onIssueAction}
        onUpdateDraft={onUpdateDraft}
        onContinue={onContinueCastCanon}
      />
    );
  }

  if (activeFlowStep === "plan") {
    return (
      <ChapterPlanStep
        draft={draft}
        chapterVisualContract={chapterVisualContract}
        preparationScore={preparationScore}
        issues={planIssues}
        warningItems={planWarnings}
        generatingOutline={generatingOutline}
        imageCounts={imageCounts}
        progressionIssues={progressionIssues}
        onIssueAction={onIssueAction}
        onUpdateDraft={onUpdateDraft}
        onGenerateOutlines={onGenerateOutlines}
        onRewriteBeat={onRewriteBeat}
        rewritingBeat={rewritingBeat}
        characterCatalog={characterCatalog}
        onValidatePlan={() => {
          // P0.3 — si le contrat de production est incomplet (blueprints <
          // minimumImages), on reste sur l'étape `plan` et on remonte le
          // blocant spécifique au user. Priorité au blocant "plan incomplet"
          // car c'est lui qui empêche réellement le launch (IncompletePlanError).
          const planBlocker =
            blockerItems.find(
              (issue) =>
                issue.id === "production_plan_incomplete_blueprints"
                || issue.id === "production_plan_missing_blueprints"
                || issue.id === "missing_production_plan",
            ) ?? blockerItems[0];
          if (planBlocker) {
            if (
              planBlocker.id === "production_plan_incomplete_blueprints"
              || planBlocker.id === "production_plan_missing_blueprints"
            ) {
              setMessage(planBlocker.message);
            }
            void onIssueAction(planBlocker);
            return;
          }
          if (readinessLaunchBlocked) {
            setMessage("Le plan n'est pas lançable : régénère le plan de production avant validation.");
            goToFlowStep("plan", null, "production_plan");
            return;
          }
          onValidatePlan();
        }}
      />
    );
  }

  if (activeFlowStep === "dialogues") {
    return (
      <ChapterDialoguesStep
        projectId={projectId}
        chapterId={chapterId}
        draft={draft}
        characterCatalog={characterCatalog}
        onUpdateDraft={onUpdateDraftAtCurrentStep}
        onContinue={onContinueDialogues}
      />
    );
  }

  if (activeFlowStep === "generation_review") {
    return (
      <ChapterGenerationReviewStep
        projectId={projectId}
        chapterId={chapterId}
        preLaunchBlocked={preLaunchBlocked}
        projectTitle={projectTitle}
        chapterTitle={chapterTitle}
        userIntent={generationContextUserIntent}
        blockerItems={blockerItems}
        warningItems={warningItems}
        premiumDashboard={livePremiumDashboard}
        generatedImages={generatedImages}
        minimumImages={minimumImages}
        stackReady={stackReady}
        stackBlockers={stackBlockers}
        initialStats={initialStats}
        canAccessReview={canAccessReview}
        disabledMessage={launchDisabledMessage}
        onIssueAction={onIssueAction}
        chapterVisualContract={chapterVisualContractForReview}
        onNavigateToPlan={onNavigateToPlan}
        onRepairApplied={onRepairApplied}
        sceneDialogueEnrichPreferred={draft?.pipelinePreferences?.sceneDialogueEnrich === true}
        onSceneDialogueEnrichPreferredChange={onSceneDialogueEnrichPreferredChange}
      />
    );
  }

  return null;
}
