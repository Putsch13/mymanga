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
      canRunV3PremiumOnly?: boolean;
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
  chapterVisualContract?: unknown;
  chapterVisualContractUi?: {
    version?: number;
    parasitePolicy: "auto_strip" | "keep_all";
    preLaunchAcknowledged?: boolean;
    updatedAt?: string;
  };
};

/** 7 étapes ciblées — une étape = une couche IA = un contrat. */
export type ChapterFlowStepId =
  | "characters"
  | "story"
  | "locations"
  | "living_world"
  | "plan"
  | "dialogues"
  | "generation_review";

/** Anciens IDs persistés dans les snapshots — mappés au chargement. */
export type LegacyChapterFlowStepId = "brief" | "cast_canon";

export const FLOW_STEPS: Array<{ id: ChapterFlowStepId; title: string; description: string }> = [
  { id: "characters", title: "1. Personnages", description: "Cast actif et cohérence visuelle (LoRA + Flux)." },
  { id: "story", title: "2. Histoire", description: "Pitch, intention et contrat narratif (LLM)." },
  { id: "locations", title: "3. Décors", description: "Lieux du chapitre (VisualWorldContract.locations)." },
  { id: "living_world", title: "4. PNJ & monde", description: "PNJ, props et entités récurrentes." },
  { id: "plan", title: "5. Plan", description: "Découpage panels et plan de production canonique." },
  { id: "dialogues", title: "6. Dialogues", description: "Bulles IA ancrées au plan (DialogueContract)." },
  { id: "generation_review", title: "7. Génération", description: "Lancement, progression et review." },
];

export const FLOW_STEP_ORDER: readonly ChapterFlowStepId[] = [
  "characters",
  "story",
  "locations",
  "living_world",
  "plan",
  "dialogues",
  "generation_review",
] as const;

export function normalizeFlowStepId(step: string | null | undefined): ChapterFlowStepId {
  if (!step) return "story";
  if (step === "brief") return "story";
  if (step === "cast_canon") return "characters";
  if ((FLOW_STEP_ORDER as readonly string[]).includes(step)) {
    return step as ChapterFlowStepId;
  }
  return "story";
}

export function nextFlowStep(current: ChapterFlowStepId): ChapterFlowStepId | null {
  const idx = FLOW_STEP_ORDER.indexOf(current);
  if (idx < 0 || idx >= FLOW_STEP_ORDER.length - 1) return null;
  return FLOW_STEP_ORDER[idx + 1] ?? null;
}

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
  if (!step) return "story";
  if (step === "intent" || step === "narrative_contract") return "story";
  if (step === "characters") return "characters";
  if (step === "canon") return "living_world";
  if (
    step === "editorial_outline"
    || step === "production_outline"
    || step === "production_plan"
  ) {
    return "plan";
  }
  if (step === "readiness" || step === "generation" || step === "review") {
    return "generation_review";
  }
  return "generation_review";
}

export function isDialoguesStepRequired(draft: ChapterStudioData | null | undefined): boolean {
  if (!draft) return false;
  const hasPlan = (draft.productionPlan?.panelBlueprints?.length ?? 0) > 0;
  if (!hasPlan) return false;
  const dialogueDensity = draft.chapterIntentContract?.dialogueDensity ?? "medium";
  return dialogueDensity !== "low";
}

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

/** Mode express : seuls personnages + histoire sont requis avant plan auto. */
export function isExpressMode(draft: ChapterStudioData, expertMode: boolean): boolean {
  return !expertMode;
}

export function expressRequiredFlowSteps(): ChapterFlowStepId[] {
  return ["characters", "story"];
}
