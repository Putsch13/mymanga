/**
 * Petits helpers neutres (pas de Prisma) pour le backfill.
 */
import { DEFAULT_BATCH_SIZE, type PhaseName, type PhaseSummary } from "./types";

export function compact(parts: Array<string | null | undefined>): string[] {
  return parts.filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
}

export function emptySummary(): PhaseSummary {
  return {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    wouldCreate: 0,
    wouldUpdate: 0,
    warnings: 0,
    errors: 0,
  };
}

export function logEvent(
  phase: PhaseName,
  message: string,
  details?: Record<string, unknown>,
): void {
  const prefix = `[backfill-hard-switch][${phase}]`;
  if (details) {
    console.log(`${prefix} ${message}`, JSON.stringify(details));
    return;
  }
  console.log(`${prefix} ${message}`);
}

export function extractMetadataObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function extractStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function modeFromReferences(referenceImageIds: unknown): "img2img" | "text2img" {
  return Array.isArray(referenceImageIds) && referenceImageIds.length > 0
    ? "img2img"
    : "text2img";
}

export function computeNextCharacterLockVersion(existingVersions: number[]): number {
  const maxVersion = existingVersions.reduce(
    (max, version) => Math.max(max, version),
    0,
  );
  return maxVersion + 1;
}

export function scannedThisInvocation(
  totalScanned: number,
  scannedAtInvocationStart: number,
): number {
  return Math.max(0, totalScanned - scannedAtInvocationStart);
}

export function remainingTake(
  limit: number | null,
  scannedAtInvocationStart: number,
  totalScanned: number,
): number {
  const processedThisInvocation = scannedThisInvocation(
    totalScanned,
    scannedAtInvocationStart,
  );
  if (limit == null) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(0, Math.min(DEFAULT_BATCH_SIZE, limit - processedThisInvocation));
}
