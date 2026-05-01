/**
 * P0 bis — Découverte monde visuel : compositeur IA (`composeVisualWorldContract`)
 * dès que le mode premium strict est actif, ou dès qu’OpenAI est configuré et que
 * des `composerBeats` sont fournis (pipeline v3). Sinon passe regex legacy (`runVisualDiscoveryPass`).
 *
 * Échec compose : pas de retour regex silencieux si `premiumV3OnlyEnabled` **ou**
 * `isPremiumStrictMode()` (NEXT_PUBLIC / env explicite), sauf
 * `VISUAL_WORLD_ALLOW_REGEX_FALLBACK=1`.
 */

import { composeVisualWorldContract } from "@manga-ai-studio/ai";
import {
  type BeatVisualBinding,
  type ChapterVisualDiscoveryContract,
  DEFAULT_FORBIDDEN_VISUAL_PROPS,
  DEFAULT_SUSPICIOUS_VISUAL_PROPS,
  type DiscoveredVisualEntity,
  runVisualDiscoveryPass,
  type VisualDiscoveryPassInput,
  type VisualDiscoveryPassResult,
} from "./legacy-visual-discovery-pass";
import {
  isPremiumStrictMode,
  type VisualWorldContract,
  type VisualWorldNpcGroup,
  type VisualWorldPropDna,
  type VisualWorldLocation,
  type CreatureVisualDna,
  type VehicleVisualDna,
  type FactionVisualDna,
} from "@manga-ai-studio/core";

export type VisualWorldDiscoveryPassInput = VisualDiscoveryPassInput & {
  premiumV3OnlyEnabled: boolean;
  projectGenre?: string | null;
  projectTone?: string | null;
  /** Résumé JSON court (ex. style bible sérialisée, tronquée côté appelant). */
  styleBibleJson?: string | null;
  /** Beats enrichis (IDs personnages projet) — requis pour le compositeur premium. */
  composerBeats?: Array<{
    beatId: string;
    summary: string;
    whyThisBeatExists?: string | null;
    dramaticChange?: string | null;
    involvedCharacterIds?: string[];
  }>;
};

export type VisualWorldDiscoveryPassResult = VisualDiscoveryPassResult & {
  visualWorldContract: VisualWorldContract | null;
  discoverySource: "ai_composed" | "regex_legacy";
  /**
   * Traçabilité composeur monde vs regex (audit / ops).
   * `regex_after_compose_error` = échec `composeVisualWorldContract` puis repli (hors strict premium seul).
   */
  visualWorldComposeMeta?: {
    path: "ai_composer" | "regex_only" | "regex_after_compose_error";
    composeErrorSummary?: string;
  };
};

function idToCharacterName(
  id: string,
  known: VisualDiscoveryPassInput["knownCharacters"],
): string | null {
  const row = (known ?? []).find((c) => c.id === id);
  return row?.name ?? null;
}

function discoverySourceForLocation(source: VisualWorldLocation["source"]): DiscoveredVisualEntity["source"] {
  if (source === "db_canon" || source === "user_canon") return "existing_user_entity";
  return "temporary_inference";
}

function discoveryCanonForLocation(source: VisualWorldLocation["source"]): DiscoveredVisualEntity["canonLevel"] {
  if (source === "db_canon" || source === "user_canon") return "user_canon";
  return "chapter_temporary";
}

