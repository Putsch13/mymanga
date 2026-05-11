/**
 * Phase 3 — Crée un `SceneKeyframe` pour chaque scène orpheline et
 * raccroche les `SceneImage` qui n'avaient pas de keyframe.
 */
import { prisma, Prisma } from "../../../src/index";
import type { BackfillState, CliOptions, PhaseName } from "../types";
import {
  extractMetadataObject,
  extractStringArray,
  logEvent,
  remainingTake,
  scannedThisInvocation,
} from "../utils";
import { persistState } from "../state";
import {
  buildPaginationArgs,
  finalizePhaseRun,
  preparePhaseRun,
} from "../phase-runner";

const PHASE: PhaseName = "scene-keyframes";

export async function runSceneKeyframesPhase(
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

    const scenes = await prisma.chapterScene.findMany({
      where: {
        chapter: options.onlyProject ? { projectId: options.onlyProject } : undefined,
        OR: [
          { keyframes: { none: {} } },
          { images: { some: { sceneKeyframeId: null } } },
        ],
      },
      include: {
        images: {
          orderBy: { panelNumber: "asc" },
          take: 1,
          select: { id: true, imageUrl: true, mediaAssetId: true, panelNumber: true },
        },
        chapter: true,
        keyframes: {
          orderBy: [{ selected: "desc" }, { version: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            version: true,
            selected: true,
            imageAssetId: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (scenes.length === 0) {
      exhausted = true;
      break;
    }

    for (const scene of scenes) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = scene.id;

      const existingKeyframe = scene.keyframes[0] ?? null;
      const firstImage = scene.images[0] ?? null;
      const metadata = extractMetadataObject(scene.metadata);
      const characters = extractStringArray(metadata.characters);
      const orphanPanelCount = await prisma.sceneImage.count({
        where: { sceneId: scene.id, sceneKeyframeId: null },
      });
      const details = {
        sceneId: scene.id,
        chapterId: scene.chapterId,
        projectId: scene.chapter.projectId,
        hasExistingKeyframe: Boolean(existingKeyframe),
        sourceImageId: firstImage?.id ?? null,
        orphanPanelCount,
      };

      try {
        if (existingKeyframe && orphanPanelCount === 0) {
          phaseState.summary.skipped += 1;
          logEvent(PHASE, "scene keyframe already exists, skipping", details);
        } else if (options.dryRun) {
          if (existingKeyframe) {
            phaseState.summary.wouldUpdate += orphanPanelCount;
            logEvent(PHASE, "would repair orphan panels using existing keyframe", {
              ...details,
              keyframeId: existingKeyframe.id,
            });
          } else {
            phaseState.summary.wouldCreate += 1;
            phaseState.summary.wouldUpdate += orphanPanelCount;
            logEvent(PHASE, "would create scene keyframe and attach orphan panels", details);
          }
        } else {
          const result = await prisma.$transaction(async (tx) => {
            let repairTarget = existingKeyframe;

            if (!repairTarget) {
              repairTarget = await tx.sceneKeyframe.create({
                data: {
                  projectId: scene.chapter.projectId,
                  chapterId: scene.chapterId,
                  sceneId: scene.id,
                  version: 1,
                  selected: true,
                  imageAssetId: firstImage?.mediaAssetId ?? null,
                  imageUrl: firstImage?.imageUrl ?? null,
                  involvedCharacterIds: characters as Prisma.InputJsonValue,
                  environmentLock: {
                    summary: scene.summary,
                    location:
                      typeof metadata.location === "string" ? metadata.location : null,
                  } as Prisma.InputJsonValue,
                  compositionArchetype: "backfilled_scene",
                  metadata: {
                    backfilled: true,
                    sourceImageId: firstImage?.id ?? null,
                    imageSourcePolicy: firstImage?.mediaAssetId
                      ? "asset_primary_with_url_fallback"
                      : "legacy_url_fallback_only",
                  } as Prisma.InputJsonValue,
                },
                select: {
                  id: true,
                  version: true,
                  selected: true,
                  imageAssetId: true,
                  imageUrl: true,
                },
              });
            }

            const updatedImages = await tx.sceneImage.updateMany({
              where: { sceneId: scene.id, sceneKeyframeId: null },
              data: { sceneKeyframeId: repairTarget.id },
            });

            return {
              keyframe: repairTarget,
              created: existingKeyframe ? 0 : 1,
              updated: updatedImages.count,
            };
          });

          phaseState.summary.created += result.created;
          phaseState.summary.updated += result.updated;
          logEvent(
            PHASE,
            existingKeyframe
              ? "repaired orphan panels using existing keyframe"
              : "created scene keyframe",
            {
              ...details,
              keyframeId: result.keyframe.id,
              updatedPanels: result.updated,
            },
          );
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
