import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const bodySchema = z.object({
  confirmedAdult: z.literal(true),
  matureContentEnabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const body = bodySchema.parse(await req.json());

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ageVerifiedAt: new Date(),
      preferences: {
        upsert: {
          create: {
            matureContentEnabled: body.matureContentEnabled,
          },
          update: {
            matureContentEnabled: body.matureContentEnabled,
          },
        },
      },
    },
    include: { preferences: true },
  });

  return NextResponse.json({ ok: true, user: updated });
}
