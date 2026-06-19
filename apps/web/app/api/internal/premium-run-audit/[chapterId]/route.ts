/**
 * P1.17 — Route API pour l'observabilité des runs premium.
 *
 * GET /api/internal/premium-run-audit/[chapterId]
 *
 * Retourne les données d'audit complètes pour un chapitre:
 *   - generationRunId
 *   - hashes des contrats
 *   - scores de qualité
 *   - détail panel par panel
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";
import {
  flattenSceneImagesReadingOrder,
  pickRepresentativeImageForRunMetadata,
} from "@/lib/scene-image-ordering";

interface PanelAuditData {
  panelId: string;
  panelNumber: number;
  sourceBeatId: string | null;
  narrativeRole: string | null;
  microAction: string | null;
  requiredCharacters: string[];
  requiredProps: string[];
  requiredNpcGroups: string[];
  textContract: {
    hasText: boolean;
    dialogueCount: number;
    hasNarration: boolean;
    hasSfx: boolean;
  } | null;
  finalPrompt: string | null;
  promptHash: string | null;
  imageStatus: string;
  qaStatus: string | null;
  blockers: string[];
  stableImageUrl: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { chapterId: string } }
) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  try {
    const { chapterId } = params;

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        scenes: {
          orderBy: { sceneNumber: "asc" },
          include: {
            images: true,
          },
        },
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const allImages = flattenSceneImagesReadingOrder(chapter.scenes);

    const representativeImage = pickRepresentativeImageForRunMetadata(
      allImages,
      chapter.currentGenerationRunId,
    );

    const latestMetadata = (representativeImage?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const generationRunId =
      chapter.currentGenerationRunId ??
      representativeImage?.generationRunId ??
      (latestMetadata.generationRunId as string | undefined) ??
      null;

    const approvedOutlineHash = (latestMetadata.approvedOutlineHash as string) ?? null;
    const productionPlanHash = (latestMetadata.productionPlanHash as string) ?? null;
    const chapterGenerationContractHash =
      (latestMetadata.chapterGenerationContractHash as string) ?? null;

    const panelCountExpected = chapter.minimumImages ?? allImages.length;
    const panelCountRendered = allImages.filter(
      (img) => img.status === "completed" || img.status === "validated"
    ).length;
    const panelCountValidated = allImages.filter(
      (img) => img.status === "validated" || img.userValidatedAt != null
    ).length;

    let fallbackCount = 0;
    let qaUnavailableCount = 0;
    let manualReviewCount = 0;
    let dialoguePresent = 0;
    let dialogueTotal = 0;
    let characterCanonPresent = 0;
    let characterCanonTotal = 0;
    let promptContractPass = 0;
    let promptContractTotal = 0;
    let visionQaPass = 0;
    let visionQaTotal = 0;

    const panels: PanelAuditData[] = allImages.map((img) => {
      const metadata = (img.metadata ?? {}) as Record<string, unknown>;
      const textContract = metadata.textContract as Record<string, unknown> | null;
      const panelContract = metadata.panelGenerationContract as Record<string, unknown> | null;

      if (metadata.usedFallback === true) {
        fallbackCount++;
      }

      const qaStatus = metadata.qaStatus as string | null;
      if (qaStatus === "qa_unavailable") {
        qaUnavailableCount++;
      }
      if (qaStatus === "manual_review" || metadata.requiresManualReview === true) {
        manualReviewCount++;
      }

      if (textContract) {
        dialogueTotal++;
        if ((textContract.dialogues as unknown[])?.length > 0) {
          dialoguePresent++;
        }
      }

      if (panelContract) {
        const reqChars = (panelContract.requiredCharacters as string[]) ?? [];
        if (reqChars.length > 0) {
          characterCanonTotal++;
          const prompt = (metadata.finalPrompt as string) ?? "";
          const hasAllChars = reqChars.every((c) =>
            prompt.toLowerCase().includes(c.toLowerCase())
          );
          if (hasAllChars) {
            characterCanonPresent++;
          }
        }

        promptContractTotal++;
        if (metadata.promptContractCoverage === true) {
          promptContractPass++;
        }
      }

      if (qaStatus) {
        visionQaTotal++;
        if (qaStatus === "passed" || qaStatus === "validated") {
          visionQaPass++;
        }
      }

      return {
        panelId: img.id,
        panelNumber: img.panelNumber ?? 0,
        sourceBeatId: (metadata.sourceBeatId as string) ?? null,
        narrativeRole: (panelContract?.narrativeRole as string) ?? null,
        microAction: (panelContract?.microAction as string) ?? null,
        requiredCharacters: (panelContract?.requiredCharacters as string[]) ?? [],
        requiredProps: (panelContract?.requiredProps as string[]) ?? [],
        requiredNpcGroups: (panelContract?.requiredNpcGroups as string[]) ?? [],
        textContract: textContract
          ? {
              hasText: (textContract.hasText as boolean) ?? false,
              dialogueCount: ((textContract.dialogues as unknown[]) ?? []).length,
              hasNarration: !!(textContract.narration as unknown),
              hasSfx: ((textContract.sfx as unknown[]) ?? []).length > 0,
            }
          : null,
        finalPrompt: ((metadata.finalPrompt as string) ?? "").substring(0, 200),
        promptHash: (metadata.promptHash as string) ?? null,
        imageStatus: img.status,
        qaStatus,
        blockers: (metadata.blockers as string[]) ?? [],
        stableImageUrl: img.persistedUrl ?? img.imageUrl,
      };
    });

    panels.sort((a, b) => a.panelNumber - b.panelNumber);

    const scores = {
      storyExtraction: (latestMetadata.storyExtractionScore as number) ?? 0.8,
      storyboard: (latestMetadata.storyboardScore as number) ?? 0.85,
      promptContract:
        promptContractTotal > 0 ? promptContractPass / promptContractTotal : 1,
      characterCanon:
        characterCanonTotal > 0
          ? characterCanonPresent / characterCanonTotal
          : 1,
      dialogue: dialogueTotal > 0 ? dialoguePresent / dialogueTotal : 1,
      visionQa: visionQaTotal > 0 ? visionQaPass / visionQaTotal : 1,
    };

    return NextResponse.json({
      chapterId,
      generationRunId,
      approvedOutlineHash,
      productionPlanHash,
      chapterGenerationContractHash,
      panelCountExpected,
      panelCountRendered,
      panelCountValidated,
      scores,
      fallbackCount,
      qaUnavailableCount,
      manualReviewCount,
      panels,
    });
  } catch (error) {
    console.error("[premium-run-audit] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
