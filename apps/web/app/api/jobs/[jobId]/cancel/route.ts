import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized, validationError } from "@/lib/api-response";

type Ctx = { params: Promise<{ jobId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { jobId } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId: user.id },
  });
  if (!job) return notFound();
  if (["completed", "failed", "canceled", "refunded"].includes(job.status)) {
    return validationError("Ce job ne peut plus être annulé.", { status: job.status });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "canceled",
      finishedAt: new Date(),
      error: { message: "Annulé par l'utilisateur" },
    },
  });

  return NextResponse.json({ ok: true, job: updated });
}
