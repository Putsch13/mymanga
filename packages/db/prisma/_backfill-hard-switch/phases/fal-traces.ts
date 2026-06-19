/**
 * Phase 4 — Reconstitue les `FalTrace` manquantes pour chaque
 * `SceneImage` complétée mais sans trace.
 */
import { prisma, Prisma } from "../../../src/index";
import type { BackfillState, CliOptions, PhaseName } from "../types";
import {
  extractMetadataObject,
  extractStringArray,
  logEvent,
  modeFromReferences,
  remainingTake,
  scannedThisInvocation,
} from "../utils";
import { persistState } from "../state";
import {
  buildPaginationArgs,
  finalizePhaseRun,
  preparePhaseRun,
} from "../phase-runner";

const PHASE: PhaseName = "fal-traces";

export async function runFalTracesPhase(
  options: CliOptions,
  state: BackfillState,
): Promise<void> {
  const phaseState = state.phases[PHASE];
  if (!(await preparePhaseRun(PHASE, options, state))) {
    return;
  }

  const scannedAtInvocationStart = phaseState.summary.scanned;
  let exhausted = false;
  while (true) {
    const take = remainingTake(
      options.limit,
      scannedAtInvocationStart,
      phaseState.summary.scanned,
    );
    if (take === 0) {
      logEvent(PHASE, "limit reached before exhaustion", {
        limitPerPhase: options.limit,
        processedThisInvocation: scannedThisInvocation(
          phaseState.summary.scanned,
          scannedAtInvocationStart,
        ),
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
      return;
    }

    const images = await prisma.sceneImage.findMany({
      where: {
        status: "completed",
        falTraces: { none: {} },
        scene: options.onlyProject
          ? { chapter: { projectId: options.onlyProject } }
          : undefined,
      },
      include: {
        scene: { include: { chapter: true } },
        falTraces: { orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (images.length === 0) {
      exhausted = true;
      break;
    }

    for (const image of images) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = image.id;

      const existingTrace = image.falTraces[0] ?? null;
      const metadata = extractMetadataObject(image.metadata);
      const generationLog = extractMetadataObject(metadata.generationLog);
      const refsUsed = extractStringArray(image.referenceImageIds);
      const details = {
        panelId: image.id,
        sceneId: image.sceneId,
        chapterId: image.scene.chapterId,
        projectId: image.scene.chapter.projectId,
        hasExistingTrace: Boolean(existingTrace),
        mode: modeFromReferences(image.referenceImageIds),
      };

      try {
        if (existingTrace) {
          phaseState.summary.skipped += 1;
          logEvent(PHASE, "fal trace already exists, skipping", details);
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          logEvent(PHASE, "would create fal trace", details);
        } else {
          await prisma.falTrace.create({
            data: {
              projectId: image.scene.chapter.projectId,
              chapterId: image.scene.chapterId,
              sceneId: image.sceneId,
              panelId: image.id,
              sceneKeyframeId: image.sceneKeyframeId,
              provider: image.provider ?? "fal",
              model: image.model ?? "unknown",
              mode: modeFromReferences(image.referenceImageIds),
              status: "completed",
              requestPayload: {
                prompt: image.prompt,
                negativePrompt: image.negativePrompt,
              } as Prisma.InputJsonValue,
              responsePayload: generationLog as Prisma.InputJsonValue,
              refsUsed: refsUsed as Prisma.InputJsonValue,
              lorasUsed: [] as Prisma.InputJsonValue,
              timings: {} as Prisma.InputJsonValue,
            },
          });
          phaseState.summary.created += 1;
          logEvent(PHASE, "created fal trace", details);
        }
      } catch (error) {
        phaseState.summary.errors += 1;
        console.error(`[backfill-hard-switch][${PHASE}] failed`, { ...details, error });
        throw error;
      } finally {
        await persistState(state, options);
      }
    }
  }

  await finalizePhaseRun(PHASE, exhausted, options, state);
}
