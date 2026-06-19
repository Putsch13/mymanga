import { prisma, type Prisma } from "@manga-ai-studio/db";

/**
 * `@@unique([characterId, version])` on CharacterVisualLock is race-prone:
 * two concurrent generate-visual requests for the same character both read
 * `previousLock.version = N`, both try to insert `version = N+1`, one wins
 * and the other hits P2002. We wrap the whole transaction in a small retry
 * loop — on conflict we recompute the next version from a fresh read
 * inside the new transaction.
 */
const MAX_VISUAL_LOCK_RETRIES = 4;
const INITIAL_BACKOFF_MS = 40;

function isUniqueVersionConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; meta?: { target?: unknown } };
  if (anyErr.code !== "P2002") return false;
  const target = anyErr.meta?.target;
  const stringTargets = Array.isArray(target)
    ? (target as unknown[]).filter((x): x is string => typeof x === "string")
    : typeof target === "string"
      ? [target]
      : [];
  const joined = stringTargets.join(",");
  return (
    joined.includes("characterId") &&
    (joined.includes("version") || joined === "characterId,version")
  );
}

export interface VisualLockTransactionInput<T> {
  characterId: string;
  /**
   * The critical section: receives a live `nextVersion` computed inside the
   * transaction. Callers MUST use the provided version when inserting the
   * lock row (do not precompute it outside the tx).
   */
  run: (tx: Prisma.TransactionClient, nextVersion: number) => Promise<T>;
}

export async function createVisualLockWithRetry<T>(
  input: VisualLockTransactionInput<T>,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_VISUAL_LOCK_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Fresh read inside the transaction — if a parallel writer already
        // committed a new version, this observes it and bumps past it.
        const latest = await tx.characterVisualLock.findFirst({
          where: { characterId: input.characterId },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;
        return input.run(tx, nextVersion);
      });
    } catch (err) {
      lastError = err;
      if (!isUniqueVersionConflict(err)) throw err;
      // Exponential backoff with tiny jitter. We stay short because this
      // contention window is only during a single user's double-click.
      const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 20);
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
  throw lastError ?? new Error("createVisualLockWithRetry: unknown failure");
}

export const __visualLockRetryTesting = {
  isUniqueVersionConflict,
  MAX_VISUAL_LOCK_RETRIES,
};
