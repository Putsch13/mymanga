"use client";

import type {
  ChapterCreativeControls,
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import type { OutlineProgressionIssue } from "@/lib/outline-progression-guard";
import { ChapterCharactersStep } from "./chapter-characters-step";
import { ChapterStoryStep } from "./chapter-story-step";
import { ChapterLocationsStep } from "./chapter-locations-step";
import { ChapterLivingWorldStep } from "./chapter-living-world-step";
import { ChapterDialoguesStep } from "./chapter-dialogues-step";
import { ChapterGenerationReviewStep } from "./chapter-generation-review-step";
import { ChapterPlanStep } from "./chapter-plan-step";
import { normalizeFlowStepId, type ChapterFlowStepId } from "./chapter-studio-flow";

type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

type ReviewStepProps = React.ComponentProps<typeof ChapterGenerationReviewStep>;

interface ChapterStudioFlowBodyProps {
  activeFlowStep: ChapterFlowStepId | string;
  draft: ChapterStudioData;
  creativityControls: ChapterCreativeControls;
  blockerItems: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  storyIssues: ChapterReadinessIssue[];
  storyWarnings: ChapterReadinessIssue[];
  charactersIssues: ChapterReadinessIssue[];
  charactersWarnings: ChapterReadinessIssue[];
  locationsIssues: ChapterReadinessIssue[];
  locationsWarnings: ChapterReadinessIssue[];
  livingWorldIssues: ChapterReadinessIssue[];
  livingWorldWarnings: ChapterReadinessIssue[];
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
  onContinueFromStep: (step: ChapterFlowStepId) => void;
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
  const flowStep = normalizeFlowStepId(props.activeFlowStep);

  if (flowStep === "characters") {
    return (
      <ChapterCharactersStep
        draft={props.draft}
        issues={props.charactersIssues}
        warningItems={props.charactersWarnings}
        characterCatalog={props.characterCatalog}
        projectId={props.projectId}
        chapterId={props.chapterId}
        chapterNumber={props.chapterNumber}
        onHeroReadinessChange={props.onHeroReadinessChange}
        onIssueAction={props.onIssueAction}
        onUpdateDraft={props.onUpdateDraft}
        onContinue={() => props.onContinueFromStep("characters")}
      />
    );
  }

  if (flowStep === "story") {
    return (
      <ChapterStoryStep
        draft={props.draft}
        creativityControls={props.creativityControls}
        issues={props.storyIssues}
        warningItems={props.storyWarnings}
        generatingOutline={props.generatingOutline}
        expertMode={props.expertMode}
        chapterNumber={props.chapterNumber}
        projectId={props.projectId}
        chapterId={props.chapterId}
        onIssueAction={props.onIssueAction}
        onUpdateDraft={props.onUpdateDraft}
        onGenerateBase={props.onGenerateOutlines}
        onContinue={() => props.onContinueFromStep("story")}
      />
    );
  }

  if (flowStep === "locations") {
    return (
      <ChapterLocationsStep
        draft={props.draft}
        issues={props.locationsIssues}
        warningItems={props.locationsWarnings}
        chapterId={props.chapterId}
        onUpdateDraft={props.onUpdateDraft}
        onIssueAction={props.onIssueAction}
        onContinue={() => props.onContinueFromStep("locations")}
      />
    );
  }

  if (flowStep === "living_world") {
    return (
      <ChapterLivingWorldStep
        draft={props.draft}
        issues={props.livingWorldIssues}
        warningItems={props.livingWorldWarnings}
        projectId={props.projectId}
        chapterId={props.chapterId}
        chapterNumber={props.chapterNumber}
        onUpdateDraft={props.onUpdateDraft}
        onIssueAction={props.onIssueAction}
        onContinue={() => props.onContinueFromStep("living_world")}
      />
    );
  }

  if (flowStep === "plan") {
    return (
      <ChapterPlanStep
        draft={props.draft}
        chapterVisualContract={props.chapterVisualContract}
        preparationScore={props.preparationScore}
        issues={props.planIssues}
        warningItems={props.planWarnings}
        generatingOutline={props.generatingOutline}
        imageCounts={props.imageCounts}
        progressionIssues={props.progressionIssues}
        onIssueAction={props.onIssueAction}
        onUpdateDraft={props.onUpdateDraft}
        onGenerateOutlines={props.onGenerateOutlines}
        onRewriteBeat={props.onRewriteBeat}
        rewritingBeat={props.rewritingBeat}
        characterCatalog={props.characterCatalog}
        onValidatePlan={() => {
          const planBlocker =
            props.blockerItems.find(
              (issue) =>
                issue.id === "production_plan_incomplete_blueprints"
                || issue.id === "production_plan_missing_blueprints"
                || issue.id === "missing_production_plan",
            ) ?? null;
          if (planBlocker) {
            if (
              planBlocker.id === "production_plan_incomplete_blueprints"
              || planBlocker.id === "production_plan_missing_blueprints"
            ) {
              props.setMessage(planBlocker.message);
            }
            void props.onIssueAction(planBlocker);
            return;
          }
          props.onValidatePlan();
        }}
      />
    );
  }

  if (flowStep === "dialogues") {
    return (
      <ChapterDialoguesStep
        projectId={props.projectId}
        chapterId={props.chapterId}
        draft={props.draft}
        characterCatalog={props.characterCatalog}
        onUpdateDraft={props.onUpdateDraftAtCurrentStep}
        onContinue={props.onContinueDialogues}
      />
    );
  }

  if (flowStep === "generation_review") {
    return (
      <ChapterGenerationReviewStep
        projectId={props.projectId}
        chapterId={props.chapterId}
        preLaunchBlocked={props.preLaunchBlocked}
        projectTitle={props.projectTitle}
        chapterTitle={props.chapterTitle}
        userIntent={props.generationContextUserIntent}
        blockerItems={props.blockerItems}
        warningItems={props.warningItems}
        premiumDashboard={props.livePremiumDashboard}
        generatedImages={props.generatedImages}
        minimumImages={props.minimumImages}
        stackReady={props.stackReady}
        stackBlockers={props.stackBlockers}
        initialStats={props.initialStats}
        canAccessReview={props.canAccessReview}
        disabledMessage={props.launchDisabledMessage}
        onIssueAction={props.onIssueAction}
        chapterVisualContract={props.chapterVisualContractForReview}
        onNavigateToPlan={props.onNavigateToPlan}
        onRepairApplied={props.onRepairApplied}
        sceneDialogueEnrichPreferred={props.draft?.pipelinePreferences?.sceneDialogueEnrich === true}
        onSceneDialogueEnrichPreferredChange={props.onSceneDialogueEnrichPreferredChange}
      />
    );
  }

  return null;
}
