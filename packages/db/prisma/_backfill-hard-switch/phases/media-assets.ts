/**
 * Phase 1 — Création / liaison des `MediaAsset` pour les
 * `CharacterVisualRef` qui n'en ont pas encore.
 */
import { prisma, Prisma } from "../../../src/index";
import type { BackfillState, CliOptions, PhaseName } from "../types";
import { logEvent, remainingTake, scannedThisInvocation } from "../utils";
import { persistState } from "../state";
import {
  buildPaginationArgs,
  finalizePhaseRun,
  preparePhaseRun,
} from "../phase-runner";

const PHASE: PhaseName = "media-assets";

export async function runMediaAssetsPhase(
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

    const refs = await prisma.characterVisualRef.findMany({
      where: {
        mediaAssetId: null,
        character: options.onlyProject ? { projectId: options.onlyProject } : undefined,
      },
      include: { character: true },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (refs.length === 0) {
      exhausted = true;
      break;
    }

    for (const ref of refs) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = ref.id;

      const existingAssets = await prisma.mediaAsset.findMany({
        where: {
          projectId: ref.character.projectId,
          type: "character_ref",
          ownerType: "character_visual_ref",
          ownerId: ref.id,
        },
        orderBy: { createdAt: "asc" },
        take: 2,
      });
      const existingAsset = existingAssets[0] ?? null;

      const details = {
        refId: ref.id,
        characterId: ref.characterId,
        projectId: ref.character.projectId,
        hasExistingAsset: Boolean(existingAsset),
        matchingAssetCount: existingAssets.length,
      };

      try {
        if (existingAssets.length > 1) {
          phaseState.summary.warnings += 1;
          logEvent(PHASE, "multiple candidate assets found, using oldest match", details);
        }
        if (existingAsset) {
          if (ref.mediaAssetId !== existingAsset.id) {
            if (options.dryRun) {
              phaseState.summary.wouldUpdate += 1;
              logEvent(PHASE, "would link existing media asset", details);
            } else {
              await prisma.characterVisualRef.update({
                where: { id: ref.id },
                data: { mediaAssetId: existingAsset.id },
              });
              phaseState.summary.updated += 1;
              logEvent(PHASE, "linked existing media asset", {
                ...details,
                mediaAssetId: existingAsset.id,
              });
            }
          } else {
            phaseState.summary.skipped += 1;
            logEvent(PHASE, "already linked, skipping", details);
          }
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          phaseState.summary.wouldUpdate += 1;
          logEvent(PHASE, "would create media asset and link ref", details);
        } else {
          const asset = await prisma.mediaAsset.create({
            data: {
              projectId: ref.character.projectId,
              characterId: ref.characterId,
              type: "character_ref",
              origin: "generated",
              ownerType: "character_visual_ref",
              ownerId: ref.id,
              storageProvider: "supabase",
              publicUrl: ref.imageUrl,
              metadata: {
                backfilled: true,
                sourceRefId: ref.id,
                refType: ref.type,
              } as Prisma.InputJsonValue,
            },
          });
          await prisma.characterVisualRef.update({
            where: { id: ref.id },
            data: { mediaAssetId: asset.id },
          });
          phaseState.summary.created += 1;
          phaseState.summary.updated += 1;
          logEvent(PHASE, "created media asset and linked ref", {
            ...details,
            mediaAssetId: asset.id,
          });
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
