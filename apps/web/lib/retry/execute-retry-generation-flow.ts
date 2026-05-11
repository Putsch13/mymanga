/**
 * P5.2 — Phase d'exécution du retry (try-block de la route).
 *
 * Encapsule :
 *  1. résolution du `retryPacketBase` + plan packet-aware
 *  2. blocage si `packet_aware_prompt_missing` ou `allowed=false`
 *  3. garde linguistique runtime (FR résiduel)
 *  4. construction du RoutingContext + GenerateInput
 *  5. appel `runRoutedImageGeneration`
 *  6. persist storage Supabase + assertion stable URL
 *  7. validation post-gen + persist success (via `finalizeRetryGeneration`)
 *
 * Renvoie soit un `NextResponse` à propager (échec / blocage), soit
 * `{ ok: true }` si tout s'est bien passé.
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@manga-ai-studio/db";
import { runRoutedImageGeneration, type resolvePremiumImageSize } from "@manga-ai-studio/ai";
import { evaluatePromptLanguage } from "@manga-ai-studio/workflow";
import { validationError } from "@/lib/api-response";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { assertStableImageUrl } from "@/lib/images/assert-stable-image-url";
import {
  resolveRetryPacketBase,
  buildPacketAwareRetryPrompt,
} from "@/lib/retry/retry-packet-resolver";
import {
  persistRetryBlocked,
  persistRetryPersistFailed,
} from "@/lib/retry/persist-retry-outcome";
import { buildRetryRoutingInput } from "@/lib/retry/build-retry-routing-input";
import { finalizeRetryGeneration } from "@/lib/retry/finalize-retry-generation";
import type { RetryMode, RetryReferencePolicy } from "@/lib/images/retry-reference-policy";

type JsonRecord = Record<string, unknown>;

export interface ExecuteRetryGenerationFlowArgs {
  prisma: PrismaClient;
  sceneImageId: string;
  panelId: string;
  panelNumber: number;
  panelImageUrl: string | null;
  panelPrompt: string;
  panelNegativePrompt: string | null;
  projectId: string;
  chapterId: string;
  panelObjectPathPrefix: string;

  metadata: JsonRecord;

  retryMode: RetryMode | null;
  rerollKind: string | null | undefined;
  intensityLayer: string;
  adultEngine: string;
  charactersCount: number;
  characters: string[];

  premiumSize: ReturnType<typeof resolvePremiumImageSize>;
  panelLoras: unknown[];
  referenceImageUrls: string[];
  hasCanonRef: boolean;
  effectiveReferencePolicy: RetryReferencePolicy;

  positiveAugment: string;
  negativeAugment: string;
  userPositive: string;
  userNegative: string;
  locationMarkersLine: string;

  /** Forcages issus du body utilisateur (BUG-13). */
  forceOverrides: Parameters<typeof buildRetryRoutingInput>[0]["forceOverrides"];
  effectiveOverrides: {
    effectiveUserPromptAdditions: string | null;
    effectiveUserPromptExclusions: string | null;
  };

  retryReferenceDecision: Parameters<typeof finalizeRetryGeneration>[0]["retryReferenceDecision"];
  retryReferenceTrace: unknown;
  preDriftResult: Parameters<typeof finalizeRetryGeneration>[0]["preDriftResult"];

  /** `heroPresent` calculé à partir du resolver de personnages (route). */
  heroPresent: boolean;
  resolveCharacterFromName: Parameters<typeof finalizeRetryGeneration>[0]["resolveCharacterFromName"];

  nextUserOverride: JsonRecord | null;
}

export type ExecuteRetryGenerationFlowResult =
  | { ok: true; response: NextResponse }
  | { ok: false; response: NextResponse };

