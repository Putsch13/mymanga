import { NextResponse } from "next/server";
import { z } from "zod";
import { runChapterAutofill } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { chapterStudioDataSchema, chapterStudioSnapshotSchema } from "@manga-ai-studio/core";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const schema = z.object({
  mode: z.enum(["brief", "cast_canon", "plan", "all_missing", "repair_readiness"]),
  force: z.boolean().optional().default(false),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      outline: true,
    },
  });
  if (!chapter) return notFound();

  const body = schema.parse(await req.json());

  const outlineRecord = (chapter.outline ?? {}) as Record<string, unknown>;
  const rawSnapshot = outlineRecord.studio ?? null;
  const snapshot = rawSnapshot
    ? (() => {
        try {
          return chapterStudioSnapshotSchema.parse(rawSnapshot);
        } catch {
          return null;
        }
      })()
    : null;

  const currentData = snapshot?.data
    ? chapterStudioDataSchema.parse(snapshot.data)
    : chapterStudioDataSchema.parse({});

  const context = await buildProjectContext(prisma, projectId, currentData.intent?.shortPitch ?? null, {
    targetChapterId: chapterId,
    targetChapterNumber: chapter.chapterNumber,
  });

  if (!context) return notFound();

  const result = await runChapterAutofill({
    mode: body.mode,
    currentData,
    context,
    force: body.force,
  });

  return NextResponse.json({
    ok: true,
    chapterId,
    mode: body.mode,
    suggestedPatch: result.suggestedPatch,
    assumptions: result.assumptions,
    confidence: result.confidence,
    unresolvedQuestions: result.unresolvedQuestions,
    appliedFields: result.appliedFields,
    provenance: result.provenance,
    meta: result.meta,
  });
}
