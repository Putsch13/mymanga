import { NextResponse } from "next/server";
import { runRoutedImageGeneration, composeCharacterVisualPrompt } from "@manga-ai-studio/ai";
import {
  estimateImageTokensFromRules,
  refundReservation,
  reserveTokens,
  settleReservedTokens,
} from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";
import { checkRateLimit } from "@/lib/rate-limit";
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { notFound, paymentRequired, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = checkRateLimit(user.id, "generate_visual");
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

  const intensityLayer = (character.project.intensityLayer as string | null) ?? "TEEN";
  const mode = "CHARACTER_SHEET" as const;

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

    // Composer le prompt via character-visual-composer
    const raw = character as unknown as Record<string, unknown>;
    const bodyState = raw.bodyState && typeof raw.bodyState === "object" ? raw.bodyState as Record<string, unknown> : {};
    const wardrobeProfile = raw.wardrobeProfile && typeof raw.wardrobeProfile === "object" ? raw.wardrobeProfile as Record<string, unknown> : {};

    // Construire une description corporelle compacte depuis bodyState
    const bodyParts: string[] = [];
    if (bodyState.height) bodyParts.push(String(bodyState.height));
    if (bodyState.build) bodyParts.push(String(bodyState.build));
    if (bodyState.scars) bodyParts.push(`scars: ${String(bodyState.scars)}`);
    if (bodyState.prosthetics) bodyParts.push(`prosthetic: ${String(bodyState.prosthetics)}`);
    if (bodyState.tattoos) bodyParts.push(`tattoo: ${String(bodyState.tattoos)}`);
    if (bodyState.injuries) bodyParts.push(`injury: ${String(bodyState.injuries)}`);
    if (bodyState.modifications) bodyParts.push(String(bodyState.modifications));

    // Fusionner appearance + bodyState pour le prompt visuel
    const fullAppearance = [
      typeof raw.appearance === "string" ? raw.appearance : null,
      ...bodyParts,
    ].filter(Boolean).join(", ") || null;

    // Outfit enrichi depuis wardrobeProfile
    const fullOutfit = [
      typeof character.outfitDefault === "string" ? character.outfitDefault : null,
      wardrobeProfile.accessories ? String(wardrobeProfile.accessories) : null,
      wardrobeProfile.armor ? String(wardrobeProfile.armor) : null,
      wardrobeProfile.weapons ? String(wardrobeProfile.weapons) : null,
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

    const output = await runRoutedImageGeneration(
      {
        mode: "PANEL_DRAFT",
        contentIntensityLayer: intensityLayer,
        isNewCharacter: true,
        hasCanonReferences: character.visualRefs.length > 0,
        characterCountInScene: 1,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
        goreStylizedMature:
          intensityLayer === "MATURE_VISUAL" || intensityLayer === "ADULT_EXPLICIT",
      },
      {
        mode: "PANEL_DRAFT",
        positivePrompt: composed.positive,
        negativePrompt: composed.negative,
        width: 768,
        height: 1024,
        providerParams: {
          contentIntensityLayer: intensityLayer,
          mode: "CHARACTER_SHEET",
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

    const persisted = await persistGeneratedImageIfNeeded({
      imageUrl: output.result.imageUrl,
      objectPath: `projects/${character.project.id}/characters/${character.id}/refs/${Date.now()}`,
    });

    if (!persisted.ok) {
      await refundReservation(
        prisma,
        user.id,
        reservation.reservationId,
        "character_visual_storage_failed",
      );
      return NextResponse.json({ error: persisted.error }, { status: 502 });
    }

    const visualRef = await prisma.characterVisualRef.create({
      data: {
        characterId: character.id,
        type: "generated_primary",
        imageUrl: persisted.url,
        promptSnapshot: composed.positive,
        isPrimary: character.visualRefs.length === 0,
        metadata: {
          provider: output.result.provider,
          model: output.result.model,
          negativePrompt: composed.negative,
          persisted: persisted.persisted,
        },
      },
    });

    await settleReservedTokens(prisma, user.id, reservation.reservationId, estimatedTokens);
    return NextResponse.json({ ok: true, visualRef });
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
