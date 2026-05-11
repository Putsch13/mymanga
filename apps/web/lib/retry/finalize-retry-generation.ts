/**
 * P5.2 — Validation post-génération + persist success.
 *
 * Centralise les ~175 lignes qui finalisaient un retry réussi :
 *   1. construction des `charactersWithFingerprints`
 *   2. appel `validateGeneratedPanel`
 *   3. log warning si `requiredReroll`
 *   4. appel `persistRetrySuccess` (avec promptDebug, packetRerollPlanEntry,
 *      updatedCanonicalPacket, nextUserOverride, …)
 *
 * Pure orchestration — délègue les détails de DB à `persistRetrySuccess`.
 */
import type { Prisma, PrismaClient } from "@manga-ai-studio/db";
import { validateGeneratedPanel } from "@manga-ai-studio/ai";
import { persistRetrySuccess } from "@/lib/retry/persist-retry-outcome";
import type { RetryMode, RetryReferencePolicy } from "@/lib/images/retry-reference-policy";

type JsonRecord = Record<string, unknown>;

type ResolveCharacterFromName = (name: string) => {
  character: { id: string; name: string; characterFingerprint: unknown };
} | null;

type RoutedImageGenerationResult = {
  result: { imageUrl: string; provider: string; model: string; seed?: number | null };
  routing: unknown;
  log: unknown;
};

type PersistedImage = { url: string; persisted: boolean };

type RetryReferenceDecisionLike = {
  referencePolicy: RetryReferencePolicy;
  positivePromptHint?: string | null;
  negativePromptHint?: string | null;
  importantCharacterPresent?: boolean;
  reason?: string;
  [k: string]: unknown;
};

type PreDriftResultLike = {
  score: number;
  severity: string;
  recommendedAction: string | null;
  continuityRisk: boolean | string | null;
  reasons: string[];
  styleDriftScore?: number;
  characterDriftScore?: number;
  beatAlignmentScore?: number;
  sceneContinuityScore?: number;
  chapterLookMismatch?: boolean;
};

type PacketAwarePromptLike = {
  allowed: boolean;
  reason: string;
  extraPromptHints: unknown;
  extraNegativeTokens: unknown;
  referencePolicyOverride: unknown;
};

export interface FinalizeRetryGenerationArgs {
  prisma: PrismaClient;
  panelId: string;
  panelNumber: number;
  panelImageUrl: string | null;
  baseMetadata: JsonRecord;
  characters: string[];
  resolveCharacterFromName: ResolveCharacterFromName;

  out: RoutedImageGenerationResult;
  persisted: PersistedImage;

  effectivePositivePrompt: string;
  effectiveNegativePrompt: string;

  retryMode: RetryMode | null;
  rerollKind: string | null | undefined;
  panelLorasCount: number;
  referenceImageUrlsCount: number;
  retryReferenceDecision: RetryReferenceDecisionLike;
  retryReferenceTrace: unknown;
  effectiveReferencePolicy: RetryReferencePolicy;
  preDriftResult: PreDriftResultLike | null;

  retryPacketBase: {
    packet: unknown | null;
    source: string;
    packetVersion: string | null;
  };
  packetAwarePrompt: PacketAwarePromptLike | null;

  retryAttemptIndex: number;
  retryLanguageWarnings: string[];
  locationMarkersLine: string;
  userPositive: string;
  userNegative: string;
  premiumSize: { width: number; height: number };

  nextUserOverride: JsonRecord | null;
}

export interface FinalizeRetryGenerationOutput {
  validationScore: number;
  shouldBlockForReview: boolean;
}



