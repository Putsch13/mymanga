import type { Prisma, PrismaClient } from "@manga-ai-studio/db";

export interface RecurringNpcSummary {
  stableNpcId: string;
  label: string;
  role: string | null;
  shortVisualCore: string;
  outfitSignature: string | null;
  silhouetteSignature: string | null;
  appearanceCount: number;
  promotionStatus: string;
  speciesLabel: string | null;
}

/** Charge tous les NPC promus (recurring + important) d'un projet. */
export async function loadProjectRecurringNpcs(
  prisma: PrismaClient | Prisma.TransactionClient,
  projectId: string,
): Promise<RecurringNpcSummary[]> {
  const profiles = await prisma.npcVisualProfile.findMany({
    where: {
      projectId,
      promotionStatus: { in: ["promoted", "locked"] },
    },
    orderBy: { appearanceCount: "desc" },
    take: 20,
  });

  return profiles.map((p) => ({
    stableNpcId: p.stableNpcId,
    label: p.role ?? "PNJ récurrent",
    role: p.role,
    shortVisualCore: p.shortVisualCore,
    outfitSignature: p.outfitSignature,
    silhouetteSignature: p.silhouetteSignature,
    appearanceCount: p.appearanceCount,
    promotionStatus: p.promotionStatus,
    speciesLabel: (p as { speciesLabel?: string | null }).speciesLabel ?? null,
  }));
}
