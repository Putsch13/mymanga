import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const schema = z.object({
  projectId: z.string().optional(),
  chapterId: z.string().optional(),
  sourceType: z.string().default("manual_review"),
  sourceId: z.string().optional(),
  reasons: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const body = schema.parse(await req.json());

  const event = await prisma.moderationEvent.create({
    data: {
      userId: user.id,
      projectId: body.projectId,
      chapterId: body.chapterId,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      moderationLevel: "user_requested_review",
      decision: "PENDING_ADMIN_REVIEW",
      reasons: body.reasons,
      rawScores: {},
    },
  });

  return NextResponse.json({ ok: true, event });
}