function locationEntity(loc: VisualWorldLocation): DiscoveredVisualEntity {
  const desc = [
    loc.description,
    loc.visualAnchors.length ? `Ancres: ${loc.visualAnchors.join("; ")}` : "",
    loc.atmosphere.length ? `Ambiance: ${loc.atmosphere.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    id: loc.id,
    label: loc.label,
    kind: "location",
    source: discoverySourceForLocation(loc.source),
    confidence: loc.source === "ai_generated" || loc.source === "story_text" ? 0.9 : 1,
    requiredBeats: [],
    optionalBeats: [],
    visualDescription: desc,
    canonLevel: discoveryCanonForLocation(loc.source),
    detectedIn: [],
    required: true,
  };
}

function npcGroupEntity(g: VisualWorldNpcGroup): DiscoveredVisualEntity {
  return {
    id: g.id,
    label: g.label,
    kind: "npc_group",
    source: "temporary_inference",
    confidence: 0.9,
    requiredBeats: g.requiredBeatIds,
    optionalBeats: [],
    visualDescription: `${g.visualProfile} — tenue: ${g.outfit} — silhouette: ${g.silhouette}`,
    canonLevel: "chapter_temporary",
    detectedIn: g.requiredBeatIds,
    evidenceBeatId: g.requiredBeatIds[0],
    required: g.recurrencePolicy === "named" || g.requiredBeatIds.length > 0,
  };
}

function propEntity(p: VisualWorldPropDna): DiscoveredVisualEntity {
  return {
    id: p.id,
    label: p.canonicalName,
    kind: "prop",
    source: "story_text",
    confidence: 0.85,
    requiredBeats: p.requiredBeatIds,
    optionalBeats: [],
    visualDescription: p.visualDescription,
    canonLevel: "chapter_temporary",
    detectedIn: p.requiredBeatIds,
    required: p.requiredBeatIds.length > 0,
  };
}

function creatureEntity(c: CreatureVisualDna): DiscoveredVisualEntity {
  return {
    id: c.id,
    label: c.label,
    kind: "creature",
    source: "temporary_inference",
    confidence: 0.85,
    requiredBeats: c.requiredBeatIds,
    optionalBeats: [],
    visualDescription: c.visualDescription,
    canonLevel: "chapter_temporary",
    detectedIn: c.requiredBeatIds,
    required: c.requiredBeatIds.length > 0,
  };
}

function vehicleEntity(v: VehicleVisualDna): DiscoveredVisualEntity {
  return {
    id: v.id,
    label: v.label,
    kind: "vehicle_or_large_prop",
    source: "temporary_inference",
    confidence: 0.85,
    requiredBeats: v.requiredBeatIds,
    optionalBeats: [],
    visualDescription: v.visualDescription,
    canonLevel: "chapter_temporary",
    detectedIn: v.requiredBeatIds,
    required: v.requiredBeatIds.length > 0,
  };
}

function factionEntity(f: FactionVisualDna): DiscoveredVisualEntity {
  return {
    id: f.id,
    label: f.label,
    kind: "faction",
    source: "temporary_inference",
    confidence: 0.85,
    requiredBeats: f.requiredBeatIds,
    optionalBeats: [],
    visualDescription: f.visualMarkers.join("; ") || f.label,
    canonLevel: "chapter_temporary",
    detectedIn: f.requiredBeatIds,
    required: f.requiredBeatIds.length > 0,
  };
}

function buildBeatBindingsFromVisualWorld(
  vw: VisualWorldContract,
  input: VisualWorldDiscoveryPassInput,
): BeatVisualBinding[] {
  const charByBeat = new Map<string, string[]>();
  const beatsForChars = input.composerBeats ?? input.beats;
  for (const b of beatsForChars) {
    const raw = b as {
      beatId: string;
      involvedCharacterIds?: string[];
      characters?: string[];
    };
    const ids =
      Array.isArray(raw.involvedCharacterIds) && raw.involvedCharacterIds.length > 0
        ? raw.involvedCharacterIds
        : (raw.characters ?? []).filter((x): x is string => typeof x === "string");
    const names = ids
      .map((id) => idToCharacterName(id, input.knownCharacters))
      .filter((n): n is string => Boolean(n));
    charByBeat.set(b.beatId, names);
  }

  const locLabel = new Map(vw.locations.map((l) => [l.id, l.label] as const));
  const npcLabel = new Map(vw.npcGroups.map((g) => [g.id, g.label] as const));
  const propName = new Map(vw.props.map((p) => [p.id, p.canonicalName] as const));

  return vw.beatBindings.map((bb) => {
    const loc = bb.locationId ? locLabel.get(bb.locationId) : undefined;
    return {
      beatId: bb.beatId,
      characters: charByBeat.get(bb.beatId) ?? [],
      locations: loc ? [loc] : [],
      npcGroups: bb.npcGroupIds.map((id) => npcLabel.get(id)).filter((x): x is string => Boolean(x)),
      props: bb.primaryPropIds.map((id) => propName.get(id)).filter((x): x is string => Boolean(x)),
    };
  });
}

export function visualWorldContractToDiscoveryContract(
  vw: VisualWorldContract,
  input: VisualWorldDiscoveryPassInput,
): ChapterVisualDiscoveryContract {
  const characters: DiscoveredVisualEntity[] = (input.knownCharacters ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    kind: "character" as const,
    source: "existing_user_entity" as const,
    confidence: 1,
    requiredBeats: [],
    optionalBeats: [],
    visualDescription: c.description ?? c.name,
    canonLevel: "user_canon" as const,
    detectedIn: [],
    required: true,
  }));

  const locations = vw.locations.map(locationEntity);
  const npcGroups = vw.npcGroups.map(npcGroupEntity);
  const props = vw.props.map(propEntity);
  const creatures = vw.creatures.map(creatureEntity);
  const vehiclesOrLargeProps = vw.vehicles.map(vehicleEntity);
  const factions = vw.factions.map(factionEntity);

  return {
    chapterId: input.chapterId,
    characters,
    npcGroups,
    locations,
    sublocations: [],
    vehiclesOrLargeProps,
    species: [],
    robots: [],
    hybrids: [],
    creatures,
    factions,
    props,
    forbiddenProps: [...DEFAULT_FORBIDDEN_VISUAL_PROPS, ...DEFAULT_SUSPICIOUS_VISUAL_PROPS],
    rejectedEntities: [],
    beatBindings: buildBeatBindingsFromVisualWorld(vw, input),
  };
}

function mergeStats(base: VisualDiscoveryPassResult["stats"], vw: VisualWorldContract): VisualDiscoveryPassResult["stats"] {
  return {
    charactersFound: base.charactersFound,
    locationsFound: vw.locations.length,
    sublocationsFound: 0,
    vehiclesFound: vw.vehicles.length,
    npcGroupsFound: vw.npcGroups.length,
    robotsFound: 0,
    hybridsFound: 0,
    creaturesFound: vw.creatures.length,
    factionsFound: vw.factions.length,
    propsFound: vw.props.length,
    forbiddenPropsStripped: base.forbiddenPropsStripped,
    rejectedCount: base.rejectedCount,
  };
}

export function formatVisualWorldDiscoveryLog(result: VisualWorldDiscoveryPassResult): string {
  const base =
    `[visual-world-discovery] source=${result.discoverySource} ` +
    `vwPath=${result.visualWorldComposeMeta?.path ?? "n/a"} ` +
    `locations=${result.stats.locationsFound} npcGroups=${result.stats.npcGroupsFound} ` +
    `props=${result.stats.propsFound} creatures=${result.stats.creaturesFound}`;
  if (result.visualWorldContract) {
    return `${base} beatBindings=${result.visualWorldContract.beatBindings.length}`;
  }
  return base + (result.warnings.length > 0 ? ` warnings=${result.warnings.join(",")}` : "");
}

/**
 * Utilise le compositeur IA (`composeVisualWorldContract`) si le mode premium strict
 * est actif, ou si OpenAI est configuré et que des beats enrichis (`composerBeats`)
 * sont fournis (pipeline v3 avec plan même hors `PIPELINE_V3_PREMIUM_ONLY`).
 */
export function shouldUseAiVisualWorldDiscovery(input: VisualWorldDiscoveryPassInput): boolean {
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  return (
    input.premiumV3OnlyEnabled === true
    || (hasOpenAi && (input.composerBeats?.length ?? 0) > 0)
  );
}

export async function runVisualWorldDiscoveryPass(
  input: VisualWorldDiscoveryPassInput,
): Promise<VisualWorldDiscoveryPassResult> {
  if (!shouldUseAiVisualWorldDiscovery(input)) {
    const legacy = runVisualDiscoveryPass(input);
    return {
      ...legacy,
      visualWorldContract: null,
      discoverySource: "regex_legacy",
      visualWorldComposeMeta: { path: "regex_only" },
    };
  }

  const beats =
    input.composerBeats?.length
      ? input.composerBeats
      : input.beats.map((b) => ({
          beatId: b.beatId,
          summary: b.summary ?? "",
          whyThisBeatExists: b.whyThisBeatExists ?? null,
          dramaticChange: b.dramaticChange ?? null,
          involvedCharacterIds: (b.characters ?? []).filter((x): x is string => typeof x === "string"),
        }));

  let vw: VisualWorldContract;
  try {
    vw = await composeVisualWorldContract({
      chapterId: input.chapterId,
      chapterSummary: input.chapterSummary,
      chapterUserIntent: input.userIntent,
      projectGenre: input.projectGenre ?? null,
      projectTone: input.projectTone ?? null,
      styleBibleJson: input.styleBibleJson ?? null,
      beats,
      knownCharacters: input.knownCharacters ?? [],
      knownLocations: input.knownLocations ?? [],
    });
  } catch (err) {
    const blockRegexFallbackOnComposeError =
      input.premiumV3OnlyEnabled === true || isPremiumStrictMode();
    const allowLegacy =
      !blockRegexFallbackOnComposeError
      || process.env.VISUAL_WORLD_ALLOW_REGEX_FALLBACK === "1"
      || process.env.VISUAL_WORLD_ALLOW_REGEX_FALLBACK === "true";
    if (!allowLegacy) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[visual-world-discovery] composeVisualWorldContract a échoué (premium). ` +
          `Définir VISUAL_WORLD_ALLOW_REGEX_FALLBACK=1 pour retomber sur la passe regex legacy. Cause: ${message}`,
      );
    }
    const legacy = runVisualDiscoveryPass(input);
    const message = err instanceof Error ? err.message : String(err);
    const reason =
      input.premiumV3OnlyEnabled || isPremiumStrictMode()
        ? "compose failed; regex_legacy (VISUAL_WORLD_ALLOW_REGEX_FALLBACK)."
        : "compose failed; regex_legacy automatic fallback (non-premium-strict).";
    return {
      ...legacy,
      visualWorldContract: null,
      discoverySource: "regex_legacy",
      visualWorldComposeMeta: {
        path: "regex_after_compose_error",
        composeErrorSummary: message.slice(0, 280),
      },
      warnings: [...legacy.warnings, reason],
    };
  }

  const contract = visualWorldContractToDiscoveryContract(vw, { ...input, composerBeats: beats });

  const legacyStats = {
    charactersFound: (input.knownCharacters ?? []).length,
    locationsFound: 0,
    sublocationsFound: 0,
    vehiclesFound: 0,
    npcGroupsFound: 0,
    robotsFound: 0,
    hybridsFound: 0,
    creaturesFound: 0,
    factionsFound: 0,
    propsFound: 0,
    forbiddenPropsStripped: 0,
    rejectedCount: 0,
  };

  return {
    contract,
    warnings: [],
    stats: mergeStats(legacyStats, vw),
    visualWorldContract: vw,
    discoverySource: "ai_composed",
    visualWorldComposeMeta: { path: "ai_composer" },
  };
}
