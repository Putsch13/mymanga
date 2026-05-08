/**
 * dispatch-launch-job.ts
 *
 * Extrait du gros handler `launch/route.ts` pour réduire sa taille.
 * Regroupe :
 *   1. Construction du `jobInput` premium via `buildGenerationJobInputFromSnapshot`
 *      (avec gestion fine de `InvalidBlueprintsError` et `IncompletePlanError`).
 *   2. Estimation du coût + check du wallet (sauf admin).
 *   3. Création du job en DB + dispatch Inngest.
 *   4. Fallback synchrone via `runFullChapterPipelineFromJob` si Inngest down.
 *
 * Tout est rassemblé ici car ces 4 étapes partagent le même chemin de retour
 * (NextResponse de succès ou d'erreur 422/402) et n'avaient aucun intérêt à
 * être inlinées dans le handler.
 */
import { NextResponse } from "next/server";
import type { ChapterStudioSnapshot } from "@manga-ai-studio/core";
import { estimateChapterTextTokensFromRules } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import {
  runFullChapterPipelineFromJob,
  sendChapterGenerateRequested,
} from "@manga-ai-studio/workflow";
import { isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
import {
  buildGenerationJobInputFromSnapshot,
  InvalidBlueprintsError,
  IncompletePlanError,
  type GenerationJobInputOptions,
} from "@/lib/premium-chapter-contract";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface DispatchLaunchJobInput {
  user: { id: string; email: string | null };
  projectId: string;
  chapterId: string;
  snapshot: ChapterStudioSnapshot;
  nextSnapshot: ChapterStudioSnapshot;
  studioSnapshotForLaunch: ChapterStudioSnapshot;
  approvedOutline: GenerationJobInputOptions["approvedOutline"];
  heroCharacterId: string | null;
  secondaryHeroCharacterId: string | null;
  focusCharacterIds: string[];
  activeNpcIds: string[];
  activeCreatureIds: string[];
  locationIds: string[];
  estimateContext: ChapterStudioSnapshot["data"]["estimateContext"];
  stack: {
    operationalStatus: string;
    degradedModes: string[];
    warnings: string[];
  };
}

function logLaunchJobDispatched(
  projectId: string,
  chapterId: string,
  jobId: string,
  viaInngest: boolean,
) {
  console.info("[launch] job_dispatched", { projectId, chapterId, jobId, viaInngest });
}

/**
 * Construit le `jobInput`, vérifie le solde wallet, crée le job en DB et le
 * dispatche via Inngest. Retourne directement un `NextResponse` :
 *   - 422 si blueprints invalides ou plan incomplet,
 *   - 402 si solde insuffisant,
 *   - 200 succès (Inngest accepté) ou résultat fallback synchrone.
 */
export async function buildAndDispatchLaunchJob(
  input: DispatchLaunchJobInput,
): Promise<NextResponse> {
  const {
    user,
    projectId,
    chapterId,
    snapshot,
    nextSnapshot,
    studioSnapshotForLaunch,
    approvedOutline,
    heroCharacterId,
    secondaryHeroCharacterId,
    focusCharacterIds,
    activeNpcIds,
    activeCreatureIds,
    locationIds,
    estimateContext,
    stack,
  } = input;

  // 1. Build du job input premium (mêmes helpers que /pipeline).
  let jobInput: Record<string, unknown>;
  try {
    jobInput = buildGenerationJobInputFromSnapshot({
      chapterId,
      source: "chapter_studio_launch",
      snapshot: nextSnapshot,
      approvedOutline,
      selectedPlotLabel: nextSnapshot.data.selectedPlotLabel ?? "bold",
      creativityControls:
        nextSnapshot.data.creativityControls == null
          ? null
          : asRecord(nextSnapshot.data.creativityControls),
      heroCharacterId,
      secondaryHeroCharacterId,
      focusCharacterIds,
      activeNpcIds,
      activeCreatureIds,
      locationIds,
      estimateContext: estimateContext
        ? {
            targetChapterId: estimateContext.targetChapterId ?? null,
            targetChapterNumber: estimateContext.targetChapterNumber ?? null,
            estimateSource: estimateContext.estimateSource,
            estimatedAt: estimateContext.estimatedAt,
            divergenceDetected: !!(
              estimateContext.targetChapterId &&
              estimateContext.targetChapterId !== chapterId
            ),
          }
        : null,
    });
  } catch (err) {
    // P1-3 : blueprints invalides = refus propre du lancement.
    if (err instanceof InvalidBlueprintsError) {
      console.warn(
        `[launch] invalid_blueprints chapterId=${chapterId} total=${err.totalInvalid} sample=${JSON.stringify(err.invalidBlueprints.slice(0, 3))}`,
      );
      return NextResponse.json(
        {
          error: "invalid_blueprints",
          code: err.code,
          totalInvalid: err.totalInvalid,
          invalidBlueprints: err.invalidBlueprints,
          message: err.message,
        },
        { status: 422 },
      );
    }
    // P0.6 : plan incomplet = refus propre, pas d'expansion silencieuse.
    if (err instanceof IncompletePlanError) {
      const productionPlanRec = asRecord(studioSnapshotForLaunch.data.productionPlan ?? undefined);
      const productionPlanSource =
        typeof productionPlanRec.source === "string" ? productionPlanRec.source : "unknown";
      const productionOutlineRec = asRecord(snapshot.data.productionOutline ?? undefined);
      const productionOutlineSource =
        typeof productionOutlineRec.source === "string" ? productionOutlineRec.source : "unknown";
      console.warn(
        `[launch] incomplete_plan userId=${user.id} projectId=${projectId} chapterId=${chapterId} ` +
          `blueprints=${err.panelBlueprintCount} minimum=${err.minimumImages} ` +
          `gap=${err.minimumImages - err.panelBlueprintCount} ` +
          `productionPlanSource=${productionPlanSource} ` +
          `productionOutlineSource=${productionOutlineSource} ` +
          `contractStatus=${snapshot.data.readinessReport?.contractStatus ?? "n/a"} ` +
          `readinessLaunchBlocked=${snapshot.data.readinessReport?.launchBlocked ?? "n/a"}`,
      );
      return NextResponse.json(
        {
          error: "incomplete_plan",
          code: err.code,
          panelBlueprintCount: err.panelBlueprintCount,
          minimumImages: err.minimumImages,
          message: err.message,
        },
        { status: 422 },
      );
    }
    throw err;
  }

  // 2. Coût estimé + wallet check (skip pour les admins illimités).
  const estimatedCost = await estimateChapterTextTokensFromRules();

  if (!isUnlimitedAdminEmail(user.email)) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (wallet && wallet.balance < estimatedCost) {
      console.warn(
        `[launch] insufficient_balance userId=${user.id} required=${estimatedCost} available=${wallet.balance} shortfall=${estimatedCost - wallet.balance}`,
      );
      return NextResponse.json(
        {
          error: "Solde insuffisant pour lancer la génération.",
          code: "INSUFFICIENT_BALANCE",
          required: estimatedCost,
          available: wallet.balance,
          shortfall: estimatedCost - wallet.balance,
        },
        { status: 402 },
      );
    }
  }

  // 3. Job DB + dispatch Inngest (avec fallback synchrone si Inngest down).
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      projectId,
      chapterId,
      type: "GENERATE_CHAPTER_SCRIPT",
      status: "queued",
      estimatedTokenCost: estimatedCost,
      input: toPrismaInputJson(jobInput),
      output: {
        currentStep: "queued",
        steps: [],
        operationalStatus: stack.operationalStatus,
        degradedModes: stack.degradedModes,
        stackWarnings: stack.warnings,
        focusCharacterIds,
      },
    },
  });

  const sent = await sendChapterGenerateRequested({
    jobId: job.id,
    projectId,
    chapterId,
    userId: user.id,
  });

  if (!sent.ok) {
    const run = await runFullChapterPipelineFromJob(job.id);
    logLaunchJobDispatched(projectId, chapterId, job.id, false);
    return NextResponse.json({
      ok: run.ok,
      jobId: job.id,
      message: run.ok
        ? "Pipeline exécuté immédiatement."
        : `Échec pipeline : ${run.error ?? "inconnu"}`,
      operationalStatus: stack.operationalStatus,
      degradedModes: stack.degradedModes,
    });
  }

  logLaunchJobDispatched(projectId, chapterId, job.id, true);
  return NextResponse.json({
    ok: true,
    jobId: job.id,
    operationalStatus: stack.operationalStatus,
    degradedModes: stack.degradedModes,
    message: "Génération lancée depuis le Chapter Studio.",
  });
}
