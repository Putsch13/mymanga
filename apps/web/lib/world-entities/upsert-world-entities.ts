/**
 * Upsert d'entités "monde" (NpcGroup, WorldProp) au niveau projet.
 *
 * Stratégie USER-WINS :
 *   - Si l'entité n'existe pas → on la crée avec les valeurs IA.
 *   - Si elle existe et `userEdited = true` → on N'ÉCRASE RIEN, on incrémente
 *     juste `appearanceCount` (et on log qu'on a vu une nouvelle référence).
 *   - Si elle existe et `userEdited = false` → on met à jour les champs
 *     uniquement si la nouvelle valeur est non-vide ET différente
 *     (pour éviter de re-flagguer dirty pour rien).
 *
 * Cette fonction est appelée par la route /intent-compile et peut aussi être
 * appelée par un job de re-extraction. Elle est idempotente.
 */

import { prisma } from "@manga-ai-studio/db";
import {
  slugifyLabel,
  type ExtractedNpcGroup,
  type ExtractedWorldProp,
} from "@manga-ai-studio/ai";

export interface UpsertWorldEntitiesInput {
  projectId: string;
  /** Optionnel : trace l'origine d'apparition. */
  chapterId?: string | null;
  /** Source de la détection ("intent_compile_llm", "wizard_sync", "manual"…). */
  source?: string;
  npcGroups: ExtractedNpcGroup[];
  worldProps: ExtractedWorldProp[];
}

export interface UpsertWorldEntitiesResult {
  npcGroupsCreated: number;
  npcGroupsUpdated: number;
  npcGroupsSkippedUserEdited: number;
  worldPropsCreated: number;
  worldPropsUpdated: number;
  worldPropsSkippedUserEdited: number;
  /** Slugs finaux après upsert, pour passer ensuite au pipeline. */
  npcGroupSlugs: string[];
  worldPropSlugs: string[];
}

function pickIfChanged<T extends string | null | undefined>(
  newVal: T,
  existing: T,
): T | undefined {
  if (newVal == null || newVal === "") return undefined;
  if (existing === newVal) return undefined;
  return newVal;
}

