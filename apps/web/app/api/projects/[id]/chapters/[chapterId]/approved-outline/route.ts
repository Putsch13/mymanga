import { NextResponse } from "next/server";
import { approvedOutlineSchema, productionOutlineSchema, productionPlanSchema } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";
import { buildChapterStructuredRuntimePrismaFields, patchChapterStudioSnapshot } from "@/lib/chapter-studio";
import { buildPremiumChapterContractFromApprovedOutline } from "@/lib/premium-chapter-contract";

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

  // Charger le projet pour les métadonnées premium (genre, tone, hero)
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { primaryGenre: true, tone: true },
  });
  const projectCharacters = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, roleType: true },
  });
  const heroCharacterId =
    projectCharacters.find((c) => /hero|protagon|main/i.test(c.roleType ?? ""))?.id ?? null;

  const body = await req.json();
  const approvedOutline = approvedOutlineSchema.parse(body.approvedOutline);
  const existingOutline = asRecord(chapter.outline);

  // Si productionOutline + productionPlan sont fournis (depuis generate/page.tsx), les persister tels quels
  // Sinon, reconstruire le contrat premium complet depuis l'approvedOutline
  let resolvedProductionOutline: unknown;
  let resolvedProductionPlan: unknown;
  let premiumMeta: unknown;

  const providedProductionOutline = body.productionOutline;
  const providedProductionPlan = body.productionPlan;

  if (providedProductionOutline && providedProductionPlan) {
    // Contrat premium fourni par le client — valider et persister sans reconstruction
    const parsedOutline = productionOutlineSchema.safeParse(providedProductionOutline);
    const parsedPlan = productionPlanSchema.safeParse(providedProductionPlan);
    if (parsedOutline.success && parsedPlan.success) {
      resolvedProductionOutline = parsedOutline.data;
      resolvedProductionPlan = parsedPlan.data;
      premiumMeta = {
        source: parsedOutline.data.source,
        premiumReadinessScore: parsedPlan.data.premiumReadinessScore,
        panelBlueprintsCount: parsedPlan.data.panelBlueprints?.length ?? 0,
      };
    } else {
      // Fallback si les données fournies sont invalides — reconstruire via le service partagé
      const premiumContract = await buildPremiumChapterContractFromApprovedOutline({
        approvedOutline,
        heroCharacterId,
        projectGenre: project?.primaryGenre ?? null,
        projectTone: project?.tone ?? null,
      });
      resolvedProductionOutline = premiumContract.productionOutline;
      resolvedProductionPlan = premiumContract.productionPlan;
      premiumMeta = {
        source: premiumContract.productionOutline.source,
        premiumReadinessScore: premiumContract.coverage.premiumReadinessScore,
        panelBlueprintsCount: premiumContract.panelBlueprints.length,
      };
    }
  } else {
    // Reconstruire le contrat premium complet via le service partagé (avec enrichissement LLM)
    const premiumContract = await buildPremiumChapterContractFromApprovedOutline({
      approvedOutline,
      heroCharacterId,
      projectGenre: project?.primaryGenre ?? null,
      projectTone: project?.tone ?? null,
    });
    resolvedProductionOutline = premiumContract.productionOutline;
    resolvedProductionPlan = premiumContract.productionPlan;
    premiumMeta = {
      source: premiumContract.productionOutline.source,
      premiumReadinessScore: premiumContract.coverage.premiumReadinessScore,
      panelBlueprintsCount: premiumContract.panelBlueprints.length,
      heroCenterRatio: premiumContract.coverage.heroCenterRatio,
      focusDistribution: premiumContract.coverage.focusDistribution,
      propCoverage: premiumContract.coverage.propCoverage,
      enemyCoverage: premiumContract.coverage.enemyCoverage,
      npcCoverage: premiumContract.coverage.npcCoverage,
      cutawayCoverage: premiumContract.coverage.cutawayCoverage,
      dialogueAnchorCoverage: premiumContract.coverage.dialogueAnchorCoverage,
    };
  }

  const studioSnapshot = patchChapterStudioSnapshot(
    chapter.outline,
    {
      editorialOutline: {
        summary: approvedOutline.summary,
        validationNotes: [],
        // Tous les beats — plus de slice(0, 5)
        beats: approvedOutline.beats.map((beat, index) => ({
          beatId: beat.id,
          label: `Bloc ${index + 1}`,
          summary: beat.summary,
          narrativePurpose: beat.pageRole,
          dramaticShift: beat.turn,
          involvedCharacters: beat.characters,
        })),
      },
      productionOutline: resolvedProductionOutline as never,
      productionPlan: resolvedProductionPlan as never,
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      currentStep: "production_plan",
      transitionReason: "premium_approved_outline_saved",
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
    premiumMeta,
  });
}
