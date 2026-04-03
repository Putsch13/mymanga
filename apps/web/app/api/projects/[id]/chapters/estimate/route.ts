import { NextResponse } from "next/server";
import { z } from "zod";
import { generateChapterBundle } from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  userIntent: z.string().min(3),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = schema.parse(await req.json());
  const estimatedTokens = await estimateChapterTextTokensFromRules();
  const context = await buildProjectContext(prisma, projectId, body.userIntent);
  if (!context) return notFound();

  const nextChapter = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  const bundle = await generateChapterBundle({
    chapterNumber: (nextChapter?.chapterNumber ?? 0) + 1,
    userIntent: body.userIntent,
    context,
  });

  return NextResponse.json({
    estimatedTokens,
    contextPreview: {
      recentChapters: context.recentChapters,
      retrievedDocs: context.retrievedDocs,
      arcs: context.arcs,
      characters: context.characters,
    },
    plotOptions: bundle.plotOptions,
    creativeDirection: bundle.creativeDirection,
  });
}
