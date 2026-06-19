import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { jobId } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: user.id },
    include: {
      project: { select: { id: true, title: true } },
      chapter: { select: { id: true, title: true, chapterNumber: true, status: true } },
    },
  });

  if (!job) return notFound();
  return NextResponse.json({ job });
}
