/**
 * OBS-1 — Premium Plan Audit (server-side helper)
 *
 * Source unique pour la route `/api/internal/premium-plan-audit/[chapterId]`
 * et la page admin `/admin/premium-audit`. Calcule pour un chapitre :
 *  - score d'adéquation contractuelle (focus subjects)
 *  - statut readyForLaunch (contract QA passe sans blocking)
 *  - métriques contractQa (propInserts / weaponInserts / envPanels / npcPanels)
 *  - panelsWeakLocationBinding (depuis le rapport de traçabilité)
 *  - intentCoverageScore (si userIntent fourni)
 *  - canonPackScores (par character)
 *  - listes blocking / warnings / repairable
 */
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

export interface PremiumPlanAuditReport {
  score: number;
  readyForLaunch: boolean;
  panelCount: number;
  propInserts: number;
  weaponInserts: number;
  envPanels: number;
  npcPanels: number;
  enemyFocus: number;
  weakLocationBinding: number;
  intentCoverageScore: number;
  canonPackScores: Record<string, number>;
  blocking: readonly string[];
  warnings: readonly string[];
  repairable: readonly string[];
}

const EMPTY_AUDIT: PremiumPlanAuditReport = {
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
};

export async function buildPremiumPlanAuditForChapter(
  chapterId: string,
): Promise<PremiumPlanAuditReport | null> {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId },
    include: { project: true },
  });
  if (!chapter) return null;

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
  if (!Array.isArray(blueprints) || blueprints.length === 0) return EMPTY_AUDIT;

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

  return {
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
  };
}

export interface AggregatedPremiumAuditStats {
  totalChapters: number;
  averageScore: number;
  averageIntentCoverage: number;
  readyForLaunchCount: number;
  byStageFailureCount: {
    /** Chapitre sans plan canonique (no_blueprints). */
    canonicalPlan: number;
    /** Au moins un blocking sur le contract QA. */
    contractQa: number;
    /** Repairable non vide → focus-repair aurait dû / a tourné. */
    focusRepair: number;
    /** weakLocationBinding > 0 → coverage visuelle perfectible. */
    visualCoverage: number;
  };
}

export function aggregatePremiumAuditStats(
  reports: ReadonlyArray<PremiumPlanAuditReport | null>,
): AggregatedPremiumAuditStats {
  const valid = reports.filter((r): r is PremiumPlanAuditReport => r !== null);
  if (valid.length === 0) {
    return {
      totalChapters: 0,
      averageScore: 0,
      averageIntentCoverage: 0,
      readyForLaunchCount: 0,
      byStageFailureCount: {
        canonicalPlan: 0,
        contractQa: 0,
        focusRepair: 0,
        visualCoverage: 0,
      },
    };
  }
  const total = valid.length;
  const avgScore = Math.round(valid.reduce((s, r) => s + r.score, 0) / total);
  const avgIntent = Math.round(valid.reduce((s, r) => s + r.intentCoverageScore, 0) / total);
  const ready = valid.filter((r) => r.readyForLaunch).length;
  return {
    totalChapters: total,
    averageScore: avgScore,
    averageIntentCoverage: avgIntent,
    readyForLaunchCount: ready,
    byStageFailureCount: {
      canonicalPlan: valid.filter((r) => r.blocking.includes("no_blueprints")).length,
      contractQa: valid.filter((r) => r.blocking.length > 0 && !r.blocking.includes("no_blueprints")).length,
      focusRepair: valid.filter((r) => r.repairable.length > 0).length,
      visualCoverage: valid.filter((r) => r.weakLocationBinding > 0).length,
    },
  };
}
