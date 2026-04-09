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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sceneImageId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
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

  // Reconstruire les refs : savedReferenceIds du panel original, puis ref canon perso
  // Vérifier l'accessibilité de chaque URL avant de la passer à FAL (évite 422 "Failed to download")
  const rawRefUrls = savedReferenceIds.filter((url) => typeof url === "string" && url.startsWith("http"));
  if (rawRefUrls.length === 0 && typeof metadata.canonRefUsed === "string") {
    rawRefUrls.push(metadata.canonRefUsed as string);
  }
  const referenceImageUrls: string[] = [];
  for (const url of rawRefUrls) {
    const ok = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) referenceImageUrls.push(url);
  }

  const hasCanonRef = referenceImageUrls.length > 0 || panelLoras.length > 0;

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
        positivePrompt: img.prompt,
        negativePrompt: img.negativePrompt ?? undefined,
        width: premiumSize.width,
        height: premiumSize.height,
        loras: panelLoras.length > 0 ? panelLoras : undefined,
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
        providerParams: { contentIntensityLayer: intensityLayer, mode: "PANEL_DRAFT" },
      },
    );

    if (!out.ok) {
      await prisma.sceneImage.update({
        where: { id: img.id },
        data: {
          status: "blocked",
          metadata: ({ ...metadata, blockedReason: out.reason, generationLog: out.log } as unknown) as Prisma.InputJsonValue,
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
          metadata: ({ ...metadata, error: persisted.error, generationLog: out.log } as unknown) as Prisma.InputJsonValue,
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

    await prisma.sceneImage.update({
      where: { id: img.id },
      data: {
        status: "completed",
        imageUrl: persisted.url,
        provider: out.result.provider,
        model: out.result.model,
        consistencyScore: validation.qualityScores?.releaseScore ?? validationScore,
        routingDecision: (out.routing as unknown) as Prisma.InputJsonValue,
        metadata: ({
          ...metadata,
          generationLog: out.log,
          persisted: persisted.persisted,
          retryUsedLoras: panelLoras.length,
          retryUsedRefs: referenceImageUrls.length,
          validationScore,
          validationDetails: {
            qualityScores: validation.qualityScores,
            propertyChecks: validation.propertyChecks,
            issues: validation.issues,
            requiredReroll: validation.requiredReroll,
          },
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    await prisma.sceneImage.update({
      where: { id: img.id },
      data: { status: "failed", metadata: ({ ...metadata, error: msg } as unknown) as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
