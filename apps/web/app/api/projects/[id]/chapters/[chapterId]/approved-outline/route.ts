import { NextResponse } from "next/server";
import { approvedOutlineSchema } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";
import { buildChapterStructuredRuntimePrismaFields, patchChapterStudioSnapshot } from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  const approvedOutline = approvedOutlineSchema.parse((await req.json()).approvedOutline);
  const existingOutline = asRecord(chapter.outline);
  const studioSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {
      editorialOutline: {
        summary: approvedOutline.summary,
        validationNotes: [],
        beats: approvedOutline.beats.slice(0, 5).map((beat, index) => ({
          beatId: beat.id,
          label: `Bloc ${index + 1}`,
          summary: beat.summary,
          narrativePurpose: beat.pageRole,
          dramaticShift: beat.turn,
          involvedCharacters: beat.characters,
        })),
      },
      productionOutline: {
        source: "legacy_adapted",
        chapterGoal: approvedOutline.summary,
        cliffhanger: approvedOutline.cliffhanger,
        beats: approvedOutline.beats.map((beat) => ({
          beatId: beat.id,
          summary: beat.summary,
          narrativeFunction: beat.pageRole,
          whyThisBeatExists: beat.summary,
          dramaticChange: beat.turn,
          involvedCharacters: beat.characters,
          activeCanonConstraints: [],
          environmentContext: [beat.location],
          visualPriority: "high",
          estimatedPanels: 4,
          criticality: "medium",
          continuityDependencies: [],
          indispensabilityScore: 70,
          redundancyRisk: 20,
          infoGained: null,
          emotionProduced: null,
        })),
      },
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      currentStep: "production_outline",
      transitionReason: "legacy_approved_outline_saved",
    },
  );

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      ...buildChapterStructuredRuntimePrismaFields({
        snapshot: studioSnapshot,
        minimumImages: studioSnapshot.data.readinessReport?.imageCounts.minimumImages ?? studioSnapshot.data.productionPlan?.minimumImages ?? 55,
        generatedImages: chapter.generatedImages ?? 0,
        acceptedImages: chapter.acceptedImages ?? 0,
        rejectedImages: chapter.rejectedImages ?? 0,
        missingImages: chapter.missingImages ?? (studioSnapshot.data.readinessReport?.imageCounts.minimumImages ?? 55),
        criticalPanelsCount: chapter.criticalPanelsCount ?? 0,
        criticalPanelsBlocked: chapter.criticalPanelsBlocked ?? 0,
        criticalPanelsMissingQa: chapter.criticalPanelsMissingQa ?? 0,
        reviewBlockedReason: chapter.reviewBlockedReason,
      }),
      outline: ({
        ...existingOutline,
        approvedOutline,
        studio: studioSnapshot,
      } as unknown) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    chapterId: updated.id,
    approvedOutline,
  });
}
