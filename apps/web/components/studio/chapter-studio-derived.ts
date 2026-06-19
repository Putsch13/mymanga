/**
 * Valeurs dérivées du Chapter Studio pour le rendu UI.
 */
import { PREMIUM_PANEL_RANGE, type ChapterStudioData, type ChapterStudioSnapshot } from "@manga-ai-studio/core";
import {
  computeChapterSummary,
  computeFlowCompletion,
  groupIssuesByFlowStep,
  normalizeCreativeControls,
  type StudioResponse,
} from "./chapter-studio-flow";

const REVIEWABLE_STATUSES = [
  "QA_REVIEW",
  "NEEDS_FIXES",
  "COMPLETED",
  "PUBLISHED",
  "GENERATION_PARTIAL",
] as const;

export interface ChapterStudioDerivedArgs {
  draft: ChapterStudioData;
  snapshot: ChapterStudioSnapshot;
  chapterTitle: string;
  liveReadiness: ChapterStudioSnapshot["data"]["readinessReport"] | null;
  generationContext: StudioResponse["generationContext"] | null;
  chapterVisualContractUi: StudioResponse["chapterVisualContractUi"];
}

export function computeChapterStudioDerived(args: ChapterStudioDerivedArgs) {
  const {
    draft,
    snapshot,
    chapterTitle,
    liveReadiness,
    generationContext,
    chapterVisualContractUi,
  } = args;

  const readiness = liveReadiness ?? snapshot.data.readinessReport;
  const blockerItems = readiness?.blockerItems ?? [];
  const warningItems = readiness?.warningItems ?? [];
  const generatedImages =
    generationContext?.imageStats.total ?? readiness?.imageCounts.generatedImages ?? 0;
  const acceptedImages = readiness?.imageCounts.acceptedImages ?? 0;
  const minimumImages = readiness?.imageCounts.minimumImages ?? PREMIUM_PANEL_RANGE.min;
  const premiumVisualBlocked =
    generationContext?.stack.premiumVisualQaPreflight?.launchBlocked ?? false;
  const stackReady =
    (generationContext?.stack.canGenerateChapters ?? true) && !premiumVisualBlocked;
  const canAccessReview =
    generatedImages > 0
    || (REVIEWABLE_STATUSES as readonly string[]).includes(snapshot.status);

  const launchDisabledMessage = (() => {
    if (blockerItems.length > 0 && generatedImages === 0) {
      return "Corrige d’abord les blocants du studio pour lancer la génération.";
    }
    if (premiumVisualBlocked) {
      return "Configuration serveur : QA visuelle premium incomplète (variables d’environnement).";
    }
    if (!stackReady) {
      return "La stack de génération n’est pas prête. Corrige les blocants techniques ci-dessous.";
    }
    return null;
  })();

  const creativityControls = normalizeCreativeControls(draft.creativityControls);
  const flowSteps = computeFlowCompletion(snapshot, blockerItems, liveReadiness?.completedSteps);
  const summary = computeChapterSummary(draft, snapshot, chapterTitle);

  const storyIssues = groupIssuesByFlowStep(blockerItems, "story");
  const storyWarnings = groupIssuesByFlowStep(warningItems, "story");
  const charactersIssues = groupIssuesByFlowStep(blockerItems, "characters");
  const charactersWarnings = groupIssuesByFlowStep(warningItems, "characters");
  const locationsIssues = groupIssuesByFlowStep(blockerItems, "locations");
  const locationsWarnings = groupIssuesByFlowStep(warningItems, "locations");
  const livingWorldIssues = groupIssuesByFlowStep(blockerItems, "living_world");
  const livingWorldWarnings = groupIssuesByFlowStep(warningItems, "living_world");
  const planIssues = groupIssuesByFlowStep(blockerItems, "plan");
  const planWarnings = groupIssuesByFlowStep(warningItems, "plan");

  const planReadyForFirstLaunch =
    (readiness?.panelBlueprintCount ?? 0) >= minimumImages && minimumImages > 0;
  const preLaunchBlocked =
    generatedImages === 0
    && planReadyForFirstLaunch
    && chapterVisualContractUi?.preLaunchAcknowledged !== true;

  return {
    readiness,
    blockerItems,
    warningItems,
    generatedImages,
    acceptedImages,
    minimumImages,
    premiumVisualBlocked,
    stackReady,
    canAccessReview,
    launchDisabledMessage,
    creativityControls,
    flowSteps,
    summary,
    storyIssues,
    storyWarnings,
    charactersIssues,
    charactersWarnings,
    locationsIssues,
    locationsWarnings,
    livingWorldIssues,
    livingWorldWarnings,
    planIssues,
    planWarnings,
    planReadyForFirstLaunch,
    preLaunchBlocked,
  };
}