export async function finalizeRetryGeneration(
  args: FinalizeRetryGenerationArgs,
): Promise<FinalizeRetryGenerationOutput> {
  const {
    prisma,
    panelId,
    panelNumber,
    panelImageUrl,
    baseMetadata,
    characters,
    resolveCharacterFromName,
    out,
    persisted,
    effectivePositivePrompt,
    effectiveNegativePrompt,
    retryMode,
    rerollKind,
    panelLorasCount,
    referenceImageUrlsCount,
    retryReferenceDecision,
    retryReferenceTrace,
    effectiveReferencePolicy,
    preDriftResult,
    retryPacketBase,
    packetAwarePrompt,
    retryAttemptIndex,
    retryLanguageWarnings,
    locationMarkersLine,
    userPositive,
    userNegative,
    premiumSize,
    nextUserOverride,
  } = args;

  const charactersWithFingerprints = characters
    .map((charName) => {
      const char = resolveCharacterFromName(charName)?.character;
      if (!char) return null;

      const fingerprintRaw = char.characterFingerprint;
      if (!fingerprintRaw || typeof fingerprintRaw !== "object" || Object.keys(fingerprintRaw as object).length === 0) {
        return null;
      }

      return {
        characterId: char.id,
        characterName: char.name,
        fingerprint: fingerprintRaw as never,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const validation = await validateGeneratedPanel({
    panelId,
    imageUrl: persisted.url,
    requiredCharacters: charactersWithFingerprints,
    metadata: {
      // P0.4 — on envoie le prompt final réellement exécuté, pas `img.prompt` legacy
      prompt: effectivePositivePrompt,
      negativePrompt: effectiveNegativePrompt,
      model: out.result.model,
      sceneBlueprint: baseMetadata.sceneBlueprint as never,
      panelContract: baseMetadata.panelContract as never,
      stylePack: baseMetadata.stylePack as never,
      panelQa: {
        heroCharacterId: typeof baseMetadata.heroCharacterId === "string" ? baseMetadata.heroCharacterId : null,
        pageNumber: typeof baseMetadata.pageNumber === "number" ? baseMetadata.pageNumber : null,
        panelNumber: typeof baseMetadata.panelNumber === "number" ? baseMetadata.panelNumber : panelNumber,
        pagePanelCount: typeof baseMetadata.pagePanelCount === "number" ? baseMetadata.pagePanelCount : null,
        panelCategory: typeof baseMetadata.panelCategory === "string" ? baseMetadata.panelCategory : null,
        visualPriority: typeof baseMetadata.visualPriority === "string" ? baseMetadata.visualPriority : null,
        characterRoles: Array.isArray(baseMetadata.panelCharacterRoles)
          ? (baseMetadata.panelCharacterRoles as Array<string | null>)
          : [],
        characterIds: Array.isArray(baseMetadata.characterIds) ? (baseMetadata.characterIds as string[]) : [],
        explicitCriticality:
          baseMetadata.panelCriticality && typeof baseMetadata.panelCriticality === "object"
            ? (baseMetadata.panelCriticality as { level: "NON_CRITICAL" | "CRITICAL"; reasons: string[] })
            : null,
      },
    },
  });
  const validationScore = validation.score;

  if (validation.requiredReroll) {
    console.warn(
      `[retry] Validation failed for panel ${panelId}: score=${validation.score.toFixed(2)}, issues=${validation.issues.length}. Manual review required.`,
    );
  }

  const shouldBlockForReview: boolean =
    validation.requiredReroll || Boolean(validation.qaWasRequired && !validation.qaWasExecuted);

  await persistRetrySuccess({
    prisma,
    panelId,
    baseMetadata,
    previousImageUrl: typeof panelImageUrl === "string" && panelImageUrl.length > 0 ? panelImageUrl : null,
    persistedUrl: persisted.url,
    providerInfo: {
      provider: out.result.provider,
      model: out.result.model,
      seed: out.result.seed ?? null,
    },
    persistedFlag: persisted.persisted,
    routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
    validation: {
      requiredReroll: validation.requiredReroll,
      qaWasRequired: validation.qaWasRequired,
      qaWasExecuted: validation.qaWasExecuted,
      qaFailureReason: validation.qaFailureReason,
      qaBypassReason: validation.qaBypassReason,
      score: validationScore,
      panelCriticality: validation.panelCriticality,
      qualityScores: validation.qualityScores,
      propertyChecks: validation.propertyChecks,
      issues: validation.issues,
    },
    shouldBlockForReview,
    retryMode,
    retryUsedLoras: panelLorasCount,
    retryUsedRefs: referenceImageUrlsCount,
    rerollKind: rerollKind ?? undefined,
    retryReferenceDecision,
    retryReferenceTrace,
    effectiveReferencePolicy,
    preDriftResult: preDriftResult
      ? {
          score: preDriftResult.score,
          severity: preDriftResult.severity,
          recommendedAction: preDriftResult.recommendedAction,
          continuityRisk: preDriftResult.continuityRisk,
          reasons: preDriftResult.reasons,
          styleDriftScore: preDriftResult.styleDriftScore,
          characterDriftScore: preDriftResult.characterDriftScore,
          beatAlignmentScore: preDriftResult.beatAlignmentScore,
          sceneContinuityScore: preDriftResult.sceneContinuityScore,
          chapterLookMismatch: preDriftResult.chapterLookMismatch,
        }
      : null,
    generationLog: out.log,
    promptDebug: {
      finalPrompt: effectivePositivePrompt,
      finalNegativePrompt: effectiveNegativePrompt,
      promptSource: retryPacketBase.source,
      retryPromptSource: retryPacketBase.source,
      usedPacket: retryPacketBase.source === "canonical",
      packetVersion: retryPacketBase.packetVersion,
      provider: out.result.provider,
      model: out.result.model,
      referencePolicy: effectiveReferencePolicy,
      appliedReferencePolicy: effectiveReferencePolicy,
      width: premiumSize.width,
      height: premiumSize.height,
      refsCount: referenceImageUrlsCount,
      lorasCount: panelLorasCount,
      seed: out.result.seed ?? null,
      requestedAt: new Date().toISOString(),
      origin: "retry",
      retryMode,
      retryAttemptIndex: retryAttemptIndex + 1,
      warnings: retryLanguageWarnings,
      usedLocationMarkersLength: locationMarkersLine.length,
      usedUserPositiveLength: userPositive.length,
      usedUserNegativeLength: userNegative.length,
    },
    nextUserOverride,
    updatedCanonicalPacket: retryPacketBase.packet
      ? ({
          ...(retryPacketBase.packet as unknown as JsonRecord),
          providerPayload: {
            ...((retryPacketBase.packet as unknown as { providerPayload: JsonRecord }).providerPayload ?? {}),
            prompt: effectivePositivePrompt,
            negativePrompt: effectiveNegativePrompt,
            width: premiumSize.width,
            height: premiumSize.height,
            seed: out.result.seed ?? null,
          },
          modelRoutingDecision: {
            ...((retryPacketBase.packet as unknown as { modelRoutingDecision: JsonRecord }).modelRoutingDecision ?? {}),
            modelId: out.result.model,
            referencePolicy: effectiveReferencePolicy,
            reason: "retry_executed",
          },
        } as JsonRecord)
      : null,
    packetRerollPlanEntry: packetAwarePrompt
      ? {
          attempt: retryAttemptIndex,
          reason: packetAwarePrompt.reason,
          allowed: packetAwarePrompt.allowed,
          retryMode,
          extraPromptHints: packetAwarePrompt.extraPromptHints,
          extraNegativeTokens: packetAwarePrompt.extraNegativeTokens,
          forcedReferencePolicy: packetAwarePrompt.referencePolicyOverride,
          origin: "retry",
          at: new Date().toISOString(),
        }
      : null,
    nextRetryAttemptIndex: retryAttemptIndex + 1,
  });

  return { validationScore, shouldBlockForReview };
}
