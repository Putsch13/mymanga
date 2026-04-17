import { NextResponse } from "next/server";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import {
  runRoutedImageGeneration,
  resolveAdultEngine,
  validateGeneratedPanel,
  resolvePremiumImageSize,
  detectVisualDrift,
} from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { resolveRetryReferencePolicy, type RetryMode } from "@/lib/images/retry-reference-policy";
import { collectRetryStableReferences } from "@/lib/images/retry-stable-references";
import { resolveStableImageReferences } from "@manga-ai-studio/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  // G02: rate limit retries
  const rl = await checkRateLimit(user.id, "continue");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
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
    subGenres: Array.isArray(project.subGenres) ? project.subGenres as string[] : [],
    visualStyle: project.visualStyle,
    userIntent: img.prompt ?? undefined,
  });
  const projectForGate = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!projectForGate) return notFound();
  if (projectRequiresAgeGate(projectForGate.contentRating, projectForGate.intensityLayer) && !canAccessMatureContent(projectForGate.user, projectForGate.user.preferences)) {
    return validationError(getAgeGateMessage(projectForGate.contentRating));
  }
  if (canAccessMatureContent(projectForGate.user, projectForGate.user.preferences) && projectForGate.user.email?.toLowerCase() === "test@gmail.com") {
    console.warn(`[adult-bypass] test@gmail.com bypassed mature gate on /api/scene-images/${sceneImageId}/retry`);
  }

  if (!img.prompt) {
    return validationError("Ce panel n'a pas de prompt à régénérer.");
  }

  const metadata = ((img.metadata ?? {}) as unknown) as Record<string, unknown>;
  const retryMode = new URL(req.url).searchParams.get("mode") as RetryMode | null;
  const premiumSize = resolvePremiumImageSize("PANEL_DRAFT", {
    width: img.width,
    height: img.height,
  });
  const characters = Array.isArray(metadata.characters) ? (metadata.characters as string[]) : [];
  const savedReferenceIds = Array.isArray(img.referenceImageIds) ? (img.referenceImageIds as string[]) : [];

  const panelCastData = (img.panelCast ?? metadata.panelCast) as {
    focus?: { characterId: string; name: string } | null;
    supporting?: Array<{ characterId: string; name: string }>;
  } | null;

  // Reconstruire les LoRAs actifs du projet pour ce panel
  const loraAttachments = await prisma.loraAttachment.findMany({
    where: { projectId, enabled: true },
    include: { lora: true },
  });
  const loraByCharId = new Map<string, { url: string; triggerWord: string; scale: number }>();
  for (const att of loraAttachments) {
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const loraUrl = typeof meta.loraUrl === "string" ? meta.loraUrl : null;
    const triggerWord = typeof meta.triggerWord === "string" ? meta.triggerWord : att.lora.name;
    if (loraUrl && att.characterId && att.lora.status === "active") {
      loraByCharId.set(att.characterId, { url: loraUrl, triggerWord, scale: att.weight });
    }
  }
  const projectChars = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true, characterFingerprint: true },
  });
  const castOrderedNames = panelCastData
    ? [panelCastData.focus?.name, ...(panelCastData.supporting ?? []).map((m) => m.name)].filter((n): n is string => Boolean(n))
    : characters;
  const loraSourceNames = castOrderedNames.length > 0 ? castOrderedNames : characters;
  const panelLoras = loraSourceNames
    .map((name) => {
      const c = projectChars.find((pc) => pc.name === name);
      return c ? loraByCharId.get(c.id) : undefined;
    })
    .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
    .slice(0, 2);

  const retryStableReferences = collectRetryStableReferences({
    metadata,
    savedReferenceIds,
  });
  const retryReferenceResolution = await resolveStableImageReferences(retryStableReferences, {
    logPrefix: "[retry:refs]",
  });
  const referenceImageUrls = retryReferenceResolution.urls;

  const hasCanonRef = referenceImageUrls.length > 0 || panelLoras.length > 0;

  // Analyse de drift pré-reroll pour informer la politique de référence
  const driftCharacters = projectChars
    .filter((pc) => characters.includes(pc.name))
    .map((pc) => {
      const fp = (pc.characterFingerprint as Record<string, unknown> | null) ?? {};
      return {
        name: pc.name,
        gender: typeof fp.gender === "string" ? fp.gender : null,
        hairColor: typeof fp.hairColor === "string" ? fp.hairColor : null,
        eyeColor: typeof fp.eyeColor === "string" ? fp.eyeColor : null,
        bodyDetails: typeof fp.bodyDetails === "string" ? fp.bodyDetails : null,
        appearance: typeof fp.appearance === "string" ? fp.appearance : null,
        canonicalReferenceAvailable: hasCanonRef,
      };
    });

  // Lire les flags premium depuis la metadata persistée
  const hasLookProfile = typeof metadata.chapterLookProfileMode === "string";
  const hasFingerprint = driftCharacters.some((c) => {
    const char = projectChars.find((pc) => pc.name === c.name);
    return char?.characterFingerprint && typeof char.characterFingerprint === "object" && Object.keys(char.characterFingerprint).length > 0;
  });
  const hasSceneAnchor = metadata.sceneAnchor != null && typeof metadata.sceneAnchor === "object";

  // Enrichir les characters avec hardTraits/softTraits depuis le fingerprint
  const driftCharactersEnriched = driftCharacters.map((dc) => {
    const char = projectChars.find((pc) => pc.name === dc.name);
    const fp = char?.characterFingerprint && typeof char.characterFingerprint === "object"
      ? char.characterFingerprint as Record<string, unknown>
      : null;
    return {
      ...dc,
      hardTraits: Array.isArray(fp?.hardTraits)
        ? (fp!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
        : null,
      softTraits: Array.isArray(fp?.softTraits)
        ? (fp!.softTraits as string[]).filter((t): t is string => typeof t === "string")
        : null,
    };
  });

  // Résoudre le chapterLookProfile depuis la metadata
  const { resolveChapterLookProfile } = await import("@manga-ai-studio/core");
  const lookProfileMode = typeof metadata.chapterLookProfileMode === "string"
    ? metadata.chapterLookProfileMode as Parameters<typeof resolveChapterLookProfile>[0]
    : null;
  const retryLookProfile = lookProfileMode ? resolveChapterLookProfile(lookProfileMode) : null;
  const retryIntentCard = metadata.intentCard as Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
  const retrySceneAnchor = metadata.sceneAnchor as Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;

  const preDriftResult = driftCharactersEnriched.length > 0
    ? detectVisualDrift({
        prompt: img.prompt ?? "",
        characters: driftCharactersEnriched,
        usedLoras: panelLoras.length > 0,
        usedRefs: referenceImageUrls.length > 0,
        panelCategory: typeof metadata.panelCategory === "string" ? metadata.panelCategory : null,
        beatEventType: (retryIntentCard as { beatEventType?: string } | undefined)?.beatEventType
          ?? (typeof metadata.beatEventType === "string" ? metadata.beatEventType : null),
        chapterLookProfile: retryLookProfile,
        sceneAnchor: retrySceneAnchor ?? null,
        intentCard: retryIntentCard ?? null,
      })
    : null;

  // Détecter si le panel a des props obligatoires (ne jamais les relâcher)
  const panelContractMeta = metadata.panelContract as Record<string, unknown> | undefined;
  const requiredPropsTyped = Array.isArray(panelContractMeta?.requiredPropsTyped)
    ? panelContractMeta.requiredPropsTyped as Array<{ mustBeVisible: boolean }>
    : [];
  const hasMandatoryProps = requiredPropsTyped.some((p) => p.mustBeVisible);

  const retryReferenceDecision = resolveRetryReferencePolicy({
    retryMode,
    metadata,
    hasReusableCharacterLock: hasCanonRef,
    recommendedAction: preDriftResult?.recommendedAction ?? null,
    hasLookProfile,
    hasFingerprint,
    hasSceneAnchor,
    hasMandatoryProps,
  });

  // Si le drift pré-reroll recommande un character_reroll mais que le mode est environment,
  // on force au moins LIGHT pour préserver le personnage
  const effectiveReferencePolicy = (() => {
    const base = retryReferenceDecision.referencePolicy;
    if (
      preDriftResult?.recommendedAction === "character_reroll" &&
      (retryMode === "environment" || retryMode === "composition") &&
      base === "NONE" &&
      hasCanonRef
    ) {
      return "LIGHT" as const;
    }
    return base;
  })();

  const chapterId = img.scene.chapter.id;
  const chapterOutlineRecord = ((img.scene.chapter as unknown as Record<string, unknown>).outline ?? {}) as Record<string, unknown>;
  const approvedOutlineRecord = (chapterOutlineRecord.approvedOutline ?? {}) as Record<string, unknown>;
  const approvedOutlineVersion = typeof approvedOutlineRecord.version === "number"
    ? approvedOutlineRecord.version
    : typeof approvedOutlineRecord.version === "string"
      ? approvedOutlineRecord.version
      : null;
  const studioData = ((chapterOutlineRecord.studio ?? {}) as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const productionOutlineBeats = Array.isArray(studioData?.productionOutline && (studioData.productionOutline as Record<string, unknown>).beats)
    ? ((studioData!.productionOutline as Record<string, unknown>).beats as unknown[]).length
    : null;
  const productionPlanPages = Array.isArray(studioData?.productionPlan && (studioData.productionPlan as Record<string, unknown>).pages)
    ? ((studioData!.productionPlan as Record<string, unknown>).pages as unknown[]).length
    : null;
  const panelBlueprintCount = Array.isArray(studioData?.productionPlan && (studioData.productionPlan as Record<string, unknown>).panelBlueprints)
    ? ((studioData!.productionPlan as Record<string, unknown>).panelBlueprints as unknown[]).length
    : null;
  const premiumReadinessScore = typeof (studioData?.productionPlan as Record<string, unknown> | undefined)?.premiumReadinessScore === "number"
    ? (studioData!.productionPlan as Record<string, unknown>).premiumReadinessScore
    : null;

  // Build character-specific retry hints from panelCast + fingerprints
  const targetCharacterId = new URL(req.url).searchParams.get("targetCharacterId");

  function buildCharacterRetryHints(): { positive: string; negative: string } {
    const target = targetCharacterId
      ? projectChars.find((pc) => pc.id === targetCharacterId)
      : panelCastData?.focus
        ? projectChars.find((pc) => pc.id === panelCastData.focus!.characterId)
        : projectChars.find((pc) => characters.includes(pc.name));

    if (!target) {
      return {
        positive: "preserve character identity, same face, same hair, same outfit, strict continuity",
        negative: "wrong hair color, wrong outfit, inconsistent face, identity drift",
      };
    }

    const fp = target.characterFingerprint && typeof target.characterFingerprint === "object"
      ? target.characterFingerprint as Record<string, unknown>
      : null;
    const hairColor = typeof fp?.hairColor === "string" ? fp.hairColor : null;
    const eyeColor = typeof fp?.eyeColor === "string" ? fp.eyeColor : null;
    const gender = typeof fp?.gender === "string" ? fp.gender : null;
    const appearance = typeof fp?.appearance === "string" ? fp.appearance : null;

    const traits = [
      hairColor ? `hair (${hairColor})` : null,
      eyeColor ? `eyes (${eyeColor})` : null,
      appearance ? appearance.slice(0, 80) : null,
    ].filter(Boolean).join(", ");

    return {
      positive: `preserve ${target.name}'s face${traits ? `, ${traits}` : ""}; strict identity lock on ${target.name}${gender ? `, ${gender}` : ""}`,
      negative: `wrong face for ${target.name}, identity drift, generic anime face replacing ${target.name}${hairColor ? `, wrong hair color for ${target.name}` : ""}`,
    };
  }

  const characterHints = retryMode === "character" ? buildCharacterRetryHints() : null;

  const legacyPositiveAugment = retryMode === "environment"
    ? "readable environment, strong background, visible architecture, clear foreground midground background"
    : retryMode === "character"
      ? characterHints!.positive
      : retryMode === "interaction"
        ? "clear body language, readable interaction, characters connected to environment"
        : retryMode === "style"
          ? "consistent manga style, clean line art, coherent shading"
          : retryMode === "composition"
            ? "balanced manga composition, spatial clarity, dynamic framing"
            : "";
  const legacyNegativeAugment = retryMode === "environment"
    ? "empty background, studio backdrop, flat grey backdrop, blurry environment"
    : retryMode === "character"
      ? characterHints!.negative
      : retryMode === "interaction"
        ? "weak social interaction, disconnected characters"
        : retryMode === "style"
          ? "style drift, muddy rendering, off-model manga style"
          : retryMode === "composition"
            ? "floating character, poor framing, weak staging"
            : "";

  // Premium specialized hints override legacy hints when available
  const positiveAugment = retryReferenceDecision.positivePromptHint
    ? retryReferenceDecision.positivePromptHint
    : legacyPositiveAugment;
  const negativeAugment = retryReferenceDecision.negativePromptHint
    ? retryReferenceDecision.negativePromptHint
    : legacyNegativeAugment;

  const referencePolicy = effectiveReferencePolicy;
  const rerollKind =
    retryMode === "environment"
      ? "REROLL_ENVIRONMENT"
      : retryMode === "character"
        ? "REROLL_CHARACTER_FIDELITY"
        : retryMode === "interaction"
          ? "REROLL_INTERACTION"
          : retryMode === "style"
            ? "REROLL_STYLE"
            : retryMode === "composition"
              ? "REROLL_COMPOSITION"
              // Premium modes
              : retryMode === "prop"
                ? "REROLL_PROP"
                : retryMode === "speaker"
                  ? "REROLL_SPEAKER_ANCHOR"
                  : retryMode === "enemy_presence"
                    ? "REROLL_ENEMY_PRESENCE"
                    : retryMode === "subject_focus"
                      ? "REROLL_SUBJECT_FOCUS"
                      : retryMode === "cutaway"
                        ? "REROLL_CUTAWAY"
                        : retryMode === "npc_population"
                          ? "REROLL_NPC_POPULATION"
                          : undefined;

  console.info(
    `[retry] chapterId=${chapterId} approvedOutlineVersion=${approvedOutlineVersion ?? "n/a"} ` +
    `productionOutlineBeatCount=${productionOutlineBeats ?? "n/a"} productionPlanPageCount=${productionPlanPages ?? "n/a"} ` +
    `panelBlueprintCount=${panelBlueprintCount ?? "n/a"} premiumReadinessScore=${premiumReadinessScore ?? "n/a"} ` +
    `panel=${img.id} mode=${retryMode ?? "default"} rerollKind=${rerollKind ?? "n/a"} ` +
    `refPolicy=${effectiveReferencePolicy} (base=${retryReferenceDecision.referencePolicy}) ` +
    `importantCharacter=${retryReferenceDecision.importantCharacterPresent} reason=${retryReferenceDecision.reason} ` +
    `refs=${referenceImageUrls.length}/${retryStableReferences.length} loras=${panelLoras.length} ` +
    `driftAction=${preDriftResult?.recommendedAction ?? "n/a"} driftScore=${preDriftResult?.score ?? "n/a"} ` +
    `positivePromptHint=${retryReferenceDecision.positivePromptHint ? "yes" : "no"} ` +
    `negativePromptHint=${retryReferenceDecision.negativePromptHint ? "yes" : "no"}`
  );

  await prisma.sceneImage.update({
    where: { id: img.id },
    data: {
      status: "pending",
      metadata: ({ ...metadata, retryRequestedAt: new Date().toISOString() } as unknown) as Prisma.InputJsonValue,
    },
  });

  try {
    const out = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        adultEngine,
        isNewCharacter: false,
        hasCanonReferences: hasCanonRef,
        characterCountInScene: characters.length > 0 ? characters.length : 1,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature: false,
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: [img.prompt, positiveAugment].filter(Boolean).join(", "),
        negativePrompt: [img.negativePrompt ?? undefined, negativeAugment].filter(Boolean).join(", "),
        width: premiumSize.width,
        height: premiumSize.height,
        loras: referencePolicy === "NONE" ? undefined : (panelLoras.length > 0 ? panelLoras : undefined),
        referenceImageUrls: referencePolicy === "NONE" ? undefined : (referenceImageUrls.length > 0 ? referenceImageUrls : undefined),
        providerParams: {
          contentIntensityLayer: intensityLayer,
          mode: "PANEL_DRAFT",
          referencePolicy,
          scenePass: "reroll",
          rerollKind,
          retryReferenceDecision,
        },
      },
    );

    if (!out.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "blocked",
          metadata: ({
            ...metadata,
            blockedReason: out.reason,
            generationLog: out.log,
            retryReferenceDecision: {
              ...retryReferenceDecision,
              availableReferenceUrls: referenceImageUrls.length,
              availableLoras: panelLoras.length,
            },
            retryReferenceTrace: retryReferenceResolution.trace,
          } as unknown) as Prisma.InputJsonValue,
        },
      });
      return validationError(out.reason);
    }

    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: out.result.imageUrl,
      objectPath: `projects/${project.id}/chapters/${img.scene.chapter.id}/panels/${img.id}-retry-${Date.now()}`,
    });

    if (!persisted.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "failed",
          metadata: ({
            ...metadata,
            error: persisted.error,
            generationLog: out.log,
            retryReferenceDecision: {
              ...retryReferenceDecision,
              availableReferenceUrls: referenceImageUrls.length,
              availableLoras: panelLoras.length,
            },
            retryReferenceTrace: retryReferenceResolution.trace,
          } as unknown) as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({ ok: false, error: persisted.error }, { status: 502 });
    }

    // ── Validation post-génération avec CharacterFingerprint (Bloc 2) ─────────
    const charactersWithFingerprints = characters
      .map((charName) => {
        const char = projectChars.find((pc) => pc.name === charName);
        if (!char) return null;

        const fingerprintRaw = char.characterFingerprint;
        if (!fingerprintRaw || typeof fingerprintRaw !== "object" || Object.keys(fingerprintRaw).length === 0) {
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
      panelId: img.id,
      imageUrl: persisted.url,
      requiredCharacters: charactersWithFingerprints,
      metadata: {
        prompt: img.prompt,
        negativePrompt: img.negativePrompt ?? undefined,
        model: out.result.model,
        sceneBlueprint: metadata.sceneBlueprint as never,
        panelContract: metadata.panelContract as never,
        stylePack: metadata.stylePack as never,
        panelQa: {
          heroCharacterId: typeof metadata.heroCharacterId === "string" ? metadata.heroCharacterId : null,
          pageNumber: typeof metadata.pageNumber === "number" ? metadata.pageNumber : null,
          panelNumber: typeof metadata.panelNumber === "number" ? metadata.panelNumber : img.panelNumber,
          pagePanelCount: typeof metadata.pagePanelCount === "number" ? metadata.pagePanelCount : null,
          panelCategory: typeof metadata.panelCategory === "string" ? metadata.panelCategory : null,
          visualPriority: typeof metadata.visualPriority === "string" ? metadata.visualPriority : null,
          characterRoles: Array.isArray(metadata.panelCharacterRoles)
            ? (metadata.panelCharacterRoles as Array<string | null>)
            : [],
          characterIds: Array.isArray(metadata.characterIds) ? (metadata.characterIds as string[]) : [],
          explicitCriticality:
            metadata.panelCriticality && typeof metadata.panelCriticality === "object"
              ? (metadata.panelCriticality as { level: "NON_CRITICAL" | "CRITICAL"; reasons: string[] })
              : null,
        },
      },
    });
    const validationScore = validation.score;

    if (validation.requiredReroll) {
      console.warn(
        `[retry] Validation failed for panel ${img.id}: score=${validation.score.toFixed(2)}, issues=${validation.issues.length}. Manual review required.`
      );
      // On évite une boucle infinie sur retry manuel, mais on expose désormais
      // les sous-scores pour diagnostiquer décor / interaction / style.
    }

    const shouldBlockForReview = validation.requiredReroll || (validation.qaWasRequired && !validation.qaWasExecuted);

    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: shouldBlockForReview ? "blocked" : "completed",
        imageUrl: persisted.url,
        provider: out.result.provider,
        model: out.result.model,
        consistencyScore: validation.qualityScores?.releaseScore ?? validationScore,
        routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
        metadata: ({
          ...metadata,
          previousImageUrl:
            typeof img.imageUrl === "string" && img.imageUrl.length > 0
              ? img.imageUrl
              : typeof metadata.previousImageUrl === "string"
                ? metadata.previousImageUrl
                : null,
          rerollHistory: [
            ...((Array.isArray(metadata.rerollHistory) ? metadata.rerollHistory : []) as unknown[]),
            {
              at: new Date().toISOString(),
              previousImageUrl: typeof img.imageUrl === "string" ? img.imageUrl : null,
              nextImageUrl: persisted.url,
              mode: retryMode,
            },
          ].slice(-5),
          generationLog: out.log,
          persisted: persisted.persisted,
          retryUsedLoras: panelLoras.length,
          retryUsedRefs: referenceImageUrls.length,
          rerollKind,
          positivePromptHint: retryReferenceDecision.positivePromptHint ?? null,
          negativePromptHint: retryReferenceDecision.negativePromptHint ?? null,
          retryReferenceDecision: {
            ...retryReferenceDecision,
            availableReferenceUrls: referenceImageUrls.length,
            availableLoras: panelLoras.length,
            appliedReferencePolicy: referencePolicy,
            driftOverrideApplied: effectiveReferencePolicy !== retryReferenceDecision.referencePolicy,
          },
          retryReferenceTrace: retryReferenceResolution.trace,
          preDriftAnalysis: preDriftResult
            ? {
                score: preDriftResult.score,
                severity: preDriftResult.severity,
                recommendedAction: preDriftResult.recommendedAction,
                continuityRisk: preDriftResult.continuityRisk,
                reasons: preDriftResult.reasons.slice(0, 4),
                // Phase 8 : sous-scores drift 2.0
                styleDriftScore: preDriftResult.styleDriftScore,
                characterDriftScore: preDriftResult.characterDriftScore,
                beatAlignmentScore: preDriftResult.beatAlignmentScore,
                sceneContinuityScore: preDriftResult.sceneContinuityScore,
                chapterLookMismatch: preDriftResult.chapterLookMismatch,
              }
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: "failed",
        metadata: ({
          ...metadata,
          error: msg,
          retryReferenceDecision: {
            ...retryReferenceDecision,
            availableReferenceUrls: referenceImageUrls.length,
            availableLoras: panelLoras.length,
          },
          retryReferenceTrace: retryReferenceResolution.trace,
        } as unknown) as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
