/**
 * P5.2 — Calcul des valeurs dérivées du ChapterStudio (UI prête à rendre).
 *
 * Centralise la logique conditionnelle de :
 *   - `launchDisabledMessage` : message principal du bouton launch suivant
 *      l'origine du blocage (blockers studio / premium / stack / vision QA).
 *   - `preLaunchBlocked` : exige la confirmation du contrat visuel sur le
 *      tout premier lancement.
 *   - `flowSteps`, `summary` et les groupes d'issues par flow step.
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
  livePremiumDashboardStatus: "ok" | "ready" | "blocked" | "warning" | undefined;
  generationContext: StudioResponse["generationContext"] | null;
  chapterVisualContractUi: StudioResponse["chapterVisualContractUi"];
}

export function computeChapterStudioDerived(args: ChapterStudioDerivedArgs) {
  const {
    draft,
    snapshot,
    chapterTitle,
    liveReadiness,
    livePremiumDashboardStatus,
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
  const premiumLaunchBlocked = (livePremiumDashboardStatus === "blocked" && generatedImages === 0) ?? false;

  const launchDisabledMessage = (() => {
    if ((blockerItems.length > 0 || premiumLaunchBlocked) && generatedImages === 0) {
      if (premiumLaunchBlocked && blockerItems.length === 0) {
        return "Corrige d’abord les blocants premium (checklist contrats) avant de lancer.";
      }
      return "Corrige d’abord les blocants du studio pour lancer la génération.";
    }
    if (premiumVisualBlocked) {
      return "Configuration serveur : QA visuelle premium incomplète (variables d’environnement). Corrige la liste ci-dessous ou contacte l’administrateur.";
    }
    if (!stackReady) {
      return "La stack de génération n’est pas prête. Corrige les blocants techniques ci-dessous.";
    }
    return null;
  })();

  const creativityControls = normalizeCreativeControls(draft.creativityControls);
  const flowSteps = computeFlowCompletion(snapshot, blockerItems, liveReadiness?.completedSteps);
  const summary = computeChapterSummary(draft, snapshot, chapterTitle);
  const briefIssues = groupIssuesByFlowStep(blockerItems, "brief");
  const briefWarnings = groupIssuesByFlowStep(warningItems, "brief");
  const castCanonIssues = groupIssuesByFlowStep(blockerItems, "cast_canon");
  const castCanonWarnings = groupIssuesByFlowStep(warningItems, "cast_canon");
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
    premiumLaunchBlocked,
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
  };
}
