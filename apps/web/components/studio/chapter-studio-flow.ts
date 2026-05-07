"use client";

import type {
  ChapterCreativeControls,
  ChapterReadinessIssue,
  ChapterStudioData,
  ChapterStudioSnapshot,
  ChapterStudioStep,
} from "@manga-ai-studio/core";

export type StudioResponse = {
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
      canRunV3Premium?: boolean;
      premiumVisualQaPreflight?: {
        ok: boolean;
        missing: string[];
        strictlyRequired: boolean;
        launchBlocked: boolean;
      };
    };
    imageStats: {
      total: number;
      completed: number;
      failed: number;
      pending: number;
    };
  };
  /** Snapshot persistant (`chapter.outline.chapterVisualContract`) après run premium V3. */
  chapterVisualContract?: unknown;
  /** Préférences UI + accuse de réception pré-lancement (`chapter.outline.chapterVisualContractUi`). */
  chapterVisualContractUi?: {
    version?: number;
    parasitePolicy: "auto_strip" | "keep_all";
    preLaunchAcknowledged?: boolean;
    updatedAt?: string;
  };
};

export type ChapterFlowStepId = "brief" | "cast_canon" | "plan" | "dialogues" | "generation_review";

export const FLOW_STEPS: Array<{ id: ChapterFlowStepId; title: string; description: string }> = [
  { id: "brief", title: "1. Brief", description: "Titre, pitch et base narrative du chapitre." },
  { id: "cast_canon", title: "2. Casting & Cohérence", description: "Personnages actifs, décor et continuité essentielle." },
  { id: "plan", title: "3. Plan du chapitre", description: "Direction narrative, outline, plan de prod et prêt à générer." },
  { id: "dialogues", title: "4. Script & Dialogues", description: "Génère et corrige les bulles IA avant le launch." },
  { id: "generation_review", title: "5. Génération & Review", description: "Run, progression, rerolls et validation finale." },
];

export const PLOT_OPTIONS: Array<{ id: "safe" | "bold" | "shock"; label: string; description: string }> = [
  { id: "safe", label: "Progressif", description: "Montée en douceur avec variations maîtrisées." },
  { id: "bold", label: "Intense", description: "Équilibre entre tension, rythme et surprise." },
  { id: "shock", label: "Explosif", description: "Rebondissements plus agressifs et pics forts." },
];

export const DEFAULT_CREATIVE_CONTROLS: ChapterCreativeControls = {
  noveltyLevel: 55,
  worldStrictness: 85,
  visualExoticism: 50,
  npcVariety: 60,
  environmentRichness: 78,
};

export function normalizeCreativeControls(value: Partial<ChapterCreativeControls> | undefined): ChapterCreativeControls {
  return {
    noveltyLevel: value?.noveltyLevel ?? DEFAULT_CREATIVE_CONTROLS.noveltyLevel,
    worldStrictness: value?.worldStrictness ?? DEFAULT_CREATIVE_CONTROLS.worldStrictness,
    visualExoticism: value?.visualExoticism ?? DEFAULT_CREATIVE_CONTROLS.visualExoticism,
    npcVariety: value?.npcVariety ?? DEFAULT_CREATIVE_CONTROLS.npcVariety,
    environmentRichness: value?.environmentRichness ?? DEFAULT_CREATIVE_CONTROLS.environmentRichness,
  };
}

export function joinList(value: string[] | undefined) {
  return (value ?? []).join(", ");
}

export function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapStudioStepToFlowStep(step: ChapterStudioStep | null | undefined): ChapterFlowStepId {
  if (!step) return "brief";
  if (step === "intent") return "brief";
  if (step === "characters" || step === "canon") return "cast_canon";
  if (step === "narrative_contract" || step === "editorial_outline" || step === "production_outline" || step === "production_plan") {
    return "plan";
  }
  if (step === "readiness") {
    return "generation_review";
  }
  return "generation_review";
}

/**
 * P0 (mai 2026) — l’étape "dialogues" est requise dès qu’on a un plan ;
 * elle force l’utilisateur à générer (ou valider) les bulles IA avant le launch.
 */
export function isDialoguesStepRequired(draft: ChapterStudioData | null | undefined): boolean {
  if (!draft) return false;
  const hasPlan = (draft.productionPlan?.panelBlueprints?.length ?? 0) > 0;
  if (!hasPlan) return false;
  const dialogueDensity = draft.chapterIntentContract?.dialogueDensity ?? "medium";
  return dialogueDensity !== "low";
}

/**
 * P0 (mai 2026) — `true` quand l’utilisateur a effectivement validé / persisté
 * un `chapterDialogueContract` (signal robuste pour gate launch).
 */
export function hasValidatedDialogueDraft(draft: ChapterStudioData | null | undefined): boolean {
  if (!draft) return false;
  return (draft.chapterDialogueContract?.totalLines ?? 0) > 0;
}

export function groupIssuesByFlowStep(issues: ChapterReadinessIssue[], flowStep: ChapterFlowStepId) {
  return issues.filter((issue) => mapStudioStepToFlowStep(issue.step) === flowStep);
}

export function computeChapterSummary(draft: ChapterStudioData, snapshot: ChapterStudioSnapshot, fallbackTitle: string) {
  return {
    title: draft.intent?.workingTitle ?? fallbackTitle,
    summary:
      draft.editorialOutline?.summary
      ?? snapshot.data.editorialOutline?.summary
      ?? snapshot.data.intent?.shortPitch
      ?? "Configure puis débloque le chapitre depuis ce tunnel simplifié.",
  };
}

export function computeFlowCompletion(
  snapshot: ChapterStudioSnapshot,
  blockers: ChapterReadinessIssue[],
  liveCompletedSteps?: string[],
) {
  const completedStudioSteps = new Set(liveCompletedSteps ?? snapshot.data.readinessReport?.completedSteps ?? []);
  const completedFlowSteps = new Set<ChapterFlowStepId>(
    Array.from(completedStudioSteps).map((step) => mapStudioStepToFlowStep(step as ChapterStudioStep)),
  );
  const blockerCounts = new Map<ChapterFlowStepId, number>();
  for (const issue of blockers) {
    const flowStep = mapStudioStepToFlowStep(issue.step);
    blockerCounts.set(flowStep, (blockerCounts.get(flowStep) ?? 0) + 1);
  }
  return FLOW_STEPS.map((step) => ({
    ...step,
    blockerCount: blockerCounts.get(step.id) ?? 0,
    done: completedFlowSteps.has(step.id) && (blockerCounts.get(step.id) ?? 0) === 0,
  }));
}
