import { NextResponse } from "next/server";
import { trainCharacterLora, buildTriggerWord } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const rl = checkRateLimit(user.id, "train_lora");
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
    characterName: character.name,
    triggerWord,
    imageUrls,
    steps: 300,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
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
        triggerWord,
        characterId,
        trainedAt: new Date().toISOString(),
        imageCount: imageUrls.length,
      },
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

  return NextResponse.json({ ok: true, lora, triggerWord });
}
