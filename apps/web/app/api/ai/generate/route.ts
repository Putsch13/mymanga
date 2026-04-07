import { NextResponse } from "next/server";
import { z } from "zod";
import { RENDERING_MODES, type RenderingMode } from "@manga-ai-studio/core";
import { decideImageRoute, runRoutedImageGeneration, resolveAdultEngine } from "@manga-ai-studio/ai";
import { estimateImageTokensFromRules, refundReservation, reserveTokens, settleReservedTokens } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { canAccessMatureContent, getAgeGateMessage, projectRequiresAgeGate } from "@/lib/age-gate";
import { paymentRequired, unauthorized, validationError } from "@/lib/api-response";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/analytics";

const modeSchema = z.enum(RENDERING_MODES as unknown as [string, ...string[]]);

const bodySchema = z.object({
  mode: modeSchema,
  prompt: z.string().min(3),
  contentIntensityLayer: z.string().default("GENERAL_SAFE"),
  hasCanonReferences: z.boolean().optional(),
  isNewCharacter: z.boolean().optional(),
  needsInpaint: z.boolean().optional(),
  needsPoseVariation: z.boolean().optional(),
  preferPhotorealCover: z.boolean().optional(),
  goreStylizedMature: z.boolean().optional(),
  projectId: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const stack = getGenerationStackStatus();
  if (!stack.canGenerateImages) {
    return validationError("La generation d'image n'est pas disponible tant que la stack image n'est pas correctement configuree.", stack);
  }
  const limited = checkRateLimit(user.id, "generate_visual");
  if (!limited.ok) {
    return validationError("Trop de requêtes de génération. Réessaie dans quelques instants.", limited);
  }
  const body = bodySchema.parse(await req.json());
  const mode = body.mode as RenderingMode;
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { preferences: true },
  });
  if (
    !body.projectId &&
    projectRequiresAgeGate("GENERAL", body.contentIntensityLayer) &&
    !canAccessMatureContent(
      { ageVerifiedAt: currentUser?.ageVerifiedAt ?? null, email: currentUser?.email ?? user.email },
      currentUser?.preferences,
    )
  ) {
    return validationError(getAgeGateMessage("MATURE"));
  }
  if (
    currentUser &&
    canAccessMatureContent({ ageVerifiedAt: currentUser.ageVerifiedAt, email: currentUser.email }, currentUser.preferences) &&
    currentUser.email?.toLowerCase() === "test@gmail.com"
  ) {
    console.warn(`[adult-bypass] test@gmail.com bypassed mature gate on /api/ai/generate${body.projectId ? ` project=${body.projectId}` : ""}`);
  }

  let projectForGeneration:
    | { primaryGenre: string | null; subGenres: unknown; visualStyle: string | null }
    | null = null;
  if (body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, userId: user.id },
      include: { user: { include: { preferences: true } } },
    });
    if (!project) {
      return validationError("Projet introuvable pour la génération.");
    }
    if (projectRequiresAgeGate(project.contentRating, project.intensityLayer) && !canAccessMatureContent(project.user, project.user.preferences)) {
      return validationError(getAgeGateMessage(project.contentRating));
    }
    if (canAccessMatureContent(project.user, project.user.preferences) && project.user.email?.toLowerCase() === "test@gmail.com") {
      console.warn(`[adult-bypass] test@gmail.com bypassed mature gate on /api/ai/generate project=${body.projectId}`);
    }
    projectForGeneration = {
      primaryGenre: project.primaryGenre,
      subGenres: project.subGenres,
      visualStyle: project.visualStyle,
    };
  }
  const adultEngine = resolveAdultEngine({
    primaryGenre: projectForGeneration?.primaryGenre ?? null,
    subGenres: Array.isArray(projectForGeneration?.subGenres) ? projectForGeneration?.subGenres as string[] : [],
    visualStyle: projectForGeneration?.visualStyle ?? null,
    userIntent: body.prompt,
  });

  const ctx = {
    mode,
    contentIntensityLayer: body.contentIntensityLayer,
    adultEngine,
    isNewCharacter: body.isNewCharacter ?? false,
    hasCanonReferences: body.hasCanonReferences ?? false,
    characterCountInScene: 1,
    needsInpaint: body.needsInpaint ?? false,
    needsPoseVariation: body.needsPoseVariation ?? false,
    preferPhotorealCover: body.preferPhotorealCover ?? false,
    explicitBlocked: false,
    goreStylizedMature: body.goreStylizedMature ?? false,
  };

  const routing = decideImageRoute(ctx);
  if ("blocked" in routing) {
    return validationError(routing.reason, { blocked: true, textOnlyFallback: routing.textOnlyFallback });
  }
  const cost = await estimateImageTokensFromRules(mode, routing.provider);
  const reserved = await reserveTokens(prisma, user.id, cost, {
    reason: "image_generation_reservation",
    referenceType: "image_generation",
    referenceId: body.projectId,
    metadata: { mode, provider: routing.provider },
  });
  if (!reserved.ok) {
    return paymentRequired("Tokens insuffisants pour cette génération.", { needed: cost });
  }

  try {
    const out = await runRoutedImageGeneration(ctx, {
      mode,
      positivePrompt: body.prompt,
      width: 1024,
      height: 768,
    });
    if (!out.ok) {
      await refundReservation(prisma, user.id, reserved.reservationId, "image_generation_blocked");
      return validationError(out.reason, { blocked: true });
    }
    await settleReservedTokens(prisma, user.id, reserved.reservationId, cost);
    await trackServerEvent("image_generated", {
      userId: user.id,
      mode,
      provider: out.result.provider,
      projectId: body.projectId ?? null,
    });
    return NextResponse.json({
      imageUrl: out.result.imageUrl,
      provider: out.result.provider,
      model: out.routing.model,
      workflow: out.routing.workflow,
      tokensCharged: cost,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur génération";
    await refundReservation(prisma, user.id, reserved.reservationId, "image_generation_failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
