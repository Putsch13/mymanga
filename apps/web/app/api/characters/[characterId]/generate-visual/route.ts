import { NextResponse } from "next/server";
import { RENDERING_MODES } from "@manga-ai-studio/core";
import { runRoutedImageGeneration } from "@manga-ai-studio/ai";
import { estimateImageTokensFromRules, refundReservation, reserveTokens, settleReservedTokens } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, paymentRequired, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();

  const mode = RENDERING_MODES[0];
  const estimatedTokens = await estimateImageTokensFromRules(mode, "fal");
  const reservation = await reserveTokens(prisma, user.id, estimatedTokens, {
    reason: "character_visual_reservation",
    referenceType: "character_visual",
    referenceId: character.id,
  });
  if (!reservation.ok) {
    return paymentRequired("Tokens insuffisants pour générer un visuel personnage.", { needed: estimatedTokens });
  }

  try {
    const prompt = [
      character.name,
      character.roleType,
      character.biography,
      character.objective,
      character.emotionalState,
      "character sheet manga premium",
    ]
      .filter(Boolean)
      .join(", ");

    const output = await runRoutedImageGeneration(
      {
        mode,
        contentIntensityLayer: character.project.intensityLayer,
        isNewCharacter: true,
        hasCanonReferences: character.visualRefs.length > 0,
        characterCountInScene: 1,
        needsInpaint: false,
        needsPoseVariation: false,
        preferPhotorealCover: false,
        explicitBlocked: false,
        goreStylizedMature: false,
      },
      {
        mode,
        positivePrompt: prompt,
        width: 1024,
        height: 1536,
      },
    );

    if (!output.ok) {
      await refundReservation(prisma, user.id, reservation.reservationId, "character_visual_blocked");
      return NextResponse.json({ error: output.reason }, { status: 422 });
    }

    const visualRef = await prisma.characterVisualRef.create({
      data: {
        characterId: character.id,
        type: "generated_primary",
        imageUrl: output.result.imageUrl,
        promptSnapshot: prompt,
        isPrimary: character.visualRefs.length === 0,
        metadata: { provider: output.result.provider, model: output.result.model },
      },
    });

    await settleReservedTokens(prisma, user.id, reservation.reservationId, estimatedTokens);
    return NextResponse.json({ ok: true, visualRef });
  } catch (error) {
    await refundReservation(prisma, user.id, reservation.reservationId, "character_visual_failed");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "character_visual_failed" },
      { status: 500 },
    );
  }
}
