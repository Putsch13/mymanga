import { NextResponse } from "next/server";
import {
  runRoutedImageGeneration,
  composeCharacterVisualPrompt,
  resolveAdultEngine,
  extractCharacterFingerprintFromRefs,
  buildCharacterPromptBundle,
  buildCharacterVisualLock,
  getPremiumImageSize,
} from "@manga-ai-studio/ai";
import {
  estimateImageTokensFromRules,
  refundReservation,
  reserveTokens,
  settleReservedTokens,
} from "@manga-ai-studio/billing";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, canBypassMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { assertStableImageUrl } from "@/lib/images/assert-stable-image-url";
import { logCanonAudit } from "@/lib/canon/canon-audit-log";
import { resolveCharacterVisualCanon, type CharacterCanonInput } from "@/lib/canon/resolve-character-visual-canon";
import {
  serializeBodyStateForPrompt,
  serializeWardrobeProfileForPrompt,
} from "@/lib/retry/build-character-retry-hints";
import { notFound, paymentRequired, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { sendCharacterLoraTrainingRequested } from "@manga-ai-studio/workflow";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = await checkRateLimit(user.id, "generate_visual");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return NextResponse.json(
      { error: "La stack image n'est pas prete pour generer un visuel personnage.", details: stack },
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
  if (projectRequiresAgeGate(projectForGate.contentRating, projectForGate.intensityLayer) && !canAccessMatureContent(projectForGate.user, projectForGate.user.preferences)) {
    return NextResponse.json({ error: getAgeGateMessage(projectForGate.contentRating) }, { status: 403 });
  }
  if (canBypassMatureContent(projectForGate.user.email)) {
    console.warn(`[adult-bypass] ${projectForGate.user.email} bypassed mature gate on /api/characters/${characterId}/generate-visual (NODE_ENV=${process.env.NODE_ENV})`);
  }

  const intensityLayer = (character.project.intensityLayer as string | null) ?? "TEEN";
  const mode = "CHARACTER_SHEET" as const;
  const characterSheetSize = getPremiumImageSize(mode);

  const estimatedTokens = await estimateImageTokensFromRules(mode as never, "fal");
  const reservation = await reserveTokens(prisma, user.id, estimatedTokens, {
    reason: "character_visual_reservation",
    referenceType: "character_visual",
    referenceId: character.id,
  });

  if (!reservation.ok) {
    return paymentRequired("Tokens insuffisants pour générer un visuel personnage.", {
      needed: estimatedTokens,
    });
  }

  try {
    // Récupérer les settings du projet séparément
    const projectSettings = await prisma.projectSettings.findUnique({
      where: { projectId: character.project.id },
      select: { sensualityLevel: true },
    });

    // P1.4 : on remplace les String(...) naïfs par des sérialiseurs dédiés
    // (aucun risque de `[object Object]` dans le prompt si un champ est un
    // array ou un objet imbriqué). Les records bruts restent exposés pour
    // les autres consommateurs (promptBundle / metadata) qui attendent un
    // Record<string, unknown>.
    const raw = character as unknown as Record<string, unknown>;
    const bodyState = raw.bodyState && typeof raw.bodyState === "object"
      ? raw.bodyState as Record<string, unknown>
      : {};
    const wardrobeProfile = raw.wardrobeProfile && typeof raw.wardrobeProfile === "object"
      ? raw.wardrobeProfile as Record<string, unknown>
      : {};
    const bodyStateLine = serializeBodyStateForPrompt(bodyState);
    const wardrobeLine = serializeWardrobeProfileForPrompt(wardrobeProfile);

    const fullAppearance = [
      typeof raw.appearance === "string" ? raw.appearance : null,
      bodyStateLine,
    ].filter(Boolean).join(", ") || null;

    const fullOutfit = [
      typeof character.outfitDefault === "string" ? character.outfitDefault : null,
      wardrobeLine,
    ].filter(Boolean).join(", ") || null;

    const composed = composeCharacterVisualPrompt({
      name: character.name,
      gender:
        typeof raw.gender === "string"
          ? (raw.gender.trim().toLowerCase() === "male" ? "male" : raw.gender.trim().toLowerCase() === "female" ? "female" : null)
          : null,
      appearance: fullAppearance,
      hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
      eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
      outfitDefault: fullOutfit,
      traits: Array.isArray(character.traits) ? (character.traits as string[]) : null,
      roleType: character.roleType,
      emotionalState: character.emotionalState,
      projectVisualStyle: character.project.visualStyle,
      sensualityLevel: projectSettings?.sensualityLevel ?? 0,
      contentIntensityLayer: intensityLayer,
    });
    const promptBundle = buildCharacterPromptBundle({
      name: character.name,
      roleType: character.roleType,
      biography: character.biography,
      objective: character.objective,
      fear: character.fear,
      appearance: fullAppearance,
      hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
      eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
      outfitDefault: fullOutfit,
      visualProfile: raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {},
      bodyState,
      wardrobeProfile,
      speechProfile: raw.speechProfile && typeof raw.speechProfile === "object" ? raw.speechProfile as Record<string, unknown> : {},
      continuityProfile: raw.continuityProfile && typeof raw.continuityProfile === "object" ? raw.continuityProfile as Record<string, unknown> : {},
      traits: Array.isArray(character.traits) ? (character.traits as string[]) : [],
      flaws: Array.isArray(character.flaws) ? (character.flaws as string[]) : [],
    });
    const lockedPositive = [
      composed.positive,
      promptBundle.visualPrompt,
      promptBundle.continuityPrompt,
      promptBundle.canonConstraintLine,
      "STRICT: preserve exact character identity, face, hair, body markers, outfit and all permanent traits.",
    ].filter(Boolean).join(", ");
    const lockedNegative = [composed.negative, ...promptBundle.forbiddenDriftRules].filter(Boolean).join(", ");

    const adultEngine = resolveAdultEngine({
      primaryGenre: character.project.primaryGenre,
      subGenres: Array.isArray(character.project.subGenres) ? character.project.subGenres as string[] : [],
      visualStyle: character.project.visualStyle,
      userIntent: fullAppearance ?? character.name,
    });

    // P0.1 + P0.2 : on délègue à `resolveCharacterVisualCanon` la résolution de la
    // vérité perso. Les refs prioritaires sont (dans cet ordre) :
    //   1. activeVisualLock.canonicalRefUrls
    //   2. canonicalImageUrl direct
    //   3. character.visualRefs stables
    // Toutes les URLs retournées sont garanties stables (isStableImageUrl).
    const resolvedCanon = resolveCharacterVisualCanon(character as unknown as CharacterCanonInput);
    const stableRefUrls = Array.from(
      new Set(resolvedCanon.canonicalRefs.map((ref) => ref.url)),
    ).slice(0, 4);
    const signedRefs = await Promise.all(
      stableRefUrls.map(async (u) => (await signSupabaseUrlIfNeeded(u)) ?? u),
    );
    const referenceImageUrls = signedRefs.filter((url): url is string => Boolean(url));
    console.info(
      `[generate-visual] canon_resolved characterId=${character.id} ` +
      `source=${resolvedCanon.source} lockStrength=${resolvedCanon.lockStrength} ` +
      `canonicalRefs=${stableRefUrls.length} hardTraits=${resolvedCanon.hardTraits.length} ` +
      `permanentMarkers=${resolvedCanon.bodyMarkers.permanent.length}`,
    );
    const activeLoras = character.loraAttachments
      .map((attachment) => {
        const weightsMeta = attachment.lora.weightsMeta as Record<string, unknown>;
        const loraUrl = typeof weightsMeta.loraUrl === "string" ? weightsMeta.loraUrl : null;
        const triggerWord = typeof weightsMeta.triggerWord === "string" ? weightsMeta.triggerWord : attachment.lora.externalId;
        return loraUrl
          ? {
              url: loraUrl,
              triggerWord,
              scale: attachment.weight,
            }
          : null;
      })
      .filter((item): item is { url: string; triggerWord: string; scale: number } => Boolean(item))
      .slice(0, 2);
    const existingFingerprint =
      raw.characterFingerprint && typeof raw.characterFingerprint === "object"
        ? (raw.characterFingerprint as Record<string, unknown>)
        : {};
    const lockExpected =
      character.visualRefs.length > 0
      || character.visualLocks.length > 0
      || activeLoras.length > 0
      || character.canonLocked
      || Object.keys(existingFingerprint).length > 0;
    if (lockExpected && referenceImageUrls.length === 0 && activeLoras.length === 0) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_lock_missing_refs",
      );
      return NextResponse.json(
        { error: "Character lock requis mais aucune ref canonique ni LoRA active n'est disponible." },
        { status: 422 },
      );
    }

    const output = await runRoutedImageGeneration(
      {
        mode: "CHARACTER_SHEET",
        contentIntensityLayer: intensityLayer,
        adultEngine,
        isNewCharacter: true,
        hasCanonReferences: referenceImageUrls.length > 0 || activeLoras.length > 0,
        characterCountInScene: 1,
        continuityWeight: lockExpected ? 90 : 30,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature:
          intensityLayer === "MATURE_VISUAL" || intensityLayer === "ADULT_EXPLICIT",
      },
      {
        mode: "CHARACTER_SHEET",
        positivePrompt: lockedPositive,
        negativePrompt: lockedNegative,
        width: characterSheetSize.width,
        height: characterSheetSize.height,
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        loras: activeLoras.length > 0 ? activeLoras : undefined,
        providerParams: {
          contentIntensityLayer: intensityLayer,
          mode: "CHARACTER_SHEET",
          referencePolicy: lockExpected ? "STRONG" : "LIGHT",
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

    // P0.1 : double garde (même si `allowTemporary:false`) — si pour une raison
    // quelconque l'image n'est pas réellement persistée sur un support stable,
    // on refund et on refuse d'écrire quoi que ce soit en DB canonique.
    if (persisted.persisted !== true) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_not_persisted",
      );
      return NextResponse.json(
        { error: "character_visual_not_persisted", detail: "persisted=false (temporary or skip)" },
        { status: 422 },
      );
    }

    // P0.3 : guard explicite — l'URL publique retournée doit être stable.
    assertStableImageUrl(persisted.url, "generate-visual:persisted.url");

    const visualRef = await prisma.$transaction(async (tx) => {
      const previousLock = character.visualLocks[0] ?? null;
      if (previousLock) {
        await tx.characterVisualLock.updateMany({
          where: { characterId: character.id, isActive: true },
          data: { isActive: false },
        });
      }
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          projectId: character.project.id,
          characterId: character.id,
          type: "character_ref",
          origin: "generated",
          ownerType: "character_visual",
          ownerId: character.id,
          storageProvider: "supabase",
          publicUrl: persisted.url,
          // P0.2 : chemin réellement uploadé (avec extension dérivée du content-type).
          storageKey: persisted.storageKey,
          metadata: {
            provider: output.result.provider,
            model: output.result.model,
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            seed: output.result.seed ?? null,
          },
        },
      });
      const nextVersion = (previousLock?.version ?? 0) + 1;
      const activeLora = activeLoras[0] ?? null;
      const nextLock = buildCharacterVisualLock({
        characterId: character.id,
        displayName: character.name,
        roleType: character.roleType,
        hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
        eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
        appearance: fullAppearance,
        outfitDefault: fullOutfit,
        bodyState,
        visualProfile: raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {},
        wardrobeProfile,
        triggerWord: activeLora?.triggerWord ?? null,
        loraUrl: activeLora?.url ?? null,
        // P0.3 : canonicalRefUrls = uniquement URLs stables (non signées,
        // non provider-temporaire). On reprend les refs DB brutes, PAS les
        // versions signées utilisées pour appeler le provider.
        canonicalRefUrls: [persisted.url, ...stableRefUrls].slice(0, 4),
        currentState: {
          emotionalState: character.emotionalState,
          status: character.status,
        },
        version: nextVersion,
      });
      const storedLock = await tx.characterVisualLock.create({
        data: {
          projectId: character.project.id,
          characterId: character.id,
          version: nextVersion,
          isActive: true,
          displayName: nextLock.displayName,
          shortVisualCore: nextLock.shortVisualCore,
          triggerWord: nextLock.triggerWord ?? null,
          canonicalRefUrls: nextLock.canonicalRefUrls,
          defaultOutfit: nextLock.defaultOutfit ?? null,
          altOutfits: nextLock.altOutfits as Prisma.InputJsonValue,
          currentState: nextLock.currentState as Prisma.InputJsonValue,
          injuryState: (nextLock.injuryState ?? {}) as Prisma.InputJsonValue,
          ageVariant: nextLock.ageVariant ?? null,
          faceCloseupAssetId: mediaAsset.id,
          actionRefAssetId: mediaAsset.id,
          metadata: {
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            source: "generate-visual",
          },
        },
      });
      const createdRef = await tx.characterVisualRef.create({
        data: {
          characterId: character.id,
          mediaAssetId: mediaAsset.id,
          sourceVisualLockId: storedLock.id,
          type: "generated_primary",
          imageUrl: persisted.url,
          promptSnapshot: lockedPositive,
          isPrimary: character.visualRefs.length === 0,
          metadata: {
            provider: output.result.provider,
            model: output.result.model,
            negativePrompt: lockedNegative,
            requestId: output.result.requestId ?? null,
            jobId: output.result.jobId ?? null,
            // P0.3 : on ne stocke PAS referenceImageUrls (signées) dans
            // metadata canonique. On garde uniquement les URLs stables sources.
            referenceImageUrls: stableRefUrls,
            loras: activeLoras,
            persisted: true,
          },
        },
      });
      return { createdRef, storedLock, nextVersion };
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

    await settleReservedTokens(prisma, user.id, reservation.reservationId, estimatedTokens);

    // ── Extraire et persister CharacterFingerprint (Bloc 2) ──────────────────
    try {
      const allVisualRefs = await prisma.characterVisualRef.findMany({
        where: { characterId: character.id },
        select: { imageUrl: true, type: true, isPrimary: true },
        orderBy: { isPrimary: "desc" },
      });

      const fingerprint = await extractCharacterFingerprintFromRefs({
        characterId: character.id,
        characterName: character.name,
        gender: character.gender === "male" ? "male" : character.gender === "female" ? "female" : "other",
        visualRefs: allVisualRefs.map((ref) => ({
          url: ref.imageUrl,
          type: ref.type,
          isPrimary: ref.isPrimary,
        })),
        visualProfile: raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {},
        bodyState: bodyState,
        wardrobeProfile: wardrobeProfile,
        appearance: character.appearance,
        hairColor: character.hairColor,
        eyeColor: character.eyeColor,
      });

      await prisma.character.update({
        where: { id: character.id },
        data: { characterFingerprint: fingerprint as never },
      });

      console.log(`[generate-visual] CharacterFingerprint extracted and persisted for ${character.name}`);
    } catch (fpError) {
      console.error(`[generate-visual] Failed to extract fingerprint:`, fpError instanceof Error ? fpError.message : fpError);
    }

    // E1 : Trigger LoRA auto-training pour les personnages clés (HERO ou SECONDARY_CORE)
    const isKeyCharacter = character.roleType === "HERO" || character.roleType === "SECONDARY_CORE";
    if (isKeyCharacter) {
      try {
        await prisma.character.update({
          where: { id: character.id },
          data: { loraStatus: "training" },
        });
        const loraSent = await sendCharacterLoraTrainingRequested({
          characterId: character.id,
          projectId: character.project.id,
          imageUrl: visualRef.createdRef.imageUrl,
        });
        if (loraSent.ok) {
          console.log(`[generate-visual] LoRA training triggered for ${character.name} (${character.roleType})`);
        } else {
          console.warn(`[generate-visual] LoRA training skipped: ${loraSent.skipped}`);
          await prisma.character.update({
            where: { id: character.id },
            data: { loraStatus: "none" },
          });
        }
      } catch (loraErr) {
        console.error(`[generate-visual] LoRA trigger failed (non-blocking): ${loraErr instanceof Error ? loraErr.message : loraErr}`);
        await prisma.character.update({ where: { id: character.id }, data: { loraStatus: "none" } }).catch(() => null);
      }
    }

    // Signer puis proxifier l'URL pour affichage immédiat (évite CORS/ITP Safari)
    const signedImageUrl = await signSupabaseUrlIfNeeded(visualRef.createdRef.imageUrl);
    const urlForClient = signedImageUrl ?? visualRef.createdRef.imageUrl;
    const proxiedUrl = urlForClient && !urlForClient.startsWith("/api/images/proxy")
      ? (() => {
          try {
            const parsed = new URL(urlForClient);
            const isExternal = ["supabase.co", "v3b.fal.media", "fal.media", "cdn.fal.ai"].some(
              (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
            );
            return isExternal ? `/api/images/proxy?url=${encodeURIComponent(urlForClient)}` : urlForClient;
          } catch { return urlForClient; }
        })()
      : urlForClient;
    const visualRefForClient = { ...visualRef.createdRef, imageUrl: proxiedUrl };

    return NextResponse.json({ ok: true, visualRef: visualRefForClient });
  } catch (error) {
    await refundReservation(
      prisma,
      user.id,
      reservation.reservationId,
      "character_visual_failed",
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "character_visual_failed" },
      { status: 500 },
    );
  }
}