export async function executeRetryGenerationFlow(
  args: ExecuteRetryGenerationFlowArgs,
): Promise<ExecuteRetryGenerationFlowResult> {
  const {
    prisma,
    sceneImageId,
    panelId,
    panelNumber,
    panelImageUrl,
    panelPrompt,
    panelNegativePrompt,
    panelObjectPathPrefix,
    metadata,
    retryMode,
    rerollKind,
    intensityLayer,
    adultEngine,
    charactersCount,
    characters,
    premiumSize,
    panelLoras,
    referenceImageUrls,
    hasCanonRef,
    effectiveReferencePolicy,
    positiveAugment,
    negativeAugment,
    userPositive,
    userNegative,
    locationMarkersLine,
    forceOverrides,
    effectiveOverrides,
    retryReferenceDecision,
    retryReferenceTrace,
    preDriftResult,
    heroPresent,
    resolveCharacterFromName,
    nextUserOverride,
  } = args;

  const retryPacketBase = resolveRetryPacketBase({
    metadataCanonicalPacket: metadata.canonicalPacket ?? null,
    sceneImagePrompt: panelPrompt,
    sceneImageNegativePrompt: panelNegativePrompt,
  });
  const retryAttemptIndex =
    typeof metadata.retryAttemptIndex === "number" ? (metadata.retryAttemptIndex as number) : 0;
  const packetAwarePrompt = retryPacketBase.packet
    ? buildPacketAwareRetryPrompt({
        packet: retryPacketBase.packet,
        retryMode,
        attemptIndex: retryAttemptIndex,
        positiveAugment,
        negativeAugment,
        userPromptAdditions: effectiveOverrides.effectiveUserPromptAdditions,
        userPromptExclusions: effectiveOverrides.effectiveUserPromptExclusions,
      })
    : null;

  if (packetAwarePrompt && packetAwarePrompt.allowed === false) {
    console.warn(
      `[retry] packet_reroll_blocked sceneImageId=${sceneImageId} reason=${packetAwarePrompt.reason} attempt=${retryAttemptIndex}`,
    );
    await persistRetryBlocked({
      prisma,
      panelId,
      baseMetadata: metadata,
      reason: packetAwarePrompt.reason,
      generationLog: null,
      retryReferenceDecision,
      retryReferenceTrace,
      availableReferenceUrls: referenceImageUrls.length,
      availableLoras: panelLoras.length,
    });
    return { ok: false, response: validationError(packetAwarePrompt.reason) };
  }

  if (!packetAwarePrompt) {
    console.warn(
      `[retry] packet_aware_prompt_missing sceneImageId=${sceneImageId} source=${retryPacketBase.source}`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "packet_aware_prompt_missing",
          code: "PREMIUM_PACKET_REQUIRED",
          message:
            "packetAwarePrompt est requis pour un retry premium. Le chemin legacy de reconstruction de prompt est désactivé.",
        },
        { status: 422 },
      ),
    };
  }
  const effectivePositivePrompt = packetAwarePrompt.positivePrompt;
  const effectiveNegativePrompt = packetAwarePrompt.negativePrompt;

  console.log(
    `[retry] source=${retryPacketBase.source} mode=${retryMode ?? "default"} packetVersion=${retryPacketBase.packetVersion ?? "none"} userAdditions=${userPositive.length} userExclusions=${userNegative.length} locationMarkers=${locationMarkersLine.length} referencePolicy=${effectiveReferencePolicy}`,
  );

  // P1.1 — garde linguistique runtime pour le retry.
  const retryLanguageCheck = evaluatePromptLanguage({
    positivePrompt: effectivePositivePrompt,
    negativePrompt: effectiveNegativePrompt,
  });
  const retryLanguageWarnings: string[] = [];
  if (retryLanguageCheck.outcome === "block") {
    console.error(
      `[retry] residual_french_blocked sceneImageId=${sceneImageId} tokens=${retryLanguageCheck.positiveTokens.join("|")}`,
    );
    return {
      ok: false,
      response: validationError(
        "Le prompt final contient du français résiduel, envoi provider refusé.",
        {
          positiveTokens: retryLanguageCheck.positiveTokens,
          negativeTokens: retryLanguageCheck.negativeTokens,
          strictMode:
            process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT === "true"
            || process.env.MANGA_PROMPT_LANGUAGE_GUARD_STRICT === "1",
        },
      ),
    };
  }
  if (retryLanguageCheck.outcome === "warn") {
    retryLanguageWarnings.push(
      `residual_french_tokens(retry):${retryLanguageCheck.positiveTokens.join("|")}${retryLanguageCheck.negativeTokens.length > 0 ? ` neg:${retryLanguageCheck.negativeTokens.join("|")}` : ""}`,
    );
    console.warn(
      `[retry] residual_french_warn sceneImageId=${sceneImageId} tokens=${retryLanguageCheck.positiveTokens.join("|")}`,
    );
  }

  const routingDescriptor = buildRetryRoutingInput({
    metadata,
    forceOverrides,
    retryMode,
    intensityLayer,
    adultEngine,
    charactersCountInScene: charactersCount,
    hasCanonRef,
    effectivePositivePrompt,
    effectiveNegativePrompt,
    premiumSize,
    panelLoras,
    referenceImageUrls,
    effectiveReferencePolicy,
    rerollKind,
    retryReferenceDecision,
    heroPresent,
  });

  const out = await runRoutedImageGeneration(
    routingDescriptor.routingContext as unknown as Parameters<typeof runRoutedImageGeneration>[0],
    routingDescriptor.generateInput as unknown as Parameters<typeof runRoutedImageGeneration>[1],
  );

  if (!out.ok) {
    await persistRetryBlocked({
      prisma,
      panelId,
      baseMetadata: metadata,
      reason: out.reason,
      generationLog: out.log,
      retryReferenceDecision,
      retryReferenceTrace,
      availableReferenceUrls: referenceImageUrls.length,
      availableLoras: panelLoras.length,
    });
    return { ok: false, response: validationError(out.reason) };
  }

  const persisted = await persistGeneratedImageIfNeeded({
    imageUrl: out.result.imageUrl,
    objectPath: `${panelObjectPathPrefix}-retry-${Date.now()}`,
  });

  if (!persisted.ok) {
    await persistRetryPersistFailed({
      prisma,
      panelId,
      baseMetadata: metadata,
      error: persisted.error,
      generationLog: out.log,
      retryReferenceDecision,
      retryReferenceTrace,
      availableReferenceUrls: referenceImageUrls.length,
      availableLoras: panelLoras.length,
    });
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: persisted.error }, { status: 502 }),
    };
  }

  // P0.3 : refuse d'écrire en DB une URL non-stable.
  assertStableImageUrl(persisted.url, "scene-images:retry:persisted.url");

  await finalizeRetryGeneration({
    prisma,
    panelId,
    panelNumber,
    panelImageUrl,
    baseMetadata: metadata,
    characters,
    resolveCharacterFromName,
    out,
    persisted,
    effectivePositivePrompt,
    effectiveNegativePrompt,
    retryMode,
    rerollKind,
    panelLorasCount: panelLoras.length,
    referenceImageUrlsCount: referenceImageUrls.length,
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
  });

  return { ok: true, response: NextResponse.json({ ok: true }) };
}
