import { NextResponse } from "next/server";
import { z } from "zod";
import { generateChapterBundle } from "@manga-ai-studio/ai";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { buildApprovedOutlineVersion, buildProductionPlanFromOutline } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { buildProjectContext } from "@manga-ai-studio/memory";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  userIntent: z.string().min(3),
  focusCharacterIds: z.array(z.string()).optional(),
  selectedPlotLabel: z.enum(["safe", "bold", "shock"]).optional(),
  creativityControls: z.object({
    noveltyLevel: z.number().int().min(0).max(100).optional(),
    worldStrictness: z.number().int().min(0).max(100).optional(),
    visualExoticism: z.number().int().min(0).max(100).optional(),
    npcVariety: z.number().int().min(0).max(100).optional(),
    environmentRichness: z.number().int().min(0).max(100).optional(),
  }).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = schema.parse(await req.json());
  const estimatedTokens = await estimateChapterTextTokensFromRules();
  const context = await buildProjectContext(prisma, projectId, body.userIntent, {
    focusCharacterIds: body.focusCharacterIds,
  });
  if (!context) return notFound();

  const nextChapter = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: "desc" },
  });
  const bundle = await generateChapterBundle({
    chapterNumber: (nextChapter?.chapterNumber ?? 0) + 1,
    userIntent: body.userIntent,
    selectedPlotLabel: body.selectedPlotLabel,
    context,
  });
  const previewBeats = bundle.outline.beats.slice(0, 5).map((beat) => ({
    id: beat.id,
    summary: beat.summary,
    characters: beat.characters,
    location: beat.location,
    pageRole: beat.pageRole ?? "escalation",
    turn: beat.turn ?? beat.purpose,
    emotionalDelta: beat.emotionalDelta ?? 0,
    structuredBeat: beat.structuredBeat ?? null,
  }));
  const previewVersion = buildApprovedOutlineVersion({
    summary: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    beats: bundle.outline.beats.map((beat) => ({
      id: beat.id,
      summary: beat.summary,
      characters: beat.characters,
      location: beat.location,
      pageRole: beat.pageRole ?? "escalation",
      turn: beat.turn ?? beat.purpose,
      emotionalDelta: beat.emotionalDelta ?? 0,
      structuredBeat: beat.structuredBeat ?? null,
    })),
    source: "estimate_preview",
  });
  const productionOutline = {
    source: "estimated" as const,
    chapterGoal: bundle.outline.chapter_goal,
    cliffhanger: bundle.outline.cliffhanger,
    beats: bundle.outline.beats.map((beat) => ({
      beatId: beat.id,
      summary: beat.summary,
      narrativeFunction: beat.pageRole ?? beat.purpose,
      whyThisBeatExists: beat.summary,
      dramaticChange: beat.turn ?? beat.purpose,
      involvedCharacters: beat.characters,
      activeCanonConstraints: [],
      environmentContext: [beat.location],
      visualPriority: "high" as const,
      estimatedPanels: 4,
      criticality: (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation" ? "critical" : "medium") as
        | "critical"
        | "medium",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 72,
      redundancyRisk: 18,
    })),
  };
  const productionPlan = buildProductionPlanFromOutline(productionOutline);

  return NextResponse.json({
    estimatedTokens,
    creativityControls: body.creativityControls ?? null,
    contextPreview: {
      recentChapters: context.recentChapters,
      retrievedDocs: context.retrievedDocs,
      arcs: context.arcs,
      characters: context.characters,
    },
    plotOptions: bundle.plotOptions,
    creativeDirection: bundle.creativeDirection,
    outlinePreview: {
      summary: bundle.outline.chapter_goal,
      cliffhanger: bundle.outline.cliffhanger,
      approvalVersion: previewVersion,
      beats: previewBeats,
    },
    editorialOutline: {
      summary: bundle.outline.chapter_goal,
      validationNotes: [],
      beats: previewBeats.map((beat, index) => ({
        beatId: beat.id,
        label: `Bloc ${index + 1}`,
        summary: beat.summary,
        narrativePurpose: beat.pageRole,
        dramaticShift: beat.turn,
        involvedCharacters: beat.characters,
      })),
    },
    productionOutline,
    productionPlan,
  });
}
