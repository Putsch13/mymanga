import { NextResponse } from "next/server";
import { approvedOutlineSchema, productionOutlineSchema, productionPlanSchema } from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { notFound, unauthorized } from "@/lib/api-response";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedChapter } from "@/lib/ownership";
import { buildChapterStructuredRuntimePrismaFields, patchChapterStudioSnapshot } from "@/lib/chapter-studio";
import {
  buildPremiumChapterContractFromApprovedOutline,
  reconcileIncomingPremiumContract,
} from "@/lib/premium-chapter-contract";

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

  // Toujours reconstruire le contrat premium côté serveur pour validation
  const rebuiltContract = await buildPremiumChapterContractFromApprovedOutline({
    approvedOutline,
    heroCharacterId,
    projectGenre: project?.primaryGenre ?? null,
    projectTone: project?.tone ?? null,
  });

  if (providedProductionOutline && providedProductionPlan) {
    // Contrat fourni par le client — valider les schémas puis réconcilier avec le serveur
    const parsedOutline = productionOutlineSchema.safeParse(providedProductionOutline);
    const parsedPlan = productionPlanSchema.safeParse(providedProductionPlan);

    if (parsedOutline.success && parsedPlan.success) {
      // Réconcilier : le serveur gagne sur les champs premium visuels
      const reconciled = reconcileIncomingPremiumContract({
        approvedOutline,
        incomingProductionOutline: parsedOutline.data,
        incomingProductionPlan: parsedPlan.data,
        rebuiltContract,
      });
      resolvedProductionOutline = reconciled.productionOutline;
      resolvedProductionPlan = reconciled.productionPlan;
      const reconciledPP = reconciled.productionPlan as Record<string, unknown>;
      premiumMeta = {
        source: reconciled.productionOutline.source,
        premiumReadinessScore: reconciledPP.premiumReadinessScore,
        panelBlueprintsCount: Array.isArray(reconciledPP.panelBlueprints) ? reconciledPP.panelBlueprints.length : 0,
        heroCenterRatio: reconciledPP.heroCenterRatio,
        focusDistribution: reconciledPP.focusDistribution,
        propCoverage: reconciledPP.propCoverage,
        enemyCoverage: reconciledPP.enemyCoverage,
        npcCoverage: reconciledPP.npcCoverage,
        cutawayCoverage: reconciledPP.cutawayCoverage,
        dialogueAnchorCoverage: reconciledPP.dialogueAnchorCoverage,
        reconciled: true,
      };
      console.info(
        `[approved-outline] reconciled chapterId=${chapterId} ` +
        `incomingBeats=${parsedOutline.data.beats.length} rebuiltBeats=${rebuiltContract.productionOutline.beats.length} ` +
        `panelBlueprintsCount=${Array.isArray(reconciledPP.panelBlueprints) ? reconciledPP.panelBlueprints.length : 0} ` +
        `premiumReadinessScore=${reconciledPP.premiumReadinessScore ?? "n/a"}`,
      );
    } else {
      // Payload client invalide — utiliser directement le contrat serveur
      resolvedProductionOutline = rebuiltContract.productionOutline;
      resolvedProductionPlan = rebuiltContract.productionPlan;
      premiumMeta = {
        source: rebuiltContract.productionOutline.source,
        premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
        panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
        heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
        focusDistribution: rebuiltContract.coverage.focusDistribution,
        propCoverage: rebuiltContract.coverage.propCoverage,
        enemyCoverage: rebuiltContract.coverage.enemyCoverage,
        npcCoverage: rebuiltContract.coverage.npcCoverage,
        cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
        dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
        fallback: "server_rebuilt_invalid_client",
      };
    }
  } else {
    // Pas de contrat client — utiliser directement le contrat serveur
    resolvedProductionOutline = rebuiltContract.productionOutline;
    resolvedProductionPlan = rebuiltContract.productionPlan;
    premiumMeta = {
      source: rebuiltContract.productionOutline.source,
      premiumReadinessScore: rebuiltContract.coverage.premiumReadinessScore,
      panelBlueprintsCount: rebuiltContract.panelBlueprints.length,
      heroCenterRatio: rebuiltContract.coverage.heroCenterRatio,
      focusDistribution: rebuiltContract.coverage.focusDistribution,
      propCoverage: rebuiltContract.coverage.propCoverage,
      enemyCoverage: rebuiltContract.coverage.enemyCoverage,
      npcCoverage: rebuiltContract.coverage.npcCoverage,
      cutawayCoverage: rebuiltContract.coverage.cutawayCoverage,
      dialogueAnchorCoverage: rebuiltContract.coverage.dialogueAnchorCoverage,
    };
  }

  console.info(
    `[approved-outline] PATCH chapterId=${chapterId} projectId=${projectId} ` +
    `beatCount=${approvedOutline.beats.length} ` +
    `panelBlueprintsCount=${(premiumMeta as Record<string, unknown>).panelBlueprintsCount ?? 0} ` +
    `premiumReadinessScore=${(premiumMeta as Record<string, unknown>).premiumReadinessScore ?? "n/a"} ` +
    `heroCenterRatio=${(premiumMeta as Record<string, unknown>).heroCenterRatio ?? "n/a"}`,
  );

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
