import { NextResponse } from "next/server";
import {
  buildPanelTraceabilityReport,
  hydratePanelProvenanceOnBlueprints,
  computeNarrativeMemoryDigestFromOutline,
  buildIntentNarrativeContract,
  runIntentCoverageQa,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import {
  computeContractualFocusAdequacy,
  runPremiumPlanContractQa,
} from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ chapterId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { chapterId } = await ctx.params;

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId },
    include: { project: true },
  });
  if (!chapter) {
    return NextResponse.json({ error: "chapter_not_found" }, { status: 404 });
  }

  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
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
  });

  const blueprints = snapshot.data.productionPlan?.panelBlueprints;
  if (!Array.isArray(blueprints) || blueprints.length === 0) {
    return NextResponse.json({
      score: 0,
      readyForLaunch: false,
      panelCount: 0,
      propInserts: 0,
      weaponInserts: 0,
      envPanels: 0,
      npcPanels: 0,
      enemyFocus: 0,
      weakLocationBinding: 0,
      intentCoverageScore: 0,
      canonPackScores: {},
      blocking: ["no_blueprints"],
      warnings: [],
      repairable: [],
    });
  }

  const bps = blueprints as PanelBlueprintPremium[];
  const contractQa = runPremiumPlanContractQa({ blueprints: bps });
  const adequacy = computeContractualFocusAdequacy(bps);

  const outlineForDigest = snapshot.data.productionOutline ?? {
    source: "audit",
    chapterGoal: "",
    cliffhanger: "",
    beats: [],
  };
  const digest = computeNarrativeMemoryDigestFromOutline(outlineForDigest);
  const traced = hydratePanelProvenanceOnBlueprints(bps, {
    narrativeMemoryDigest: digest,
  });
  const traceReport = buildPanelTraceabilityReport(traced);

  const canonList = snapshot.data.characterCanons ?? [];
  const canonPackScores: Record<string, number> = {};
  for (const c of canonList) {
    canonPackScores[c.characterId] =
      typeof c.canonPackCompleteness === "number" ? c.canonPackCompleteness : 0;
  }

  let intentCoverageScore = 0;
  const userIntent = chapter.userIntent ?? "";
  if (userIntent.length > 0) {
    const intentContract = buildIntentNarrativeContract({
      chapterId,
      userIntent,
    });
    const beats = Array.isArray(outlineForDigest.beats) ? outlineForDigest.beats : [];
    const beatSummaries = beats.map((b: { summary?: string }) => b.summary ?? "");
    const vw = snapshot.data.visualWorldContract;
    const coverageResult = runIntentCoverageQa({
      intentContract,
      beatSummaries,
      visualWorldLocationNames: Array.isArray(vw?.locations)
        ? vw.locations.map((l: { label?: string }) => l.label ?? "")
        : [],
      visualWorldNpcGroupLabels: Array.isArray(vw?.npcGroups)
        ? vw.npcGroups.map((g: { label?: string }) => g.label ?? "")
        : [],
    });
    intentCoverageScore = coverageResult.intentCoverageScore;
  }

  return NextResponse.json({
    score: adequacy.score,
    readyForLaunch: contractQa.ok,
    panelCount: bps.length,
    propInserts: contractQa.metrics.propInserts,
    weaponInserts: contractQa.metrics.weaponInserts,
    envPanels: contractQa.metrics.envPanels,
    npcPanels: contractQa.metrics.npcPanels,
    enemyFocus: contractQa.metrics.enemyFocus,
    weakLocationBinding: traceReport.panelsWeakLocationBinding,
    intentCoverageScore,
    canonPackScores,
    blocking: contractQa.blocking,
    warnings: contractQa.warnings,
    repairable: contractQa.repairable,
  });
}
