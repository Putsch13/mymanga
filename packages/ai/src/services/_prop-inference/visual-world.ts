/**
 * Helpers liés au `VisualWorldContract` :
 *   - indexation des props par beat,
 *   - extraction des `RequiredProp` à partir de `VisualWorldPropDna`.
 */
import type {
  RequiredProp,
  VisualWorldContract,
  VisualWorldPropDna,
} from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";
import { resolvePropOwner } from "../prop-owner-resolver";
import { validatePropEvidence } from "../prop-evidence-validator";

export function indexVisualWorldPropsByBeat(
  vw: { props: readonly VisualWorldPropDna[] } | null | undefined,
): Readonly<Record<string, readonly VisualWorldPropDna[]>> | undefined {
  if (!vw?.props?.length) return undefined;
  const map = new Map<string, VisualWorldPropDna[]>();
  for (const p of vw.props) {
    for (const bid of p.requiredBeatIds) {
      const cur = map.get(bid) ?? [];
      cur.push(p);
      map.set(bid, cur);
    }
  }
  if (map.size === 0) return undefined;
  return Object.fromEntries(map);
}

export interface CollectVisualWorldPropsArgs {
  beat: ProductionBeat;
  vwList: readonly VisualWorldPropDna[];
  visualWorldContract?: VisualWorldContract | null;
  heroCharacterId?: string | null;
  strictVwPremium: boolean;
  characterRoster: Array<{ id: string }>;
  locationRoster: Array<{ id: string }>;
}

export function collectVisualWorldProps(args: CollectVisualWorldPropsArgs): {
  props: RequiredProp[];
  seenNames: Set<string>;
} {
  const {
    beat,
    vwList,
    visualWorldContract,
    heroCharacterId,
    strictVwPremium,
    characterRoster,
    locationRoster,
  } = args;
  const props: RequiredProp[] = [];
  const seenNames = new Set<string>();

  for (const p of vwList) {
    if (strictVwPremium) {
      const { valid } = validatePropEvidence({
        prop: p,
        beat,
        visualWorldContract: visualWorldContract ?? undefined,
      });
      if (!valid) continue;
    }
    const name = p.canonicalName.trim();
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    const ownerResolution = resolvePropOwner({
      prop: p,
      characters: characterRoster,
      locations: locationRoster,
    });
    const resolvedOwnerId = p.ownerCharacterId ?? ownerResolution.ownerCharacterId ?? null;
    const ownerCategory = resolvedOwnerId
      ? resolvedOwnerId === heroCharacterId
        ? "hero"
        : "npc"
      : (p.locationId ?? ownerResolution.locationId)
        ? "ambient"
        : "unassigned";
    props.push({
      id: `prop_vw_${beat.beatId}_${p.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
      canonicalName: name,
      aliases: [],
      category: p.category || "prop",
      narrativeRole: "worldbuilding",
      requiredForBeatIds:
        p.requiredBeatIds.length > 0 ? [...p.requiredBeatIds] : [beat.beatId],
      visibilityMode:
        p.continuityPolicy === "symbolic" ? "foreground_insert" : "background_support",
      mustBeVisible:
        p.continuityPolicy === "recurring" || p.continuityPolicy === "symbolic",
      confidence: Math.max(0.92, ownerResolution.confidence),
      source: "visual_world_contract",
      ownerCategory,
      ownerId: resolvedOwnerId,
    });
  }

  return { props, seenNames };
}
