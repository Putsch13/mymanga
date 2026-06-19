import { NextResponse } from "next/server";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import { resolveAdultEngine, resolvePremiumImageSize } from "@manga-ai-studio/ai";
import {
  resolveChapterLookProfile,
  SCENE_IMAGE_STATUS,
  stripLegacyPanelTextFieldsWhenContractPresent,
} from "@manga-ai-studio/core";
import { resolveStableImageReferences } from "@manga-ai-studio/workflow";
import { getAppUser } from "@/lib/auth/get-app-user";
import {
  canAccessMatureContent,
  canBypassMatureContent,
  getAgeGateMessage,
  projectRequiresAgeGate,
} from "@/lib/age-gate";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import {
  resolveRetryReferencePolicy,
  type RetryMode,
} from "@/lib/images/retry-reference-policy";
import { collectRetryStableReferences } from "@/lib/images/retry-stable-references";
import { buildCharacterRetryHints as buildCharacterRetryHintsShared } from "@/lib/retry/build-character-retry-hints";
import { buildLocationMarkersLine } from "@/lib/retry/build-location-markers";
import { extractCriticalPropsFromPanelContractMeta } from "@/lib/retry/extract-critical-props";
import { resolvePanelLoras } from "@/lib/retry/resolve-panel-loras";
import {
  buildRetryPrompts,
  resolveRerollKind,
} from "@/lib/retry/build-retry-prompts";
import { persistRetryException } from "@/lib/retry/persist-retry-outcome";
import { resolveEffectiveRetryOverrides } from "@/lib/retry/retry-packet-resolver";
import { computeRetryReferencePolicy } from "@/lib/retry/compute-retry-reference-policy";
import {
  createRetryCharacterResolver,
  buildDriftCharactersEnriched,
} from "@/lib/retry/build-retry-character-context";
import { buildRetryRoutingInput } from "@/lib/retry/build-retry-routing-input";
import { executeRetryGenerationFlow } from "@/lib/retry/execute-retry-generation-flow";
import {
  parseAndValidateRetryBody,
  hasUsableCanonicalPacketIn,
} from "@/lib/retry/parse-and-validate-retry-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  // G02: rate limit retries
  const rl = await checkRateLimit(user.id, "continue");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return validationError("La stack image n'est pas prete pour relancer cette case.", stack);
  }
  const { sceneImageId } = await ctx.params;

  const img = await prisma.sceneImage.findFirst({
    where: { id: sceneImageId, scene: { chapter: { project: { userId: user.id } } } },
    include: { scene: { include: { chapter: { include: { project: true } } } } },
  });
  if (!img) return notFound();

  const project = img.scene.chapter.project;
  const projectId = project.id;
  const intensityLayer = (project.intensityLayer as string | null) ?? "TEEN";
  const adultEngine = resolveAdultEngine({
    primaryGenre: project.primaryGenre,
    subGenres: Array.isArray(project.subGenres) ? (project.subGenres as string[]) : [],
    visualStyle: project.visualStyle,
    userIntent: img.prompt ?? undefined,
  });

  const projectForGate = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!projectForGate) return notFound();
  if (
    projectRequiresAgeGate(projectForGate.contentRating, projectForGate.intensityLayer)
    && !canAccessMatureContent(projectForGate.user, projectForGate.user.preferences)
  ) {
    return validationError(getAgeGateMessage(projectForGate.contentRating));
  }
  if (canBypassMatureContent(projectForGate.user.email)) {
    console.warn(
      `[adult-bypass] ${projectForGate.user.email} bypassed mature gate on /api/scene-images/${sceneImageId}/retry (NODE_ENV=${process.env.NODE_ENV})`,
    );
  }

  if (!img.prompt) {
    return validationError("Ce panel n'a pas de prompt à régénérer.");
  }

  const metadata = ((img.metadata ?? {}) as unknown) as Record<string, unknown>;

  const parsed = await parseAndValidateRetryBody(req);
  if (!parsed.ok) return parsed.response;
  const { retryBody, retryBodyParsed, sanitizedAdditions, sanitizedExclusions } = parsed;

  // AUDIT COMMIT 5 — guard strict : aucun retry possible sans canonicalPacket exploitable.
  if (!hasUsableCanonicalPacketIn(metadata)) {
    console.error(
      `[retry] missing_canonical_packet sceneImageId=${sceneImageId} chapterId=${img.scene.chapter.id} — retry refusé pour éviter un fallback legacy sale.`,
    );
    return NextResponse.json(
      {
        error: "Ce panel n'a pas de canonicalPacket exploitable pour un retry fiable.",
        code: "MISSING_CANONICAL_PACKET",
      },
      { status: 422 },
    );
  }

  const urlParams = new URL(req.url).searchParams;
  const retryMode = (retryBody.mode ?? (urlParams.get("mode") as RetryMode | null)) ?? null;
  const premiumSize = resolvePremiumImageSize("PANEL_DRAFT", { width: img.width, height: img.height });
  const characters = Array.isArray(metadata.characters) ? (metadata.characters as string[]) : [];
  const savedReferenceIds = Array.isArray(img.referenceImageIds) ? (img.referenceImageIds as string[]) : [];

  const panelCastData = (img.panelCast ?? metadata.panelCast) as {
    focus?: { characterId: string; name: string } | null;
    supporting?: Array<{ characterId: string; name: string }>;
  } | null;

  const projectChars = await prisma.character.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      characterFingerprint: true,
      appearance: true,
      hairColor: true,
      eyeColor: true,
      outfitDefault: true,
      visualProfile: true,
      bodyState: true,
      wardrobeProfile: true,
      stableVisualDNA: true,
    },
  });

  const charResolver = createRetryCharacterResolver({
    metadata,
    projectChars,
    panelCastData,
    characters,
  });
  const {
    projectCharsById,
    resolveCharacterFromName,
    resolvedPanelCharacterIds,
    metadataCharacterIds,
  } = charResolver;

  const { panelLoras, castOrderedNames } = await resolvePanelLoras({
    prisma,
    projectId,
    characters,
    panelCastData,
    resolveCharacterFromName,
    panelId: img.id,
  });

  const retryStableReferences = collectRetryStableReferences({ metadata, savedReferenceIds });
  const retryReferenceResolution = await resolveStableImageReferences(retryStableReferences, {
    logPrefix: "[retry:refs]",
  });
  const referenceImageUrls = retryReferenceResolution.urls;
  const hasCanonRef = referenceImageUrls.length > 0 || panelLoras.length > 0;

  const driftCharactersEnriched = buildDriftCharactersEnriched({
    projectChars,
    resolvedPanelCharacterIds,
    resolveCharacterFromName,
    hasCanonRef,
  });

  const panelContractMeta = metadata.panelContract as Record<string, unknown> | undefined;
  const { hasMandatoryProps } = extractCriticalPropsFromPanelContractMeta(panelContractMeta);

  const policy = computeRetryReferencePolicy({
    retryMode,
    metadata,
    prompt: img.prompt ?? "",
    driftCharactersEnriched,
    panelLoras,
    referenceImageUrls,
    retryStableReferences,
    hasCanonRef,
    hasMandatoryProps,
    resolveLookProfile: resolveChapterLookProfile,
  });
  const { preDriftResult, retryReferenceDecision, effectiveReferencePolicy } = policy;

  const chapterId = img.scene.chapter.id;
  const rerollKind = resolveRerollKind(retryMode);
  logChapterContextSummary({
    chapterId,
    chapter: img.scene.chapter as unknown as Record<string, unknown>,
    panelId: img.id,
    retryMode,
    rerollKind: rerollKind ?? null,
    effectiveReferencePolicy,
    retryReferenceDecision,
    referenceImageUrlsCount: referenceImageUrls.length,
    retryStableReferencesCount: retryStableReferences.length,
    panelLorasCount: panelLoras.length,
    preDriftResult,
  });

  const targetCharacterId = retryBody.targetCharacterId ?? urlParams.get("targetCharacterId");
  const characterHints =
    retryMode === "character"
      ? buildCharacterRetryHintsShared(
          resolveTargetCharacterForHints({
            targetCharacterId,
            panelCastData,
            metadataCharacterIds,
            characters,
            projectCharsById,
            resolveCharacterFromName,
          }) ?? null,
        )
      : null;

  const locationMarkersLine =
    retryMode === "environment" || retryMode === "composition"
      ? await buildLocationMarkersLine({ prisma, locationId: img.scene.locationId })
      : "";

  const { positiveAugment, negativeAugment, userPositive, userNegative } = buildRetryPrompts({
    retryMode,
    retryReferenceDecision,
    characterHints,
    locationMarkersLine,
    userPromptAdditions: retryBody.userPromptAdditions,
    userPromptExclusions: retryBody.userPromptExclusions,
  });

  // BUG-13 + P0.3 : userOverride avec fusion tri-état stricte.
  const previousUserOverride = (metadata.userOverride as Record<string, unknown> | undefined) ?? null;
  const effectiveOverrides = resolveEffectiveRetryOverrides({
    previous: previousUserOverride
      ? {
          userPromptAdditions:
            typeof previousUserOverride.userPromptAdditions === "string"
              ? (previousUserOverride.userPromptAdditions as string)
              : null,
          userPromptExclusions:
            typeof previousUserOverride.userPromptExclusions === "string"
              ? (previousUserOverride.userPromptExclusions as string)
              : null,
          forceOverrides:
            (previousUserOverride.forceOverrides as Record<string, unknown> | undefined) ?? {},
        }
      : null,
    body: {
      userPromptAdditions:
        sanitizedAdditions !== undefined
          ? sanitizedAdditions
          : userPositive
            ? userPositive
            : undefined,
      userPromptExclusions:
        sanitizedExclusions !== undefined
          ? sanitizedExclusions
          : userNegative
            ? userNegative
            : undefined,
      forceOverrides: retryBodyParsed.forceOverrides as Record<string, unknown> | null | undefined,
    },
  });
  const nextUserOverride = effectiveOverrides.persisted;

  await prisma.sceneImage.update({
    where: { id: img.id },
    data: {
      status: SCENE_IMAGE_STATUS.PENDING,
      metadata: stripLegacyPanelTextFieldsWhenContractPresent({
        ...metadata,
        retryRequestedAt: new Date().toISOString(),
        ...(nextUserOverride ? { userOverride: nextUserOverride } : {}),
      } as Record<string, unknown>) as unknown as Prisma.InputJsonValue,
    },
  });

  try {
    const heroPresentRetry = castOrderedNames.some(
      (n) => resolveCharacterFromName(n)?.character != null,
    );

    const flowResult = await executeRetryGenerationFlow({
      prisma,
      sceneImageId,
      panelId: img.id,
      panelNumber: img.panelNumber,
      panelImageUrl: img.imageUrl,
      panelPrompt: img.prompt,
      panelNegativePrompt: img.negativePrompt ?? null,
      projectId: project.id,
      chapterId,
      panelObjectPathPrefix: `projects/${project.id}/chapters/${chapterId}/panels/${img.id}`,
      metadata,
      retryMode,
      rerollKind,
      intensityLayer,
      adultEngine,
      charactersCount: characters.length,
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
      forceOverrides: (retryBody.forceOverrides ?? {}) as Parameters<typeof buildRetryRoutingInput>[0]["forceOverrides"],
      effectiveOverrides: {
        effectiveUserPromptAdditions: effectiveOverrides.effectiveUserPromptAdditions,
        effectiveUserPromptExclusions: effectiveOverrides.effectiveUserPromptExclusions,
      },
      retryReferenceDecision,
      retryReferenceTrace: retryReferenceResolution.trace,
      preDriftResult,
      heroPresent: heroPresentRetry,
      resolveCharacterFromName: resolveCharacterFromName as unknown as Parameters<typeof executeRetryGenerationFlow>[0]["resolveCharacterFromName"],
      nextUserOverride: nextUserOverride as Record<string, unknown> | null,
    });

    return flowResult.response;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await persistRetryException({
      prisma,
      panelId: img.id,
      baseMetadata: metadata,
      errorMessage: msg,
      retryReferenceDecision,
      retryReferenceTrace: retryReferenceResolution.trace,
      availableReferenceUrls: referenceImageUrls.length,
      availableLoras: panelLoras.length,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

function resolveTargetCharacterForHints<C extends { id: string; name: string; [k: string]: unknown }>(args: {
  targetCharacterId: string | null;
  panelCastData: { focus?: { characterId: string; name: string } | null } | null;
  metadataCharacterIds: string[];
  characters: string[];
  projectCharsById: Map<string, C>;
  resolveCharacterFromName: (name: string) => { character: C } | null;
}): C | undefined {
  const {
    targetCharacterId,
    panelCastData,
    metadataCharacterIds,
    characters,
    projectCharsById,
    resolveCharacterFromName,
  } = args;
  if (targetCharacterId) return projectCharsById.get(targetCharacterId);
  if (panelCastData?.focus?.characterId) return projectCharsById.get(panelCastData.focus.characterId);
  for (const id of metadataCharacterIds) {
    const c = projectCharsById.get(id);
    if (c) return c;
  }
  for (const name of characters) {
    const c = resolveCharacterFromName(name)?.character;
    if (c) return c;
  }
  return undefined;
}

function logChapterContextSummary(args: {
  chapterId: string;
  chapter: Record<string, unknown>;
  panelId: string;
  retryMode: RetryMode | null;
  rerollKind: string | null;
  effectiveReferencePolicy: string;
  retryReferenceDecision: ReturnType<typeof resolveRetryReferencePolicy>;
  referenceImageUrlsCount: number;
  retryStableReferencesCount: number;
  panelLorasCount: number;
  preDriftResult: { score: number; recommendedAction: string | null } | null;
}) {
  const {
    chapterId,
    chapter,
    panelId,
    retryMode,
    rerollKind,
    effectiveReferencePolicy,
    retryReferenceDecision,
    referenceImageUrlsCount,
    retryStableReferencesCount,
    panelLorasCount,
    preDriftResult,
  } = args;
  const chapterOutlineRecord = (chapter.outline ?? {}) as Record<string, unknown>;
  const approvedOutlineRecord = (chapterOutlineRecord.approvedOutline ?? {}) as Record<string, unknown>;
  const approvedOutlineVersion =
    typeof approvedOutlineRecord.version === "number"
      ? approvedOutlineRecord.version
      : typeof approvedOutlineRecord.version === "string"
        ? approvedOutlineRecord.version
        : null;
  const studioData = ((chapterOutlineRecord.studio ?? {}) as Record<string, unknown>).data as
    | Record<string, unknown>
    | undefined;
  const productionOutline =
    studioData && typeof studioData.productionOutline === "object"
      ? (studioData.productionOutline as Record<string, unknown>)
      : null;
  const productionPlan =
    studioData && typeof studioData.productionPlan === "object"
      ? (studioData.productionPlan as Record<string, unknown>)
      : null;
  const productionOutlineBeats = productionOutline && Array.isArray(productionOutline.beats)
    ? (productionOutline.beats as unknown[]).length
    : null;
  const productionPlanPages = productionPlan && Array.isArray(productionPlan.pages)
    ? (productionPlan.pages as unknown[]).length
    : null;
  const panelBlueprintCount = productionPlan && Array.isArray(productionPlan.panelBlueprints)
    ? (productionPlan.panelBlueprints as unknown[]).length
    : null;
  const premiumReadinessScore =
    productionPlan && typeof productionPlan.premiumReadinessScore === "number"
      ? productionPlan.premiumReadinessScore
      : null;

  console.info(
    `[retry] chapterId=${chapterId} approvedOutlineVersion=${approvedOutlineVersion ?? "n/a"} productionOutlineBeatCount=${productionOutlineBeats ?? "n/a"} productionPlanPageCount=${productionPlanPages ?? "n/a"} panelBlueprintCount=${panelBlueprintCount ?? "n/a"} premiumReadinessScore=${premiumReadinessScore ?? "n/a"} panel=${panelId} mode=${retryMode ?? "default"} rerollKind=${rerollKind ?? "n/a"} refPolicy=${effectiveReferencePolicy} (base=${retryReferenceDecision.referencePolicy}) importantCharacter=${retryReferenceDecision.importantCharacterPresent} reason=${retryReferenceDecision.reason} refs=${referenceImageUrlsCount}/${retryStableReferencesCount} loras=${panelLorasCount} driftAction=${preDriftResult?.recommendedAction ?? "n/a"} driftScore=${preDriftResult?.score ?? "n/a"} positivePromptHint=${retryReferenceDecision.positivePromptHint ? "yes" : "no"} negativePromptHint=${retryReferenceDecision.negativePromptHint ? "yes" : "no"}`,
  );
}
