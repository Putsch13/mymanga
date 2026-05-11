/**
 * Phase 2 — Création d'un `CharacterVisualLock` actif pour chaque
 * personnage qui a au moins une référence visuelle mais aucun lock.
 */
import { prisma, Prisma } from "../../../src/index";
import type { BackfillState, CliOptions, PhaseName } from "../types";
import {
  compact,
  computeNextCharacterLockVersion,
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

const PHASE: PhaseName = "character-locks";

export async function runCharacterLocksPhase(
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

    const characters = await prisma.character.findMany({
      where: {
        projectId: options.onlyProject ?? undefined,
        visualLocks: { none: { isActive: true } },
        visualRefs: { some: {} },
      },
      include: {
        visualRefs: { orderBy: { createdAt: "desc" }, take: 1 },
        visualLocks: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
      },
      orderBy: { id: "asc" },
      take,
      ...buildPaginationArgs(options, phaseState.lastCursor),
    });

    if (characters.length === 0) {
      exhausted = true;
      break;
    }

    for (const character of characters) {
      phaseState.summary.scanned += 1;
      phaseState.lastCursor = character.id;

      const existingLock = character.visualLocks.find((lock) => lock.isActive) ?? null;
      const nextVersion = computeNextCharacterLockVersion(
        character.visualLocks.map((lock) => lock.version),
      );
      const primaryRef = character.visualRefs[0] ?? null;
      const details = {
        characterId: character.id,
        projectId: character.projectId,
        hasExistingActiveLock: Boolean(existingLock),
        primaryRefId: primaryRef?.id ?? null,
        nextVersion,
      };

      try {
        if (existingLock) {
          phaseState.summary.skipped += 1;
          logEvent(PHASE, "active lock already exists, skipping", details);
        } else if (!primaryRef) {
          phaseState.summary.warnings += 1;
          phaseState.summary.skipped += 1;
          logEvent(PHASE, "missing primary ref, skipping ambiguous character", details);
        } else if (options.dryRun) {
          phaseState.summary.wouldCreate += 1;
          logEvent(PHASE, "would create active character lock", details);
        } else {
          await prisma.characterVisualLock.create({
            data: {
              projectId: character.projectId,
              characterId: character.id,
              version: nextVersion,
              isActive: true,
              displayName: character.name,
              shortVisualCore: compact([
                character.roleType,
                character.hairColor ? `${character.hairColor} hair` : null,
                character.eyeColor ? `${character.eyeColor} eyes` : null,
                character.outfitDefault,
              ]).join(", "),
              canonicalRefUrls: primaryRef ? [primaryRef.imageUrl] : [],
              defaultOutfit: character.outfitDefault,
              currentState: {
                emotionalState: character.emotionalState,
                status: character.status,
              } as Prisma.InputJsonValue,
              metadata: {
                backfilled: true,
                sourceVisualRefId: primaryRef.id,
              } as Prisma.InputJsonValue,
            },
          });
          phaseState.summary.created += 1;
          logEvent(PHASE, "created active character lock", details);
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
