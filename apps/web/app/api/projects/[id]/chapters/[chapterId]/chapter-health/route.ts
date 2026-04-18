/**
 * P5.1 — Chapter health dashboard.
 *
 * GET /api/projects/:id/chapters/:chapterId/chapter-health
 *
 * Agrège la santé visuelle et narrative d'un chapitre, spécifiquement depuis
 * l'angle "contrat premium" (vs panels DB brut) :
 *   - pourcentage de panels qui trahissent le contrat premium (focus / prop /
 *     npc / cutaway / dialogue anchor)
 *   - panels sans contract propagé du tout (metadata.panelContract vide)
 *   - panels dont le focus a collapsé vers le héros
 *   - panels avec props obligatoires invisibles
 *   - panels crowd attendus mais vides
 *
 * But produit : le studio affiche la santé visuelle en termes narratifs (pas
 * juste "Y panels générés / X prévus"), et peut lancer une auto-réparation
 * ciblée panel par panel.
 */

import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import {
  PREMIUM_BREACH_TYPES,
  classifyPremiumBreach,
  type PremiumBreachType,
  type PremiumRepairMode,
} from "@/lib/retry/classify-premium-repair";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type PanelHealthRow = {
  sceneImageId: string;
  panelNumber: number;
  status: string;
  hasContract: boolean;
  contractualCritical: boolean;
  breaches: Array<{
    type: PremiumBreachType;
    repairMode: PremiumRepairMode;
  }>;
  heroCollapsed: boolean;
  propMissing: boolean;
  crowdExpectedButEmpty: boolean;
};

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId, project: { userId: user.id } },
    include: {
      scenes: {
        orderBy: { sceneNumber: "asc" },
        include: { images: { orderBy: { panelNumber: "asc" } } },
      },
    },
  });
  if (!chapter) return notFound();

  const rows: PanelHealthRow[] = [];
  for (const scene of chapter.scenes) {
    for (const image of scene.images) {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const panelContract = asRecord(meta.panelContract);
      const premiumBlueprint = asRecord(meta.premiumBlueprint);
      const hasContract = Object.keys(panelContract).length > 0;
      const contractualCritical =
        Boolean(panelContract.contractualCritical) ||
        Boolean(premiumBlueprint.contractualCritical);

      const issues = Array.isArray(validationDetails.issues)
        ? (validationDetails.issues as Array<{ type?: string }>)
        : [];
      const breaches = issues
        .map((i) => (typeof i.type === "string" ? i.type : null))
        .filter((t): t is PremiumBreachType =>
          t != null && (PREMIUM_BREACH_TYPES as readonly string[]).includes(t),
        )
        .map((type) => ({ type, repairMode: classifyPremiumBreach(type) }));

      const heroCollapsed = breaches.some(
        (b) => b.type === "cutaway_collapsed_to_hero" || b.type === "wrong_cutaway_target",
      );
      const propMissing = breaches.some(
        (b) =>
          b.type === "missing_prop" ||
          b.type === "missing_weapon" ||
          b.type === "missing_device" ||
          b.type === "object_used_but_not_visible",
      );
      const crowdExpectedButEmpty =
        Number(panelContract.requiredNpcCount ?? 0) > 0 &&
        breaches.some((b) => b.type === "npc_population_missing");

      if (!hasContract || breaches.length > 0) {
        rows.push({
          sceneImageId: image.id,
          panelNumber: image.panelNumber,
          status: image.status,
          hasContract,
          contractualCritical,
          breaches,
          heroCollapsed,
          propMissing,
          crowdExpectedButEmpty,
        });
      }
    }
  }

  // Regroupements par catégorie pour la vue studio (P5.2)
  const grouped = {
    focus: rows.filter((r) => r.breaches.some((b) => b.repairMode === "subject_focus")),
    cutaway: rows.filter((r) => r.breaches.some((b) => b.repairMode === "cutaway")),
    props: rows.filter((r) => r.propMissing),
    enemy: rows.filter((r) => r.breaches.some((b) => b.repairMode === "enemy_presence")),
    npc: rows.filter((r) => r.breaches.some((b) => b.repairMode === "npc_population")),
    dialogue: rows.filter((r) => r.breaches.some((b) => b.repairMode === "speaker")),
    heroCollapsed: rows.filter((r) => r.heroCollapsed),
    noContract: rows.filter((r) => !r.hasContract),
  };

  const totalPanels = chapter.scenes.reduce((acc, s) => acc + s.images.length, 0);
  const breachedCount = rows.filter((r) => r.breaches.length > 0).length;
  const contractualCriticalBreached = rows.filter(
    (r) => r.contractualCritical && r.breaches.length > 0,
  ).length;
  const breachRatio = totalPanels > 0 ? breachedCount / totalPanels : 0;

  return NextResponse.json({
    projectId,
    chapterId,
    summary: {
      totalPanels,
      breachedPanels: breachedCount,
      breachRatio,
      contractualCriticalBreached,
      panelsWithoutContract: grouped.noContract.length,
      heroCollapsedPanels: grouped.heroCollapsed.length,
      propMissingPanels: grouped.props.length,
      crowdMissingPanels: grouped.npc.length,
    },
    rows,
    grouped,
  });
}
