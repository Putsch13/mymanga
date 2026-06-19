/**
 * Types partagés du board de review chapitre. Sortis du composant principal
 * pour pouvoir être consommés par les sous-composants (`panel-card`,
 * `review-filters-card`, …) sans cycles d'import.
 */

export type PremiumReviewAction =
  | "prop_repair"
  | "speaker_anchor_repair"
  | "enemy_presence_repair"
  | "subject_focus_repair"
  | "cutaway_repair"
  | "npc_population_repair";

export type LegacyReviewAction =
  | "style_reroll"
  | "character_reroll"
  | "soft_reroll"
  | "full_reroll";

export type ReviewAction = PremiumReviewAction | LegacyReviewAction | string;

export type PremiumRetryMode =
  | "prop"
  | "speaker"
  | "enemy_presence"
  | "subject_focus"
  | "cutaway"
  | "npc_population";

export type LegacyRetryMode = "style" | "character" | "composition" | "environment";

export type RetryMode = PremiumRetryMode | LegacyRetryMode | string;

/** Table de mapping premium — source de vérité unique pour les rerolls. */
export const REROLL_MODE_MAP: Record<ReviewAction, RetryMode> = {
  style_reroll: "style",
  character_reroll: "character",
  soft_reroll: "composition",
  full_reroll: "character",
  prop_repair: "prop",
  speaker_anchor_repair: "speaker",
  enemy_presence_repair: "enemy_presence",
  subject_focus_repair: "subject_focus",
  cutaway_repair: "cutaway",
  npc_population_repair: "npc_population",
};

export function getRerollModeFromAction(
  recommendedAction: string | null | undefined,
): RetryMode {
  return REROLL_MODE_MAP[recommendedAction ?? ""] ?? "character";
}

export type FilterState = {
  status: "all" | "completed" | "blocked" | "failed" | "pending";
  criticality: "all" | "critical" | "non_critical";
  qa: "all" | "missing" | "executed";
  score: "all" | "weak";
};

export type ReviewPanel = {
  panelId: string;
  sceneId: string;
  panelNumber: number;
  imageUrl: string | null;
  previousImageUrl: string | null;
  critical: boolean;
  criticality: string;
  criticalityReasons: string[];
  score: number;
  axisScores: {
    characterFidelity: number;
    narrativeRelevance: number;
    compositionReadability: number;
    environmentConsistency: number;
    propComplianceScore?: number;
    subjectFocusScore?: number;
    dialogueAnchorScore?: number;
    enemyPresenceScore?: number;
    populationScore?: number;
    cutawayComplianceScore?: number;
  };
  rejectionReasons: string[];
  repairSuggestions: string[];
  rerollCount: number;
  driftScore: number | null;
  driftSeverity: string | null;
  driftReasons: string[];
  styleDriftScore?: number | null;
  characterDriftScore?: number | null;
  beatAlignmentScore?: number | null;
  sceneContinuityScore?: number | null;
  chapterLookMismatch?: boolean | null;
  recommendedAction?: string | null;
  continuityRisk?: boolean | null;
  preservedConstraints?: string[];
  relaxedConstraints?: string[];
  autoAppliedPatches?: Array<{ type: string; description: string }>;
  promptDebug: {
    finalPrompt?: string;
    finalNegativePrompt?: string | null;
    promptSource?: string | null;
    usedPacket?: boolean;
    packetVersion?: string | null;
    provider?: string | null;
    model?: string | null;
    referencePolicy?: string | null;
    width?: number | null;
    height?: number | null;
    refsCount?: number | null;
    lorasCount?: number | null;
    seed?: number | null;
    origin?: string | null;
    retryMode?: string | null;
    retryAttemptIndex?: number | null;
    promptWarnings?: string[];
    resolvedPolicy?: Record<string, boolean>;
  };
  canonicalPacket?: {
    packetVersion: string | null;
    imageIntentType: string | null;
    dominantSubjectKind: string | null;
    heroPresenceMode: string | null;
    contentRating: string | null;
    finalEnglishStructuredPrompt: string | null;
    negativePromptEnglish: string | null;
    modelRoutingDecision: Record<string, unknown> | null;
    providerPayload: Record<string, unknown> | null;
    buildWarnings: string[];
  } | null;
  canonicalPacketValidation?: Record<string, unknown> | null;
  packetRerollPlans?: Array<Record<string, unknown>>;
  prompt: string | null;
  referencePolicy: string | null;
  panelCategory: string | null;
  status: string;
  qaWasRequired: boolean;
  qaWasExecuted: boolean;
  qaFailureReason: string | null;
  qaBypassReason: string | null;
};

export type QAReportResponse = {
  ok: boolean;
  report: {
    panelResults: ReviewPanel[];
    pageScore: number;
    chapterScore: number;
    acceptedPanelCount: number;
    rejectedPanelCount: number;
    imageCounts: {
      estimatedImages: number;
      targetImages: number;
      minimumImages: number;
      generatedImages: number;
      acceptedImages: number;
      rejectedImages: number;
      missingImages: number;
    };
    criticalPanelsCount: number;
    criticalPanelsWithVisualQA: number;
    criticalPanelsBlocked: number;
    criticalPanelsMissingQA: number;
    missingCriticalPanels: string[];
  };
};

export type ReviewReport = QAReportResponse["report"];
