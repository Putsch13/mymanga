/**
 * Narrative pass — résolution de l'outline "approuvée" pour le bundle LLM.
 *
 * Extrait de narrative-pass.ts. Chaîne de priorité claire (B11) :
 *  - si premium outline présente → parseApprovedOutline OU legacy bridge
 *  - sinon si studio snapshot → legacy bridge OU parsed outline
 *  - sinon → parsed outline
 *
 * Pure : aucun effet de bord.
 */

import type { z } from "zod";
import {
  buildLegacyApprovedOutlineFromStudio,
  chapterStudioSnapshotSchema,
  parseApprovedOutline,
  resolveEffectiveProductionSource,
} from "@manga-ai-studio/core";

type StudioSnapshot = z.infer<typeof chapterStudioSnapshotSchema>;

export interface ResolvedStudioBundle {
  studioSnapshot: StudioSnapshot | null;
  productionSource: { source: string; fallbackUsed: boolean; legacyBridgeUsed: boolean };
  hasPremiumOutline: boolean;
  approvedOutlineForBundle: ReturnType<typeof parseApprovedOutline>;
}

export function resolveStudioBundle(chapterOutlineRecord: Record<string, unknown>): ResolvedStudioBundle {
  const studioSnapshotResult = chapterStudioSnapshotSchema.safeParse(chapterOutlineRecord.studio);
  const studioSnapshot = studioSnapshotResult.success ? studioSnapshotResult.data : null;
  const productionSource = studioSnapshot
    ? resolveEffectiveProductionSource(studioSnapshot)
    : { source: "missing", fallbackUsed: true, legacyBridgeUsed: true };

  const premiumProductionOutline = studioSnapshot?.data?.productionOutline;
  const hasPremiumOutline = Boolean(
    premiumProductionOutline &&
    typeof premiumProductionOutline === "object" &&
    "source" in premiumProductionOutline &&
    (premiumProductionOutline as { source?: string }).source !== "legacy_adapted" &&
    Array.isArray((premiumProductionOutline as { beats?: unknown[] }).beats) &&
    ((premiumProductionOutline as { beats?: unknown[] }).beats?.length ?? 0) > 0,
  );

  // B11: priorité claire selon ce qui est disponible côté studio vs legacy.
  const approvedOutlineForBundle = (() => {
    if (hasPremiumOutline) {
      return parseApprovedOutline(chapterOutlineRecord.approvedOutline)
        ?? buildLegacyApprovedOutlineFromStudio(studioSnapshot!);
    }
    if (studioSnapshot) {
      return buildLegacyApprovedOutlineFromStudio(studioSnapshot)
        ?? parseApprovedOutline(chapterOutlineRecord.approvedOutline);
    }
    return parseApprovedOutline(chapterOutlineRecord.approvedOutline);
  })();

  return {
    studioSnapshot,
    productionSource,
    hasPremiumOutline,
    approvedOutlineForBundle,
  };
}
