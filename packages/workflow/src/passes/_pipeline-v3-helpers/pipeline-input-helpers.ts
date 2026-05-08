/**
 * pipeline-input-helpers.ts
 *
 * Helpers privés du pipeline premium v3 — résolution de l'input et de
 * structures auxiliaires AVANT que `runPremiumV3Pipeline` n'entre dans le
 * gros bloc try/catch.
 *
 * Extraits de `run-premium-v3-pipeline.ts` pour réduire sa taille (1869 → ~1700).
 */
import {
  type PanelBlueprintPremium,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import { isPipelineV3RenderFalEnabled } from "../../pipeline-feature-flags";
import {
  loadLocationsForV3StoryPass,
  type PremiumV3PipelineLocation,
} from "../../load-locations-for-v3-story-pass";
import type { LegacyNpcGroupForCast } from "../merge-npc-groups-legacy-regex";
import type { VisualWorldDiscoveryPassResult } from "../visual-world-discovery-pass";

/** Sous-set strict d'input nécessaire pour les helpers — évite l'import
 *  circulaire avec `run-premium-v3-pipeline.ts`. */
export interface PipelineInputForHelpers {
  pipelineV3Enabled: boolean;
  premiumV3OnlyEnabled: boolean;
  projectId: string;
  chapterId: string;
  chapterLocationName?: string | null;
  locations?: PremiumV3PipelineLocation[];
  locationIds?: string[];
}

/**
 * Garde-fou de configuration : si `PIPELINE_V3_PREMIUM_ONLY=true`, le mode
 * legacy est interdit et le render-pass v3 doit être actif.
 */
export function assertPremiumOnlyV3Config(
  input: Pick<PipelineInputForHelpers, "pipelineV3Enabled" | "premiumV3OnlyEnabled">,
): void {
  if (input.premiumV3OnlyEnabled && !input.pipelineV3Enabled) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true mais PIPELINE_V3_STORYBOARD=false. " +
        "Le premium-only interdit toute exécution legacy : active la v3 ou désactive PREMIUM_ONLY.",
    );
  }
  if (input.premiumV3OnlyEnabled && !isPipelineV3RenderFalEnabled()) {
    throw new Error(
      "premium_v3_only_misconfigured: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_RENDER_FAL=true. " +
        "Le render-pass v3 doit générer et persister les images ; aucun fallback legacy n'est autorisé.",
    );
  }
}

/**
 * P1.9 — Extrait les groupes NPC depuis les blueprints premium.
 * Identifie les panels de foule et les PNJ nommés.
 */
export function extractNpcGroupsFromBlueprints(
  blueprints: PanelBlueprintPremium[] | null | undefined,
): Array<{
  id: string;
  label: string;
  visualDescription?: string;
  requiredInBeatIds?: string[];
}> {
  if (!blueprints || blueprints.length === 0) return [];

  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      visualDescription: string;
      requiredInBeatIds: Set<string>;
    }
  >();

  for (const bp of blueprints) {
    if (bp.cutawayType === "crowd" || bp.cutawayType === "npc_group") {
      const groupId =
        "crowd_" + (bp.sceneContextLabel?.toLowerCase().replace(/\s+/g, "_") ?? "generic");
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          label: bp.sceneContextLabel ?? "foule d'ambiance",
          visualDescription: "",
          requiredInBeatIds: new Set(),
        });
      }
      if (bp.beatId) {
        groups.get(groupId)!.requiredInBeatIds.add(bp.beatId);
      }
    }

    if (bp.npcVisualDna && Array.isArray(bp.npcVisualDna)) {
      for (const npc of bp.npcVisualDna) {
        const npcId =
          npc.continuityId ??
          `npc_${npc.displayName?.toLowerCase().replace(/\s+/g, "_") ?? "anon"}`;
        if (!groups.has(npcId)) {
          groups.set(npcId, {
            id: npcId,
            label: npc.displayName ?? "PNJ anonyme",
            visualDescription: npc.visualMarkers?.join(", ") ?? "",
            requiredInBeatIds: new Set(),
          });
        }
        if (bp.beatId) {
          groups.get(npcId)!.requiredInBeatIds.add(bp.beatId);
        }
      }
    }
  }

  return Array.from(groups.values()).map((g) => ({
    id: g.id,
    label: g.label,
    visualDescription: g.visualDescription || undefined,
    requiredInBeatIds: g.requiredInBeatIds.size > 0 ? Array.from(g.requiredInBeatIds) : undefined,
  }));
}

