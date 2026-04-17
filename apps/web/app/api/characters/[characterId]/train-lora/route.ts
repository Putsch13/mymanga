import { NextResponse } from "next/server";
import { trainCharacterLora, buildTriggerWord } from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = await checkRateLimit(user.id, "train_lora");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }
  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();

  const imageUrls = character.visualRefs
    .filter((r) => r.imageUrl)
    .map((r) => r.imageUrl)
    .slice(0, 20);

  if (imageUrls.length < 3) {
    return NextResponse.json(
      { error: "Au moins 3 visuels de référence sont nécessaires. Génère plus de visuels d'abord." },
      { status: 422 },
    );
  }

  const triggerWord = buildTriggerWord(character.name, character.project.id);

  const result = await trainCharacterLora({
    prisma,
    projectId: character.project.id,
    characterId,
    characterName: character.name,
    triggerWord,
    imageUrls,
    imageTypes: character.visualRefs.map((ref) => ref.type),
    steps: 300,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, readiness: result.readiness ?? null },
      { status: 500 },
    );
  }

  // MOAT-3 : signaler explicitement quand on est passé en low-data mode (3-4 refs).
  // L'UI peut afficher un avertissement et inviter l'auteur à ajouter des refs pour fiabiliser.
  if (result.readiness?.lowDataMode) {
    console.log(
      `[train-lora] low_data_mode characterId=${characterId} refs=${imageUrls.length} score=${result.readiness.score.toFixed(2)}`,
    );
  }

  const lora = await prisma.loraModel.create({
    data: {
      projectId: character.project.id,
      provider: "fal",
      externalId: triggerWord,
      name: `LoRA ${character.name}`,
      weightsMeta: {
        loraUrl: result.loraUrl,
        configUrl: result.configUrl,
        requestId: result.requestId,
        jobId: result.jobId,
        triggerWord,
        characterId,
        trainedAt: new Date().toISOString(),
        imageCount: imageUrls.length,
        previewImages: result.previewImages ?? [],
        trainingAssetId: result.trainingAssetId ?? null,
        readiness: result.readiness ?? null,
      } as Prisma.InputJsonValue,
      status: "active",
      attachments: {
        create: {
          characterId,
          projectId: character.project.id,
          weight: 1.0,
          enabled: true,
        },
      },
    },
    include: { attachments: true },
  });

  return NextResponse.json({
    ok: true,
    lora,
    triggerWord,
    readiness: result.readiness ?? null,
    lowDataMode: result.readiness?.lowDataMode ?? false,
  });
}
