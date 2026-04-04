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
import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";
import { notFound, paymentRequired, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
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
    const composed = composeCharacterVisualPrompt({
      name: character.name,
      gender:
        typeof (character as unknown as { gender?: unknown }).gender === "string"
          ? ((character as unknown as { gender: string }).gender === "male" || (character as unknown as { gender: string }).gender === "female"
              ? ((character as unknown as { gender: "male" | "female" }).gender)
              : null)
          : null,
      appearance: typeof character.appearance === "string" ? character.appearance : null,
      hairColor: typeof (character as unknown as { hairColor?: unknown }).hairColor === "string"
        ? (character as unknown as { hairColor: string }).hairColor
        : null,
      eyeColor: typeof (character as unknown as { eyeColor?: unknown }).eyeColor === "string"
        ? (character as unknown as { eyeColor: string }).eyeColor
        : null,
      outfitDefault: typeof character.outfitDefault === "string" ? character.outfitDefault : null,
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
