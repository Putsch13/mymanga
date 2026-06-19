import { NextResponse } from "next/server";
import {
  getPremiumImageSize,
  resolveAdultEngine,
  runRoutedImageGeneration,
} from "@manga-ai-studio/ai";
import {
  estimateImageTokensFromRules,
  refundReservation,
  reserveTokens,
  settleReservedTokens,
} from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";

import { getAppUser } from "@/lib/auth/get-app-user";
import {
  canAccessMatureContent,
  canBypassMatureContent,
  getAgeGateMessage,
  projectRequiresAgeGate,
} from "@/lib/age-gate";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { assertStableImageUrl } from "@/lib/images/assert-stable-image-url";
import { assertStableCanonicalAsset } from "@/lib/images/assert-stable-canonical-asset";
import { logCanonAudit } from "@/lib/canon/canon-audit-log";
import {
  isCharacterLockExpected,
  resolveCharacterReferencePolicy,
  shouldRefuseCharacterVisualForMissingRefs,
} from "@/lib/characters/generate-visual-guards";
import { notFound, paymentRequired, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";

import { buildCharacterPromptPayload } from "./_helpers/build-character-prompt-payload";
import { buildVisualRefForClient } from "./_helpers/build-visual-ref-response";
import { extractAndPersistFingerprint } from "./_helpers/extract-fingerprint-step";
import { generateFaceCloseupStep } from "./_helpers/generate-face-closeup-step";
import { persistCharacterVisualLock } from "./_helpers/persist-character-visual-lock";
import { resolveCharacterCanonRefs } from "./_helpers/resolve-character-canon-refs";
import { triggerLoraTrainingIfKeyCharacter } from "./_helpers/trigger-lora-training-step";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = await checkRateLimit(user.id, "generate_visual");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSecs) },
      },
    );
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return NextResponse.json(
      {
        error:
          "La stack image n'est pas prete pour generer un visuel personnage.",
        details: stack,
      },
      { status: 422 },
    );
  }

  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();
  const projectForGate = await prisma.project.findFirst({
    where: { id: character.project.id, userId: user.id },
    include: { user: { include: { preferences: true } } },
  });
  if (!projectForGate) return notFound();
  if (
    projectRequiresAgeGate(
      projectForGate.contentRating,
      projectForGate.intensityLayer,
    )
    && !canAccessMatureContent(
      projectForGate.user,
      projectForGate.user.preferences,
    )
  ) {
    return NextResponse.json(
      { error: getAgeGateMessage(projectForGate.contentRating) },
      { status: 403 },
    );
  }
  if (canBypassMatureContent(projectForGate.user.email)) {
    console.warn(
      `[adult-bypass] ${projectForGate.user.email} bypassed mature gate on /api/characters/${characterId}/generate-visual (NODE_ENV=${process.env.NODE_ENV})`,
    );
  }

  const intensityLayer =
    (character.project.intensityLayer as string | null) ?? "TEEN";
  const mode = "CHARACTER_SHEET" as const;
  const characterSheetSize = getPremiumImageSize(mode);

  const estimatedTokens = await estimateImageTokensFromRules(
    mode as never,
    "fal",
  );
  const reservation = await reserveTokens(prisma, user.id, estimatedTokens, {
    reason: "character_visual_reservation",
    referenceType: "character_visual",
    referenceId: character.id,
  });

  if (!reservation.ok) {
    return paymentRequired(
      "Tokens insuffisants pour générer un visuel personnage.",
      { needed: estimatedTokens },
    );
  }

  try {
    const projectSettings = await prisma.projectSettings.findUnique({
      where: { projectId: character.project.id },
      select: { sensualityLevel: true },
    });

    const promptPayload = buildCharacterPromptPayload(character, {
      intensityLayer,
      sensualityLevel: projectSettings?.sensualityLevel ?? 0,
    });

    const adultEngine = resolveAdultEngine({
      primaryGenre: character.project.primaryGenre,
      subGenres: Array.isArray(character.project.subGenres)
        ? (character.project.subGenres as string[])
        : [],
      visualStyle: character.project.visualStyle,
      userIntent: promptPayload.fullAppearance ?? character.name,
    });

    // P0.1 + P0.2 : refs canon résolues (visual lock > canonicalImageUrl > visualRefs).
    // Toutes les URLs retournées sont garanties stables (isStableImageUrl).
    const { stableRefUrls, referenceImageUrls, activeLoras } =
      await resolveCharacterCanonRefs(character);

    const rawCharacter = character as unknown as Record<string, unknown>;
    const existingFingerprint =
      rawCharacter.characterFingerprint
      && typeof rawCharacter.characterFingerprint === "object"
        ? (rawCharacter.characterFingerprint as Record<string, unknown>)
        : {};

    // P2.1 : guard central testable.
    const lockState = {
      visualRefsCount: character.visualRefs.length,
      visualLocksCount: character.visualLocks.length,
      activeLoraCount: activeLoras.length,
      canonLocked: Boolean(character.canonLocked),
      hasFingerprint: Object.keys(existingFingerprint).length > 0,
    };
    const lockExpected = isCharacterLockExpected(lockState);
    if (
      shouldRefuseCharacterVisualForMissingRefs({
        state: lockState,
        stableRefUrlCount: referenceImageUrls.length,
        activeLoraCount: activeLoras.length,
      })
    ) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_lock_missing_refs",
      );
      return NextResponse.json(
        {
          error:
            "Character lock requis mais aucune ref canonique ni LoRA active n'est disponible.",
        },
        { status: 422 },
      );
    }

    const output = await runRoutedImageGeneration(
      {
        mode: "CHARACTER_SHEET",
        contentIntensityLayer: intensityLayer,
        adultEngine,
        isNewCharacter: true,
        hasCanonReferences:
          referenceImageUrls.length > 0 || activeLoras.length > 0,
        characterCountInScene: 1,
        continuityWeight: lockExpected ? 90 : 30,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature:
          intensityLayer === "MATURE_VISUAL"
          || intensityLayer === "ADULT_EXPLICIT",
      },
      {
        mode: "CHARACTER_SHEET",
        positivePrompt: promptPayload.lockedPositive,
        negativePrompt: promptPayload.lockedNegative,
        width: characterSheetSize.width,
        height: characterSheetSize.height,
        referenceImageUrls:
          referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        loras: activeLoras.length > 0 ? activeLoras : undefined,
        providerParams: {
          contentIntensityLayer: intensityLayer,
          mode: "CHARACTER_SHEET",
          referencePolicy: resolveCharacterReferencePolicy(lockState),
          panelCategory: "CHARACTER_LOCK",
          triggerWords: activeLoras.map((item) => item.triggerWord),
        },
      },
    );

    if (!output.ok) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_blocked",
      );
      return NextResponse.json({ error: output.reason }, { status: 422 });
    }

    // P0.2 : un seul Date.now() pour tout le chemin d'objet, partagé avec storageKey.
    const objectBasePath = `projects/${character.project.id}/characters/${character.id}/refs/${Date.now()}`;

    // P0.1 : allowTemporary=false → Supabase OK ou rien.
    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: output.result.imageUrl,
      objectPath: objectBasePath,
      allowTemporary: false,
    });

    if (!persisted.ok) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_storage_failed",
      );
      return NextResponse.json(
        { error: "character_visual_not_persisted", detail: persisted.error },
        { status: 422 },
      );
    }

    // P0.1 : double garde — si pour une raison quelconque l'image n'est pas
    // réellement persistée sur un support stable, on refund et on refuse
    // d'écrire quoi que ce soit en DB canonique.
    if (persisted.persisted !== true) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_not_persisted",
      );
      return NextResponse.json(
        {
          error: "character_visual_not_persisted",
          detail: "persisted=false (temporary or skip)",
        },
        { status: 422 },
      );
    }

    // P0.3 : durcit le contrat Supabase (pas de mediaAsset.supabase sans storageKey).
    assertStableImageUrl(persisted.url, "generate-visual:persisted.url");
    assertStableCanonicalAsset(
      {
        url: persisted.url,
        storageProvider: "supabase",
        storageKey: persisted.storageKey,
      },
      "generate-visual:mediaAsset",
    );

    const visualRef = await persistCharacterVisualLock({
      character,
      persisted,
      output,
      activeLoras,
      stableRefUrls,
      lockedPositive: promptPayload.lockedPositive,
      lockedNegative: promptPayload.lockedNegative,
      rawCharacter,
      fullAppearance: promptPayload.fullAppearance,
      fullOutfit: promptPayload.fullOutfit,
      bodyState: promptPayload.bodyState,
      wardrobeProfile: promptPayload.wardrobeProfile,
    });

    // P4.4 : audit trail — visual_lock_created + visual_ref_promoted si primary.
    logCanonAudit({
      kind: "visual_lock_created",
      characterId: character.id,
      visualLockId: visualRef.storedLock.id,
      userId: user.id,
      source: "generate-visual",
      version: visualRef.nextVersion,
    });
    if (visualRef.createdRef.isPrimary) {
      logCanonAudit({
        kind: "visual_ref_promoted",
        characterId: character.id,
        visualRefId: visualRef.createdRef.id,
        userId: user.id,
      });
    }

    await generateFaceCloseupStep({
      characterId: character.id,
      projectId: character.project.id,
      sourceVisualLockId: visualRef.storedLock.id,
      intensityLayer,
      adultEngine,
      positivePrompt: promptPayload.lockedPositive,
      negativePrompt: promptPayload.lockedNegative,
      width: characterSheetSize.width,
      height: characterSheetSize.height,
      referenceImageUrls: [persisted.url, ...stableRefUrls].slice(0, 4),
      activeLoras,
    });

    await settleReservedTokens(
      prisma,
      user.id,
      reservation.reservationId,
      estimatedTokens,
    );

    await extractAndPersistFingerprint({
      character,
      visualProfile:
        rawCharacter.visualProfile
        && typeof rawCharacter.visualProfile === "object"
          ? (rawCharacter.visualProfile as Record<string, unknown>)
          : {},
      bodyState: promptPayload.bodyState,
      wardrobeProfile: promptPayload.wardrobeProfile,
    });

    await triggerLoraTrainingIfKeyCharacter({
      character,
      imageUrl: visualRef.createdRef.imageUrl,
    });

    const visualRefForClient = await buildVisualRefForClient(
      visualRef.createdRef,
    );

    return NextResponse.json({ ok: true, visualRef: visualRefForClient });
  } catch (error) {
    await refundReservation(
      prisma,
      user.id,
      reservation.reservationId,
      "character_visual_failed",
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "character_visual_failed",
      },
      { status: 500 },
    );
  }
}
