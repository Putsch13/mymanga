import {
  aggregateChapterImageCounts,
  buildStructuredChapterRuntimeFields,
  type ChapterStudioSnapshot,
  resolveChapterRuntimeStatus,
} from "@manga-ai-studio/core";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildValidationDetails(validation: {
  panelCriticality?: { level: "NON_CRITICAL" | "CRITICAL"; reasons: string[] };
  qualityScores?: {
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    interactionScore: number;
    shotComplianceScore: number;
    styleConsistencyScore: number;
    releaseScore: number;
    visionScore?: number | null;
  };
  visionAnalysis?: unknown;
  issues: unknown[];
  propertyChecks?: unknown[];
  qaWasRequired?: boolean;
  qaWasExecuted?: boolean;
  qaFailureReason?: string | null;
  qaBypassReason?: string | null;
}) {
  return {
    panelCriticality: validation.panelCriticality,
    qualityScores: validation.qualityScores
      ? {
          backgroundPresenceScore: validation.qualityScores.backgroundPresenceScore,
          environmentReadabilityScore: validation.qualityScores.environmentReadabilityScore,
          interactionScore: validation.qualityScores.interactionScore,
          shotComplianceScore: validation.qualityScores.shotComplianceScore,
          styleConsistencyScore: validation.qualityScores.styleConsistencyScore,
          releaseScore: validation.qualityScores.releaseScore,
          visionScore: validation.qualityScores.visionScore ?? null,
        }
      : undefined,
    visionAnalysis: validation.visionAnalysis,
    issues: validation.issues,
    propertyChecks: validation.propertyChecks,
    qaWasRequired: validation.qaWasRequired === true,
    qaWasExecuted: validation.qaWasExecuted === true,
    qaFailureReason: validation.qaFailureReason ?? null,
    qaBypassReason: validation.qaBypassReason ?? null,
  };
}

export function computeChapterQualityReport(
  rows: Array<{
    consistencyScore: number | null;
    metadata: unknown;
  }>,
  input?: {
    releaseThreshold?: number;
    minimumAcceptedImages?: number;
  },
) {
  const releaseThreshold = input?.releaseThreshold ?? Number(process.env.PREMIUM_RELEASE_SCORE_THRESHOLD ?? "0.72");
  const minimumAcceptedImages = input?.minimumAcceptedImages ?? Number(process.env.CHAPTER_MIN_ACCEPTED_IMAGES ?? "75");
  const completed = rows.filter((row) => typeof row.consistencyScore === "number");
  const averageReleaseScore =
    completed.length > 0
      ? completed.reduce((acc, row) => acc + Number(row.consistencyScore ?? 0), 0) / completed.length
      : 0;
  const weakPanels = rows
    .map((row, index) => {
      const metadata = asRecord(row.metadata);
      const validationDetails = asRecord(metadata.validationDetails);
      const qualityScores = asRecord(validationDetails.qualityScores);
      return {
        panelIndex: index + 1,
        releaseScore:
          typeof qualityScores.releaseScore === "number"
            ? qualityScores.releaseScore
            : row.consistencyScore,
        issues: Array.isArray(validationDetails.issues)
          ? validationDetails.issues.length
          : 0,
      };
    })
    .filter((row) => typeof row.releaseScore === "number" && row.releaseScore < releaseThreshold)
    .slice(0, 8);

  const criticalPanels = rows.map((row, index) => {
    const metadata = asRecord(row.metadata);
    const validationDetails = asRecord(metadata.validationDetails);
    const panelCriticality = asRecord(validationDetails.panelCriticality);
    const qaWasRequired = validationDetails.qaWasRequired === true || metadata.qaWasRequired === true;
    const qaWasExecuted = validationDetails.qaWasExecuted === true || metadata.qaWasExecuted === true;
    const qaFailureReason =
      typeof validationDetails.qaFailureReason === "string"
        ? validationDetails.qaFailureReason
        : typeof metadata.qaFailureReason === "string"
          ? metadata.qaFailureReason
          : null;
    return {
      panelIndex: index + 1,
      isCritical: panelCriticality.level === "CRITICAL" || qaWasRequired,
      qaWasRequired,
      qaWasExecuted,
      qaFailureReason,
      blocked: qaWasRequired && (!qaWasExecuted || qaFailureReason != null),
    };
  }).filter((panel) => panel.isCritical);

  const imageCounts = aggregateChapterImageCounts({
    estimatedImages: rows.length,
    targetImages: rows.length,
    minimumImages: minimumAcceptedImages,
    generatedImages: rows.length,
    acceptedImages: completed.length,
    rejectedImages: Math.max(0, rows.length - completed.length),
  });

  return {
    averageReleaseScore,
    releaseThreshold,
    minimumAcceptedImages,
    totalPanels: rows.length,
    acceptedImages: imageCounts.acceptedImages,
    rejectedImages: imageCounts.rejectedImages,
    missingImages: imageCounts.missingImages,
    passingPanels: rows.length - weakPanels.length,
    weakPanels,
    criticalPanelsCount: criticalPanels.length,
    criticalPanelsWithVisualQA: criticalPanels.filter((panel) => panel.qaWasExecuted).length,
    criticalPanelsBlocked: criticalPanels.filter((panel) => panel.blocked).length,
    criticalPanelsMissingQA: criticalPanels.filter((panel) => !panel.qaWasExecuted).length,
    minimumImageRequirementMet: imageCounts.acceptedImages >= imageCounts.minimumImages,
    premiumReleaseAccepted:
      imageCounts.acceptedImages >= imageCounts.minimumImages
      && averageReleaseScore >= releaseThreshold
      && weakPanels.length === 0
      && criticalPanels.every((panel) => !panel.blocked),
  };
}