/** Convertit les NPC groups d'un VisualWorldContract en format `LegacyNpcGroupForCast`. */
export function npcGroupsFromVisualWorldForCast(
  vw: VisualWorldContract,
): LegacyNpcGroupForCast[] {
  return vw.npcGroups.map((g) => ({
    id: g.id,
    label: g.label,
    visualDescription:
      [
        g.visualProfile,
        g.outfit ? `tenue: ${g.outfit}` : "",
        g.silhouette ? `silhouette: ${g.silhouette}` : "",
      ]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" — ") || undefined,
    requiredInBeatIds: g.requiredBeatIds.length > 0 ? [...g.requiredBeatIds] : undefined,
  }));
}

/** Fusionne les PNJ du contrat discovery (legacy ou dérivé du monde IA) avant cast + story. */
export function mergeDiscoveryContractNpcGroupsIntoMap(
  map: Map<string, LegacyNpcGroupForCast>,
  contract: VisualWorldDiscoveryPassResult["contract"],
): void {
  for (const npcGroup of contract.npcGroups) {
    const key = npcGroup.label.toLowerCase();
    if (map.has(key)) continue;
    const id =
      typeof npcGroup.id === "string" && npcGroup.id.trim().length > 0
        ? npcGroup.id
        : `auto_${key.replace(/\s+/g, "_")}`;
    map.set(key, {
      id,
      label: npcGroup.label,
      visualDescription: npcGroup.visualDescription || undefined,
      requiredInBeatIds: npcGroup.requiredBeats.length > 0 ? [...npcGroup.requiredBeats] : undefined,
    });
  }
}

/**
 * Résout le format projet en fallback `manga` si la valeur DB est invalide
 * (avec un warning explicite côté logs).
 */
export function resolveProjectFormat(
  project: Record<string, unknown> | null,
  projectId: string,
): "manga" | "webtoon" {
  const projectFormatRaw = typeof project?.format === "string" ? project.format : null;
  const projectFormat: "manga" | "webtoon" =
    projectFormatRaw === "webtoon" ? "webtoon" : "manga";
  if (projectFormatRaw !== "manga" && projectFormatRaw !== "webtoon") {
    console.warn(
      `[pipeline:v3:storyboard] project_format_fallback raw=${projectFormatRaw ?? "null"} → manga (projectId=${projectId})`,
    );
  }
  return projectFormat;
}

/**
 * Résout les locations utilisées par le story-pass selon trois sources,
 * dans l'ordre de priorité :
 *   1. `input.locations` déjà résolues
 *   2. `input.locationIds` → loadLocationsForV3StoryPass
 *   3. `input.chapterLocationName` → location synthétique (fallback)
 */
export async function resolveLocationsForStoryPass(
  input: PipelineInputForHelpers,
): Promise<PremiumV3PipelineLocation[]> {
  let resolved =
    Array.isArray(input.locations) && input.locations.length > 0 ? [...input.locations] : [];
  if (
    resolved.length === 0 &&
    Array.isArray(input.locationIds) &&
    input.locationIds.length > 0
  ) {
    resolved = await loadLocationsForV3StoryPass({
      projectId: input.projectId,
      locationIds: input.locationIds,
    });
  }
  if (
    resolved.length === 0 &&
    typeof input.chapterLocationName === "string" &&
    input.chapterLocationName.trim().length > 0
  ) {
    resolved = [
      {
        id: `chapter-primary:${input.chapterId}`,
        name: input.chapterLocationName.trim(),
        visualDNA: { source: "chapter_location_field" },
      },
    ];
  }
  if (resolved.length > 0) {
    const locationSource = input.locations?.length
      ? "input"
      : input.locationIds?.length
        ? "locationIds"
        : "chapterLocationName";
    console.info(
      `[pipeline:v3:locations] chapterId=${input.chapterId} count=${resolved.length} source=${locationSource}`,
    );
  }
  return resolved;
}

/**
 * Vrai dès qu'un `productionPlan` non vide avec ≥ 1 panelBlueprint est
 * fourni — déclenche le mode "approved plan driven" (skip de tout le
 * re-build de plan).
 */
export function hasApprovedPlanDrivenInput(input: {
  productionPlan?: Record<string, unknown> | null;
}): boolean {
  const plan = input.productionPlan as Record<string, unknown> | null | undefined;
  return Boolean(
    plan && Array.isArray(plan.panelBlueprints) && plan.panelBlueprints.length > 0,
  );
}

/**
 * Déduplique en gardant l'ordre les warnings utilisateur (qui peuvent
 * venir de plusieurs passes consécutives écrivant le même message).
 */
export function dedupePipelineWarnings(warnings: readonly string[]): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of warnings) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.length > 0 ? out : undefined;
}
