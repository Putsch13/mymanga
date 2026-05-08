/**
 * P7.2 — Dashboard "canon health" d'un projet.
 *
 * GET /api/projects/:id/canon-health
 *
 * Répond avec un inventaire structuré des faiblesses de continuité :
 *   - personnages sans ref primaire stable
 *   - personnages avec `visualLock` non-actif
 *   - personnages sans fingerprint
 *   - lieux récurrents sans ancre visuelle (`visualRefs` vide + pas de
 *     `canonImageUrl`)
 *   - panels dont le retry risque de tomber en fallback nom (manque
 *     `panelCast.focus.characterId` ou `metadata.characterIds`)
 *
 * Exposé aux UI studio / dashboard projet. Lecture seule, pas de mutation.
 */

import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getOwnedProject } from "@/lib/ownership";
import { notFound, unauthorized } from "@/lib/api-response";
import {
  computeCanonStabilityScore,
  extractStabilitySignals,
  type CanonStabilityLevel,
} from "@/lib/canon/compute-canon-stability-score";
import { resolveLocationVisualCanon } from "@manga-ai-studio/core";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";

type Ctx = { params: Promise<{ id: string }> };

type CharacterHealthRow = {
  characterId: string;
  name: string;
  roleType: string | null;
  score: number;
  level: CanonStabilityLevel;
  issues: string[];
};

type LocationHealthRow = {
  locationId: string;
  name: string;
  hasRefs: boolean;
  hasCanonImage: boolean;
  isCanonicalLocation: boolean;
  issues: string[];
};

type PanelHealthRow = {
  sceneImageId: string;
  panelNumber: number | null;
  chapterId: string;
  issues: string[];
};

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const project = await getOwnedProject(user.id, id);
  if (!project) return notFound();

  const [characters, locations, recentPanels] = await Promise.all([
    prisma.character.findMany({
      where: { projectId: id },
      select: {
        id: true,
        name: true,
        roleType: true,
        characterFingerprint: true,
        stableVisualDNA: true,
        outfitDefault: true,
        visualLocks: { select: { isActive: true } },
        visualRefs: {
          where: { archivedAt: null },
          select: { imageUrl: true, isPrimary: true },
        },
      },
    }),
    prisma.location.findMany({
      where: { projectId: id },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        visualBrief: true,
        establishedVisualBrief: true,
        canonImageUrl: true,
        visualRefs: true,
        canonLocked: true,
        metadata: true,
      },
    }),
    prisma.sceneImage.findMany({
      where: {
        scene: { chapter: { projectId: id } },
        status: "completed",
      },
      include: {
        scene: { select: { chapterId: true } },
      },
      orderBy: { panelNumber: "desc" },
      take: 200,
    }),
  ]);

  // ── Characters ──────────────────────────────────────────────────────────
  const characterRows: CharacterHealthRow[] = characters.map((c) => {
    const signals = extractStabilitySignals({
      characterFingerprint: c.characterFingerprint,
      stableVisualDNA: c.stableVisualDNA,
      outfitDefault: c.outfitDefault,
      visualLocks: c.visualLocks,
      visualRefs: c.visualRefs.map((r) => ({ imageUrl: r.imageUrl })),
      idFirstResolution: true, // optimiste : la canon-health ne peut pas tracer ça par perso
      recentDriftHardViolations: 0,
    });
    const { score, level, missing } = computeCanonStabilityScore(signals);
    const issues: string[] = [];
    for (const m of missing) {
      if (m === "hasStableCanonicalRef") issues.push("no_primary_visual_ref");
      if (m === "hasActiveVisualLock") issues.push("no_active_visual_lock");
      if (m === "hasFingerprint") issues.push("no_fingerprint");
      if (m === "hasHardTraits") issues.push("no_hard_traits");
      if (m === "hasDefaultOutfit") issues.push("no_default_outfit");
    }
    return {
      characterId: c.id,
      name: c.name,
      roleType: c.roleType ?? null,
      score,
      level,
      issues,
    };
  });

  // ── Locations ───────────────────────────────────────────────────────────
  const locationRows: LocationHealthRow[] = locations.map((loc) => {
    const resolved = resolveLocationVisualCanon(loc);
    const canonImageStable = Boolean(loc.canonImageUrl && isStableImageUrl(loc.canonImageUrl));
    const refsArray = Array.isArray(loc.visualRefs) ? (loc.visualRefs as unknown[]) : [];
    const issues: string[] = [];
    if (!canonImageStable && refsArray.length === 0) {
      issues.push("no_visual_anchor");
    }
    if (resolved.isCanonicalLocation && resolved.referenceAssets.length === 0) {
      issues.push("declared_canonical_but_no_refs");
    }
    if (!resolved.establishedBrief) {
      issues.push("no_established_brief");
    }
    return {
      locationId: loc.id,
      name: loc.name,
      hasRefs: resolved.referenceAssets.length > 0,
      hasCanonImage: canonImageStable,
      isCanonicalLocation: resolved.isCanonicalLocation,
      issues,
    };
  });

  // ── Panels (derniers 200 panels completés) ──────────────────────────────
  const panelRows: PanelHealthRow[] = [];
  for (const p of recentPanels) {
    const issues: string[] = [];
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const metaIds = Array.isArray(meta.characterIds)
      ? (meta.characterIds as unknown[]).filter((x) => typeof x === "string")
      : [];
    const cast = (p.panelCast ?? meta.panelCast) as {
      focus?: { characterId?: string | null } | null;
      supporting?: Array<{ characterId?: string | null }>;
    } | null;
    const castFocusId = cast?.focus?.characterId;
    const castSupportingIds = (cast?.supporting ?? []).map((s) => s?.characterId).filter(Boolean);
    const hasAnyId = Boolean(castFocusId) || castSupportingIds.length > 0 || metaIds.length > 0;
    if (!hasAnyId) issues.push("retry_would_fallback_to_name");
    const names = Array.isArray(meta.characters) ? (meta.characters as string[]) : [];
    if (names.length > 0 && !hasAnyId) issues.push(`${names.length}_named_chars_unresolved`);
    if (issues.length > 0) {
      panelRows.push({
        sceneImageId: p.id,
        panelNumber: typeof p.panelNumber === "number" ? p.panelNumber : null,
        chapterId: p.scene.chapterId,
        issues,
      });
    }
  }

  return NextResponse.json({
    projectId: id,
    summary: {
      charactersTotal: characterRows.length,
      charactersWeak: characterRows.filter((r) => r.score < 60).length,
      locationsTotal: locationRows.length,
      locationsWithoutVisualAnchor: locationRows.filter((r) => !r.hasRefs && !r.hasCanonImage).length,
      panelsWithRetryRisk: panelRows.length,
    },
    characters: characterRows.sort((a, b) => a.score - b.score),
    locations: locationRows,
    panels: panelRows.slice(0, 50),
  });
}
