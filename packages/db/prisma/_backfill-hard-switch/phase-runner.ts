/**
 * Helpers communs aux 4 phases du backfill :
 *   - reconciliation entre l'état persisté et la DB,
 *   - clauses de pagination communes,
 *   - finalisation (vérifie qu'il ne reste plus rien à traiter).
 */
import { prisma } from "../../src/index";
import type { BackfillState, CliOptions, PhaseName } from "./types";
import { logEvent } from "./utils";
import { persistState } from "./state";

export function shouldRunPhase(options: CliOptions, phase: PhaseName): boolean {
  return options.phases == null || options.phases.includes(phase);
}

export async function countRemainingPhaseItems(
  phase: PhaseName,
  options: CliOptions,
): Promise<number> {
  switch (phase) {
    case "media-assets":
      return prisma.characterVisualRef.count({
        where: {
          mediaAssetId: null,
          character: options.onlyProject ? { projectId: options.onlyProject } : undefined,
        },
      });
    case "character-locks":
      return prisma.character.count({
        where: {
          projectId: options.onlyProject ?? undefined,
          visualLocks: { none: { isActive: true } },
          visualRefs: { some: {} },
        },
      });
    case "scene-keyframes":
      return prisma.chapterScene.count({
        where: {
          chapter: options.onlyProject ? { projectId: options.onlyProject } : undefined,
          OR: [
            { keyframes: { none: {} } },
            { images: { some: { sceneKeyframeId: null } } },
          ],
        },
      });
    case "fal-traces":
      return prisma.sceneImage.count({
        where: {
          status: "completed",
          falTraces: { none: {} },
          scene: options.onlyProject
            ? { chapter: { projectId: options.onlyProject } }
            : undefined,
        },
      });
  }
}

export async function preparePhaseRun(
  phase: PhaseName,
  options: CliOptions,
  state: BackfillState,
): Promise<boolean> {
  const phaseState = state.phases[phase];
  if (!shouldRunPhase(options, phase)) {
    logEvent(phase, "phase not selected, skipping");
    return false;
  }

  if (options.reconcile) {
    const remaining = await countRemainingPhaseItems(phase, options);
    if (remaining > 0) {
      const previousCursor = phaseState.lastCursor;
      phaseState.lastCursor = null;
      if (phaseState.completed) {
        phaseState.completed = false;
      }
      logEvent(phase, "reconciled phase state against live DB", {
        remaining,
        previousCursor,
        cumulativeScanned: phaseState.summary.scanned,
      });
      await persistState(state, options);
    }
  }

  if (phaseState.completed) {
    logEvent(phase, "already completed, skipping");
    return false;
  }

  return true;
}

export async function finalizePhaseRun(
  phase: PhaseName,
  exhausted: boolean,
  options: CliOptions,
  state: BackfillState,
): Promise<void> {
  const remaining = await countRemainingPhaseItems(phase, options);
  state.phases[phase].completed = exhausted && remaining === 0;
  if (exhausted && remaining > 0) {
    logEvent(phase, "phase appeared exhausted but remaining items still exist", {
      remaining,
      lastCursor: state.phases[phase].lastCursor,
    });
  }
  await persistState(state, options);
}

export function buildPaginationArgs(
  options: CliOptions,
  lastCursor: string | null,
): { cursor: { id: string }; skip: 1 } | Record<string, never> {
  if (!options.dryRun || !lastCursor) {
    return {};
  }
  return { cursor: { id: lastCursor }, skip: 1 } as const;
}