export async function upsertWorldEntities(
  input: UpsertWorldEntitiesInput,
): Promise<UpsertWorldEntitiesResult> {
  const result: UpsertWorldEntitiesResult = {
    npcGroupsCreated: 0,
    npcGroupsUpdated: 0,
    npcGroupsSkippedUserEdited: 0,
    worldPropsCreated: 0,
    worldPropsUpdated: 0,
    worldPropsSkippedUserEdited: 0,
    npcGroupSlugs: [],
    worldPropSlugs: [],
  };

  const source = input.source ?? "intent_compile_llm";

  // --- NpcGroups -----------------------------------------------------------
  for (const g of input.npcGroups) {
    const slug = slugifyLabel(g.label);
    if (!slug) continue;

    const existing = await prisma.npcGroup.findUnique({
      where: { projectId_slug: { projectId: input.projectId, slug } },
    });

    if (!existing) {
      await prisma.npcGroup.create({
        data: {
          projectId: input.projectId,
          slug,
          label: g.label,
          description: g.description ?? null,
          visualProfile: g.visualProfile ?? null,
          outfit: g.outfit ?? null,
          silhouette: g.silhouette ?? null,
          source,
          firstSeenChapterId: input.chapterId ?? null,
          appearanceCount: 1,
        },
      });
      result.npcGroupsCreated++;
      result.npcGroupSlugs.push(slug);
      continue;
    }

    if (existing.userEdited) {
      // USER-WINS : on n'écrase RIEN. On incrémente juste le compteur.
      await prisma.npcGroup.update({
        where: { id: existing.id },
        data: { appearanceCount: { increment: 1 } },
      });
      result.npcGroupsSkippedUserEdited++;
      result.npcGroupSlugs.push(slug);
      continue;
    }

    // Pas édité : enrichir uniquement les champs vides ou différents non-null.
    const patch: Record<string, unknown> = {
      appearanceCount: { increment: 1 },
    };
    const labelChanged = pickIfChanged(g.label, existing.label);
    if (labelChanged) patch.label = labelChanged;
    const descChanged = pickIfChanged(g.description ?? null, existing.description);
    if (descChanged !== undefined) patch.description = descChanged;
    const visualChanged = pickIfChanged(g.visualProfile ?? null, existing.visualProfile);
    if (visualChanged !== undefined) patch.visualProfile = visualChanged;
    const outfitChanged = pickIfChanged(g.outfit ?? null, existing.outfit);
    if (outfitChanged !== undefined) patch.outfit = outfitChanged;
    const silChanged = pickIfChanged(g.silhouette ?? null, existing.silhouette);
    if (silChanged !== undefined) patch.silhouette = silChanged;

    await prisma.npcGroup.update({
      where: { id: existing.id },
      data: patch,
    });
    result.npcGroupsUpdated++;
    result.npcGroupSlugs.push(slug);
  }

  // --- WorldProps ----------------------------------------------------------
  for (const p of input.worldProps) {
    const slug = slugifyLabel(p.label);
    if (!slug) continue;

    const existing = await prisma.worldProp.findUnique({
      where: { projectId_slug: { projectId: input.projectId, slug } },
    });

    if (!existing) {
      await prisma.worldProp.create({
        data: {
          projectId: input.projectId,
          slug,
          label: p.label,
          description: p.description ?? null,
          visualDescription: p.visualDescription ?? null,
          kind: p.kind ?? "other",
          narrativeWeight: p.narrativeWeight ?? "recurring",
          source,
          firstSeenChapterId: input.chapterId ?? null,
          appearanceCount: 1,
        },
      });
      result.worldPropsCreated++;
      result.worldPropSlugs.push(slug);
      continue;
    }

    if (existing.userEdited) {
      await prisma.worldProp.update({
        where: { id: existing.id },
        data: { appearanceCount: { increment: 1 } },
      });
      result.worldPropsSkippedUserEdited++;
      result.worldPropSlugs.push(slug);
      continue;
    }

    const patch: Record<string, unknown> = {
      appearanceCount: { increment: 1 },
    };
    const labelChanged = pickIfChanged(p.label, existing.label);
    if (labelChanged) patch.label = labelChanged;
    const descChanged = pickIfChanged(p.description ?? null, existing.description);
    if (descChanged !== undefined) patch.description = descChanged;
    const visChanged = pickIfChanged(p.visualDescription ?? null, existing.visualDescription);
    if (visChanged !== undefined) patch.visualDescription = visChanged;
    if (p.kind && p.kind !== existing.kind) patch.kind = p.kind;
    if (p.narrativeWeight && p.narrativeWeight !== existing.narrativeWeight) {
      patch.narrativeWeight = p.narrativeWeight;
    }

    await prisma.worldProp.update({
      where: { id: existing.id },
      data: patch,
    });
    result.worldPropsUpdated++;
    result.worldPropSlugs.push(slug);
  }

  return result;
}

/**
 * Lit les entités monde d'un projet pour les passer au pipeline.
 * Utilisé par le composer visuel et le dialoguiste.
 */
export async function readProjectWorldEntities(projectId: string): Promise<{
  npcGroups: Array<{
    id: string;
    slug: string;
    label: string;
    description: string | null;
    visualProfile: string | null;
    outfit: string | null;
    silhouette: string | null;
    userEdited: boolean;
  }>;
  worldProps: Array<{
    id: string;
    slug: string;
    label: string;
    description: string | null;
    visualDescription: string | null;
    kind: string;
    narrativeWeight: string;
    userEdited: boolean;
  }>;
}> {
  const [npcGroups, worldProps] = await Promise.all([
    prisma.npcGroup.findMany({
      where: { projectId },
      orderBy: [{ appearanceCount: "desc" }, { createdAt: "asc" }],
    }),
    prisma.worldProp.findMany({
      where: { projectId },
      orderBy: [{ appearanceCount: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  return {
    npcGroups: npcGroups.map((g) => ({
      id: g.id,
      slug: g.slug,
      label: g.label,
      description: g.description,
      visualProfile: g.visualProfile,
      outfit: g.outfit,
      silhouette: g.silhouette,
      userEdited: g.userEdited,
    })),
    worldProps: worldProps.map((p) => ({
      id: p.id,
      slug: p.slug,
      label: p.label,
      description: p.description,
      visualDescription: p.visualDescription,
      kind: p.kind,
      narrativeWeight: p.narrativeWeight,
      userEdited: p.userEdited,
    })),
  };
}
