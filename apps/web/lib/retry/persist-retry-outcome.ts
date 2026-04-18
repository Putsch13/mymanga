/**
 * P5.1 — Extraction des `prisma.sceneImage.update(...)` du retry.
 *
 * Trois branches :
 *   1. `persistRetryBlocked`      — out.ok === false (provider bloqué)
 *   2. `persistRetryFailure`      — persistence storage KO ou exception
 *   3. `persistRetryPersistFailed` — persistence Supabase KO (422/502)
 *   4. `persistRetrySuccess`      — full success (avec validation post-gen)
 *
 * Les fonctions sont `await`-ables et renvoient le payload metadata
 * construit (utile pour les tests).
 *
 * Règle : AUCUN changement de clé ni d'ordre dans le spread `metadata`,
 * c'est copié-collé 1:1 depuis route.ts.
 */

import type { Prisma, PrismaClient } from "@manga-ai-studio/db";

type JsonRecord = Record<string, unknown>;

type RetryDecisionLike = {
  referencePolicy: string;
  positivePromptHint?: string | null;
  negativePromptHint?: string | null;
  [k: string]: unknown;
};

type RetryTraceLike = unknown;

export async function persistRetryBlocked(params: {
  prisma: PrismaClient;
  panelId: string;
  baseMetadata: JsonRecord;
  reason: string;
  generationLog: unknown;
  retryReferenceDecision: RetryDecisionLike;
  retryReferenceTrace: RetryTraceLike;
  availableReferenceUrls: number;
  availableLoras: number;
}): Promise<void> {
  const { prisma, panelId, baseMetadata } = params;
  await prisma.sceneImage.update({
    where: { id: panelId },
    data: {
      status: "blocked",
      metadata: ({
        ...baseMetadata,
        blockedReason: params.reason,
        generationLog: params.generationLog,
        retryReferenceDecision: {
          ...params.retryReferenceDecision,
          availableReferenceUrls: params.availableReferenceUrls,
          availableLoras: params.availableLoras,
        },
        retryReferenceTrace: params.retryReferenceTrace,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}

export async function persistRetryPersistFailed(params: {
  prisma: PrismaClient;
  panelId: string;
  baseMetadata: JsonRecord;
  error: string;
  generationLog: unknown;
  retryReferenceDecision: RetryDecisionLike;
  retryReferenceTrace: RetryTraceLike;
  availableReferenceUrls: number;
  availableLoras: number;
}): Promise<void> {
  const { prisma, panelId, baseMetadata } = params;
  await prisma.sceneImage.update({
    where: { id: panelId },
    data: {
      status: "failed",
      metadata: ({
        ...baseMetadata,
        error: params.error,
        generationLog: params.generationLog,
        retryReferenceDecision: {
          ...params.retryReferenceDecision,
          availableReferenceUrls: params.availableReferenceUrls,
          availableLoras: params.availableLoras,
        },
        retryReferenceTrace: params.retryReferenceTrace,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}

export async function persistRetryException(params: {
  prisma: PrismaClient;
  panelId: string;
  baseMetadata: JsonRecord;
  errorMessage: string;
  retryReferenceDecision: RetryDecisionLike;
  retryReferenceTrace: RetryTraceLike;
  availableReferenceUrls: number;
  availableLoras: number;
}): Promise<void> {
  const { prisma, panelId, baseMetadata } = params;
  await prisma.sceneImage.update({
    where: { id: panelId },
    data: {
      status: "failed",
      metadata: ({
        ...baseMetadata,
        error: params.errorMessage,
        retryReferenceDecision: {
          ...params.retryReferenceDecision,
          availableReferenceUrls: params.availableReferenceUrls,
          availableLoras: params.availableLoras,
        },
        retryReferenceTrace: params.retryReferenceTrace,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}

export type PersistRetrySuccessInput = {
  prisma: PrismaClient;
  panelId: string;
  baseMetadata: JsonRecord;
  previousImageUrl: string | null;
  persistedUrl: string;
  providerInfo: {
    provider: string;
    model: string;
    seed?: number | null;
  };
  persistedFlag: boolean;
  routingDecision: Prisma.InputJsonValue;
  validation: {
    requiredReroll: boolean;
    qaWasRequired?: boolean;
    qaWasExecuted?: boolean;
    qaFailureReason?: string | null;
    qaBypassReason?: string | null;
    score: number;
    panelCriticality?: unknown;
    qualityScores?: Record<string, unknown> | undefined;
    propertyChecks?: unknown;
    issues: unknown[];
  };
  shouldBlockForReview: boolean | undefined;
  retryMode: string | null;
  retryUsedLoras: number;
  retryUsedRefs: number;
  rerollKind: string | undefined;
  retryReferenceDecision: RetryDecisionLike;
  retryReferenceTrace: RetryTraceLike;
  effectiveReferencePolicy: string;
  preDriftResult: {
    score: number;
    severity: unknown;
    recommendedAction: unknown;
    continuityRisk: unknown;
    reasons: string[];
    styleDriftScore?: unknown;
    characterDriftScore?: unknown;
    beatAlignmentScore?: unknown;
    sceneContinuityScore?: unknown;
    chapterLookMismatch?: unknown;
  } | null;
  generationLog: unknown;
};

export async function persistRetrySuccess(input: PersistRetrySuccessInput): Promise<void> {
  const {
    prisma, panelId, baseMetadata, previousImageUrl, persistedUrl, providerInfo,
    persistedFlag, routingDecision, validation, shouldBlockForReview, retryMode,
    retryUsedLoras, retryUsedRefs, rerollKind, retryReferenceDecision,
    retryReferenceTrace, effectiveReferencePolicy, preDriftResult, generationLog,
  } = input;

  const validationScore = validation.score;

  await prisma.sceneImage.update({
    where: { id: panelId },
    data: {
      status: shouldBlockForReview === true ? "blocked" : "completed",
      // P0.3 : `persistedUrl` est la vraie URL stable canonique post-reroll.
      // `imageUrl` reste synchronisé pour compat legacy (lecteurs, UI review).
      persistedUrl,
      imageUrl: persistedUrl,
      provider: providerInfo.provider,
      model: providerInfo.model,
      consistencyScore: (validation.qualityScores as { releaseScore?: number | null } | undefined)?.releaseScore ?? validationScore,
      routingDecision,
      metadata: ({
        ...baseMetadata,
        previousImageUrl:
          typeof previousImageUrl === "string" && previousImageUrl.length > 0
            ? previousImageUrl
            : typeof baseMetadata.previousImageUrl === "string"
              ? baseMetadata.previousImageUrl
              : null,
        rerollHistory: [
          ...((Array.isArray(baseMetadata.rerollHistory) ? baseMetadata.rerollHistory : []) as unknown[]),
          {
            at: new Date().toISOString(),
            previousImageUrl: typeof previousImageUrl === "string" ? previousImageUrl : null,
            nextImageUrl: persistedUrl,
            mode: retryMode,
          },
        ].slice(-5),
        generationLog,
        seed: providerInfo.seed ?? null,
        persisted: persistedFlag,
        retryUsedLoras,
        retryUsedRefs,
        rerollKind,
        positivePromptHint: retryReferenceDecision.positivePromptHint ?? null,
        negativePromptHint: retryReferenceDecision.negativePromptHint ?? null,
        retryReferenceDecision: {
          ...retryReferenceDecision,
          availableReferenceUrls: retryUsedRefs,
          availableLoras: retryUsedLoras,
          appliedReferencePolicy: effectiveReferencePolicy,
          driftOverrideApplied: effectiveReferencePolicy !== retryReferenceDecision.referencePolicy,
        },
        retryReferenceTrace,
        preDriftAnalysis: preDriftResult
          ? ({
              score: preDriftResult.score,
              severity: preDriftResult.severity,
              recommendedAction: preDriftResult.recommendedAction,
              continuityRisk: preDriftResult.continuityRisk,
              reasons: preDriftResult.reasons.slice(0, 4),
              styleDriftScore: preDriftResult.styleDriftScore,
              characterDriftScore: preDriftResult.characterDriftScore,
              beatAlignmentScore: preDriftResult.beatAlignmentScore,
              sceneContinuityScore: preDriftResult.sceneContinuityScore,
              chapterLookMismatch: preDriftResult.chapterLookMismatch,
            } as unknown as Prisma.InputJsonValue)
          : null,
        validationScore,
        validationDetails: {
          panelCriticality: validation.panelCriticality,
          qualityScores: validation.qualityScores,
          propertyChecks: validation.propertyChecks,
          issues: validation.issues,
          requiredReroll: validation.requiredReroll,
          qaWasRequired: validation.qaWasRequired,
          qaWasExecuted: validation.qaWasExecuted,
          qaFailureReason: validation.qaFailureReason,
          qaBypassReason: validation.qaBypassReason,
        },
        panelCriticality: validation.panelCriticality,
        qaWasRequired: validation.qaWasRequired,
        qaWasExecuted: validation.qaWasExecuted,
        qaFailureReason: validation.qaFailureReason,
        qaBypassReason: validation.qaBypassReason,
        criticalQaBlocked: shouldBlockForReview,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}
