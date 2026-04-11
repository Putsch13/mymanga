import { NextResponse } from "next/server";
import type { Prisma } from "@manga-ai-studio/db";
import { prisma } from "@manga-ai-studio/db";
import {
  runRoutedImageGeneration,
  resolveAdultEngine,
  validateGeneratedPanel,
  resolvePremiumImageSize,
} from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { notFound, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { resolveRetryReferencePolicy } from "@/lib/images/retry-reference-policy";
import { collectRetryStableReferences } from "@/lib/images/retry-stable-references";
import { resolveStableImageReferences } from "@manga-ai-studio/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };
type RetryMode = "environment" | "character" | "interaction" | "style" | "composition";

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
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
  const panelLoras = characters
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
  const retryReferenceDecision = resolveRetryReferencePolicy({
    retryMode,
    metadata,
    hasReusableCharacterLock: hasCanonRef,
  });
  console.info(
    `[retry] policy panel=${img.id} mode=${retryMode ?? "default"} refPolicy=${retryReferenceDecision.referencePolicy} importantCharacter=${retryReferenceDecision.importantCharacterPresent} reason=${retryReferenceDecision.reason} refs=${referenceImageUrls.length}/${retryStableReferences.length} loras=${panelLoras.length}`
  );
  const positiveAugment = retryMode === "environment"
    ? "readable environment, strong background, visible architecture, clear foreground midground background"
    : retryMode === "character"
      ? "same hero face, same hair, same outfit, preserve continuity"
      : retryMode === "interaction"
        ? "clear body language, readable interaction, characters connected to environment"
        : retryMode === "style"
          ? "consistent manga style, clean line art, coherent shading"
          : retryMode === "composition"
            ? "balanced manga composition, spatial clarity, dynamic framing"
            : "";
  const negativeAugment = retryMode === "environment"
    ? "empty background, studio backdrop, flat grey backdrop, blurry environment"
    : retryMode === "character"
      ? "wrong hair color, wrong outfit, inconsistent face"
      : retryMode === "interaction"
        ? "weak social interaction, disconnected characters"
        : retryMode === "style"
          ? "style drift, muddy rendering, off-model manga style"
          : retryMode === "composition"
            ? "floating character, poor framing, weak staging"
            : "";
  const referencePolicy = retryReferenceDecision.referencePolicy;
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
              : undefined;

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
          retryReferenceDecision: {
            ...retryReferenceDecision,
            availableReferenceUrls: referenceImageUrls.length,
            availableLoras: panelLoras.length,
            appliedReferencePolicy: referencePolicy,
          },
          retryReferenceTrace: retryReferenceResolution.trace,
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