export function resolvePersistedChapterStatus(input: {
  generatedCount: number;
  qualityReport: ReturnType<typeof computeChapterQualityReport>;
}) {
  if (input.generatedCount <= 0) return "ready_for_render" as const;
  const runtimeStatus = resolveChapterRuntimeStatus({
    counts: aggregateChapterImageCounts({
      minimumImages: input.qualityReport.minimumAcceptedImages,
      generatedImages: input.qualityReport.totalPanels,
      acceptedImages: input.qualityReport.acceptedImages,
      rejectedImages: input.qualityReport.rejectedImages,
      estimatedImages: input.qualityReport.totalPanels,
      targetImages: input.qualityReport.totalPanels,
    }),
    hasCriticalQaMissing: input.qualityReport.criticalPanelsBlocked > 0,
    hasRejectedPanels: input.qualityReport.rejectedImages > 0 || input.qualityReport.weakPanels.length > 0,
    hasGeneratedPanels: input.generatedCount > 0,
    hasQaResults: true,
  });
  return runtimeStatus === "COMPLETED" || runtimeStatus === "PUBLISHED"
    ? "published"
    : "review_required";
}

export function buildGenerationRunSummary(input: {
  chapterId: string;
  chapterNumber: number;
  jobId: string;
  totalPlannedImages: number;
  generatedCount: number;
  failedCount: number;
  qualityReport: ReturnType<typeof computeChapterQualityReport>;
}) {
  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    generatedAt: new Date().toISOString(),
    jobId: input.jobId,
    imageStats: {
      total: input.totalPlannedImages,
      generated: input.generatedCount,
      failed: input.failedCount,
      accepted: input.qualityReport.acceptedImages,
      rejected: input.qualityReport.rejectedImages,
      minimumAcceptedImages: input.qualityReport.minimumAcceptedImages,
      missingImages: input.qualityReport.missingImages,
    },
    criticalPanelsCount: input.qualityReport.criticalPanelsCount,
    criticalPanelsWithVisualQA: input.qualityReport.criticalPanelsWithVisualQA,
    criticalPanelsBlocked: input.qualityReport.criticalPanelsBlocked,
    criticalPanelsMissingQA: input.qualityReport.criticalPanelsMissingQA,
  };
}

export function buildPersistedChapterRuntimeState(input: {
  studioSnapshot: ChapterStudioSnapshot | null;
  chapterId: string;
  chapterNumber: number;
  jobId: string;
  totalPlannedImages: number;
  generatedCount: number;
  failedCount: number;
  qualityReport: ReturnType<typeof computeChapterQualityReport>;
}) {
  const persistedChapterStatus = resolvePersistedChapterStatus({
    generatedCount: input.generatedCount,
    qualityReport: input.qualityReport,
  });
  const generationRunSummary = buildGenerationRunSummary({
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    jobId: input.jobId,
    totalPlannedImages: input.totalPlannedImages,
    generatedCount: input.generatedCount,
    failedCount: input.failedCount,
    qualityReport: input.qualityReport,
  });
  const studioSnapshot = input.studioSnapshot
    ? {
        ...input.studioSnapshot,
        status:
          persistedChapterStatus === "published"
            ? ("QA_REVIEW" as const)
            : ("GENERATION_PARTIAL" as const),
        currentStep: "readiness" as const,
        updatedAt: new Date().toISOString(),
      }
    : null;

  return {
    persistedChapterStatus,
    generationRunSummary,
    structuredRuntimeFields: studioSnapshot
      ? buildStructuredChapterRuntimeFields({
          snapshot: studioSnapshot,
          counts: {
            minimumImages: input.qualityReport.minimumAcceptedImages,
            generatedImages: input.qualityReport.totalPanels,
            acceptedImages: input.qualityReport.acceptedImages,
            rejectedImages: input.qualityReport.rejectedImages,
          },
          criticalPanelsCount: input.qualityReport.criticalPanelsCount,
          criticalPanelsBlocked: input.qualityReport.criticalPanelsBlocked,
          criticalPanelsMissingQa: input.qualityReport.criticalPanelsMissingQA,
        })
      : null,
  };
}

export function buildRuntimeDebugSummary(input: {
  generationRunSummary: ReturnType<typeof buildGenerationRunSummary>;
  productionSource: {
    source: string;
    fallbackUsed: boolean;
    legacyBridgeUsed: boolean;
  };
}) {
  return {
    ...input.generationRunSummary,
    outlineSource: input.productionSource.source,
    fallbackUsed: input.productionSource.fallbackUsed,
    legacyBridgeUsed: input.productionSource.legacyBridgeUsed,
  };
}

