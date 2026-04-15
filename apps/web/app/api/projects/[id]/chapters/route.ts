import { NextResponse } from "next/server";
import { z } from "zod";
import {
  approvedOutlineSchema,
  buildApprovedOutlineFromProductionOutline,
  chapterStudioDataSchema,
  type ApprovedChapterOutline,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { trackServerEvent } from "@/lib/analytics";
import {
  buildChapterStudioListItem,
  buildChapterStructuredRuntimeCreateFields,
  patchChapterStudioSnapshot,
} from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().optional(),
  userIntent: z.string().optional(),
  tokenEstimate: z.number().int().optional(),
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
  approvedOutline: approvedOutlineSchema.optional(),
  studioDraft: chapterStudioDataSchema.partial().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildChapterOutlinePayload(input: {
  existing?: unknown;
  draftSetup: {
    focusCharacterIds: string[];
    selectedPlotLabel: "safe" | "bold" | "shock" | null;
    creativityControls: Record<string, unknown> | null;
    sourceUserIntent: string | null;
  };
  approvedOutline?: ApprovedChapterOutline;
}) {
  return ({
    ...asRecord(input.existing),
    draftSetup: input.draftSetup,
    ...(input.approvedOutline ? { approvedOutline: input.approvedOutline } : {}),
  } as unknown) as Prisma.InputJsonValue;
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const chapters = await prisma.chapter.findMany({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  return NextResponse.json({
    chapters: chapters.map((chapter) =>
      buildChapterStudioListItem({
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        status: chapter.status,
        summary: chapter.summary,
        cliffhanger: chapter.cliffhanger,
        outline: chapter.outline,
        studioStatus: chapter.studioStatus,
        studioCurrentStep: chapter.studioCurrentStep,
        studioUpdatedAt: chapter.studioUpdatedAt,
        studioAutosaveVersion: chapter.studioAutosaveVersion,
        minimumImages: chapter.minimumImages,
        generatedImages: chapter.generatedImages,
        acceptedImages: chapter.acceptedImages,
        rejectedImages: chapter.rejectedImages,
        missingImages: chapter.missingImages,
        criticalPanelsCount: chapter.criticalPanelsCount,
        criticalPanelsBlocked: chapter.criticalPanelsBlocked,
        criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
        reviewBlockedReason: chapter.reviewBlockedReason,
      }),
    ),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) return notFound();
  const body = createSchema.parse(await req.json());
  const last = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  const chapterNumber = Number(last?.chapterNumber ?? 0) + 1;
  const initialStudio = body.studioDraft
    ? patchChapterStudioSnapshot(
        {},
        {
          ...body.studioDraft,
          intent: {
            chapterNumber,
            workingTitle: body.title ?? `Chapitre ${chapterNumber}`,
            shortPitch: body.userIntent ?? null,
            mainConflict: body.studioDraft.intent?.mainConflict ?? null,
            arcPosition: body.studioDraft.intent?.arcPosition ?? null,
            emotionalGoal: body.studioDraft.intent?.emotionalGoal ?? null,
            endingMode: body.studioDraft.intent?.endingMode ?? null,
            arcImportance: body.studioDraft.intent?.arcImportance ?? null,
          },
        },
        {
          chapterNumber,
          chapterTitle: body.title ?? `Chapitre ${chapterNumber}`,
          userIntent: body.userIntent ?? null,
          currentStep: body.studioDraft.productionPlan
            ? "production_plan"
            : body.studioDraft.productionOutline
              ? "production_outline"
              : body.studioDraft.editorialOutline
                ? "editorial_outline"
                : "intent",
          transitionReason: "chapter_created_from_studio",
        },
      )
    : null;
  // Si studioDraft.productionOutline premium est fourni, reconstruire l'approvedOutline depuis lui
  // Ne jamais utiliser buildLegacyApprovedOutlineFromStudio
  let effectiveApprovedOutline: ApprovedChapterOutline | undefined = body.approvedOutline;
  if (!effectiveApprovedOutline && initialStudio?.data.productionOutline) {
    const po = initialStudio.data.productionOutline;
    if (po.source !== "legacy_adapted" && Array.isArray(po.beats) && po.beats.length > 0) {
      effectiveApprovedOutline = buildApprovedOutlineFromProductionOutline(initialStudio) ?? undefined;
    }
  }
  const chapter = await prisma.chapter.create({
    data: {
      projectId,
      chapterNumber,
      title: body.title ?? `Chapitre ${chapterNumber}`,
      userIntent: body.userIntent,
      status: "draft",
      tokenEstimate: body.tokenEstimate,
      ...(initialStudio
        ? buildChapterStructuredRuntimeCreateFields({
            snapshot: initialStudio,
            minimumImages: initialStudio.data.readinessReport?.imageCounts.minimumImages ?? initialStudio.data.productionPlan?.minimumImages ?? 75,
            generatedImages: 0,
            acceptedImages: 0,
            rejectedImages: 0,
            missingImages: initialStudio.data.readinessReport?.imageCounts.minimumImages ?? initialStudio.data.productionPlan?.minimumImages ?? 75,
            criticalPanelsCount: 0,
            criticalPanelsBlocked: 0,
            criticalPanelsMissingQa: 0,
            reviewBlockedReason: "missing_images",
          })
        : {}),
      outline: buildChapterOutlinePayload({
        draftSetup: {
          focusCharacterIds: body.focusCharacterIds ?? [],
          selectedPlotLabel: body.selectedPlotLabel ?? null,
          creativityControls: (body.creativityControls ?? null) as Record<string, unknown> | null,
          sourceUserIntent: body.userIntent ?? null,
        },
        approvedOutline: effectiveApprovedOutline,
      }),
    },
  });
  if (initialStudio) {
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        outline: ({
          ...asRecord(chapter.outline),
          studio: initialStudio,
          approvedOutline: effectiveApprovedOutline ?? asRecord(chapter.outline).approvedOutline,
        } as unknown) as Prisma.InputJsonValue,
      },
    });
  }
  await trackServerEvent("chapter_created", { userId: user.id, projectId, chapterId: chapter.id });
  return NextResponse.json({ chapter });
}
