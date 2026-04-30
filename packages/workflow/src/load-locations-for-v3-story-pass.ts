import { prisma } from "@manga-ai-studio/db";
import {
  toComposeVisualWorldKnownLocation,
  type ComposeKnownLocationDbRow,
  type ComposeVisualWorldContractInput,
  type StoryArchitectLocationInput,
} from "@manga-ai-studio/ai";

/** Lieu résolu pour le story-pass v3 (fiche projet ou secours studio). */
function normalizeLocationAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export interface PremiumV3PipelineLocation {
  id: string;
  name: string;
  visualDNA?: Record<string, unknown> | null;
}

/** Passe les fiches lieu DB au story architect LLM (décors IA-first, pas seulement id+nom). */
export function premiumV3PipelineLocationsToStoryArchitectLocations(
  locs: PremiumV3PipelineLocation[],
): StoryArchitectLocationInput[] {
  return locs.map((loc) => {
    const vd =
      loc.visualDNA && typeof loc.visualDNA === "object" && !Array.isArray(loc.visualDNA)
        ? (loc.visualDNA as Record<string, unknown>)
        : {};
    const type = typeof vd.type === "string" ? vd.type : null;
    const description = typeof vd.description === "string" ? vd.description : null;
    const visualBrief = typeof vd.visualBrief === "string" ? vd.visualBrief : null;
    const establishedVisualBrief =
      typeof vd.establishedVisualBrief === "string" ? vd.establishedVisualBrief : null;
    const canonLocked = typeof vd.canonLocked === "boolean" ? vd.canonLocked : null;
    const aliases = Array.isArray(vd.aliases)
      ? vd.aliases.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    return {
      id: loc.id,
      name: loc.name,
      type,
      description,
      visualBrief,
      establishedVisualBrief,
      canonLocked,
      aliases: aliases.length > 0 ? aliases : undefined,
    };
  });
}

/**
 * Résout les lieux projet pour le story architect (v3) à partir des IDs studio.
 * Préserve l’ordre des `locationIds` ; les IDs absents en base reçoivent un nom
 * de secours explicite plutôt que de disparaître du prompt.
 */
export async function loadLocationsForV3StoryPass(input: {
  projectId: string;
  locationIds: string[];
}): Promise<PremiumV3PipelineLocation[]> {
  const ids = [...new Set(input.locationIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return [];

  const rows = await prisma.location.findMany({
    where: { projectId: input.projectId, id: { in: ids } },
    select: {
      id: true,
      name: true,
      type: true,
      aliases: true,
      metadata: true,
      visualBrief: true,
      establishedVisualBrief: true,
      description: true,
      canonImageUrl: true,
      canonLocked: true,
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) {
      console.warn(
        `[pipeline:v3:locations] location_id_not_found projectId=${input.projectId} locationId=${id} — placeholder utilisé pour le story-pass`,
      );
      return {
        id,
        name: `Lieu (référence ${id.slice(0, 8)}…)`,
        visualDNA: { unresolved: true as const, requestedId: id },
      };
    }
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    return {
      id: row.id,
      name: row.name,
      visualDNA: {
        type: row.type ?? null,
        aliases: normalizeLocationAliases(row.aliases),
        metadata: meta,
        visualBrief: row.visualBrief ?? null,
        establishedVisualBrief: row.establishedVisualBrief ?? null,
        description: row.description ?? null,
        canonImageUrl: row.canonImageUrl ?? null,
        canonLocked: row.canonLocked ?? null,
      },
    };
  });
}

/** Recompose une entrée `knownLocations` pour le compositeur / discovery à partir du lieu v3. */
export function v3PipelineLocationToComposeKnownRow(
  loc: PremiumV3PipelineLocation,
): ComposeKnownLocationDbRow {
  const vd =
    loc.visualDNA && typeof loc.visualDNA === "object" && !Array.isArray(loc.visualDNA)
      ? (loc.visualDNA as Record<string, unknown>)
      : {};
  const meta =
    vd.metadata && typeof vd.metadata === "object" && !Array.isArray(vd.metadata)
      ? (vd.metadata as Record<string, unknown>)
      : null;
  return {
    id: loc.id,
    name: loc.name?.trim() ? loc.name : loc.id,
    description: typeof vd.description === "string" ? vd.description : null,
    visualBrief: typeof vd.visualBrief === "string" ? vd.visualBrief : null,
    establishedVisualBrief:
      typeof vd.establishedVisualBrief === "string" ? vd.establishedVisualBrief : null,
    canonImageUrl: typeof vd.canonImageUrl === "string" ? vd.canonImageUrl : null,
    canonLocked: typeof vd.canonLocked === "boolean" ? vd.canonLocked : null,
    type: typeof vd.type === "string" ? vd.type : null,
    metadata: meta,
    visualRefs: vd.visualRefs,
  };
}

export function v3PipelineLocationsToKnownLocations(
  locs: PremiumV3PipelineLocation[],
): ComposeVisualWorldContractInput["knownLocations"] {
  return locs.map((loc) => toComposeVisualWorldKnownLocation(v3PipelineLocationToComposeKnownRow(loc)));
}

/** Fiche lieu pour le canon-resolver (description = fusion brief DB). */
export function v3PipelineLocationToResolverUserLocation(loc: PremiumV3PipelineLocation): {
  id: string;
  name: string;
  description: string | null;
} {
  const kn = toComposeVisualWorldKnownLocation(v3PipelineLocationToComposeKnownRow(loc));
  return { id: kn.id, name: kn.name, description: kn.description ?? null };
}
