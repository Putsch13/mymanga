/**
 * P0.9 — Projette `chapterEntities` (wizard) vers `VisualWorldContract`
 * (npcGroups, creatures, props, vehicles, factions + beatBindings d’ancrage).
 * Les lieux existants sont conservés.
 */
import type {
  ChapterEntities,
  ChapterStudioData,
  VisualWorldContract,
} from "@manga-ai-studio/core";
import { visualWorldContractSchema } from "@manga-ai-studio/core";

export const WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID = "wizard_chapter_entities_anchor";

function mapNpcGroups(entities: ChapterEntities) {
  return entities.npcs.map((n) => ({
    id: n.id,
    label: n.label,
    role: (n.narrativeRole ?? "").trim() || "support",
    visualProfile: (n.appearance ?? "").trim() || n.label,
    outfit: (n.appearance ?? "").trim() || "tenue cohérente avec le décor",
    silhouette: (n.behavior ?? "").trim().slice(0, 160) || "silhouette lisible manga",
    relationToLocation: null as string | null,
    relationToCharacterIds: [] as string[],
    requiredBeatIds: n.panelMoments.length ? n.panelMoments : [WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID],
    recurrencePolicy: n.recurrence === "recurring" ? ("recurring" as const) : ("background" as const),
  }));
}

function mapCreatures(entities: ChapterEntities) {
  return entities.creatures.map((c) => ({
    id: c.id,
    label: c.label,
    visualDescription: [
      c.species,
      c.sizeLabel,
      c.silhouette,
      c.powers,
      c.behavior,
      c.revealMoment,
    ]
      .filter(Boolean)
      .join(" — ") || c.label,
    requiredBeatIds: [WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID],
    threatLevel: c.threatLevel,
  }));
}

function mapProps(entities: ChapterEntities) {
  return entities.props.map((p) => ({
    id: p.id,
    canonicalName: p.name,
    category: "story",
    visualDescription: (p.visualDescription ?? "").trim() || p.name,
    ownerCharacterId: p.ownerCharacterId ?? null,
    locationId: null as string | null,
    requiredBeatIds: p.momentHints.length ? p.momentHints : [WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID],
    continuityPolicy: p.continuityRules.length > 0 ? ("recurring" as const) : ("single_use" as const),
    visibilityPolicy: "visible" as const,
    symbolicMeaning: (p.narrativeFunction ?? "").trim() || null,
  }));
}

function mapVehicles(entities: ChapterEntities) {
  return entities.vehicles.map((v) => ({
    id: v.id,
    label: v.label,
    visualDescription: [v.type, v.design, v.condition, v.sceneFunction, v.ownerLabel]
      .filter(Boolean)
      .join(" — ") || v.label,
    requiredBeatIds: [WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID],
    scale: "medium" as const,
  }));
}

function mapFactions(entities: ChapterEntities) {
  return entities.factions.map((f) => ({
    id: f.id,
    label: f.name,
    visualMarkers: [
      f.uniform,
      f.storyRole,
      f.visibleMembersNote,
    ].filter(Boolean) as string[],
    visualMotifs: f.symbol ? [f.symbol] : [],
    colors: f.colors,
    emblem: f.symbol ?? null,
    requiredBeatIds: [WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID],
  }));
}

function buildAnchorBinding(entities: ChapterEntities, primaryLocationId: string | null) {
  return {
    beatId: WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID,
    locationId: primaryLocationId,
    primaryPropIds: entities.props.map((p) => p.id),
    npcGroupIds: entities.npcs.map((n) => n.id),
    creatureIds: entities.creatures.map((c) => c.id),
    vehicleIds: entities.vehicles.map((v) => v.id),
    factionIds: entities.factions.map((f) => f.id),
    environmentMood: null as string | null,
    continuityObjectIds: [],
  };
}

export function syncChapterEntitiesToVisualWorld(opts: {
  chapterId: string;
  draft: ChapterStudioData;
}): VisualWorldContract {
  const { chapterId, draft } = opts;
  const existing = draft.visualWorldContract;
  const raw = draft.chapterEntities;
  const entities: ChapterEntities = raw ?? {
    npcs: [],
    creatures: [],
    props: [],
    vehicles: [],
    factions: [],
  };
  const wizardDefined = raw !== undefined;

  const locations = existing?.locations ?? [];
  const primaryLoc = locations.find((l) => l.canonPolicy === "locked") ?? locations[0] ?? null;

  const npcGroups = wizardDefined ? mapNpcGroups(entities) : (existing?.npcGroups ?? []);
  const creatures = wizardDefined ? mapCreatures(entities) : (existing?.creatures ?? []);
  const props = wizardDefined ? mapProps(entities) : (existing?.props ?? []);
  const vehicles = wizardDefined ? mapVehicles(entities) : (existing?.vehicles ?? []);
  const factions = wizardDefined ? mapFactions(entities) : (existing?.factions ?? []);

  const otherBindings =
    existing?.beatBindings?.filter((b) => b.beatId !== WIZARD_CHAPTER_ENTITIES_ANCHOR_BEAT_ID) ?? [];

  const hasAnyEntity =
    npcGroups.length + creatures.length + props.length + vehicles.length + factions.length > 0;

  const beatBindings =
    wizardDefined && hasAnyEntity
      ? [...otherBindings, buildAnchorBinding(entities, primaryLoc?.id ?? null)]
      : existing?.beatBindings ?? otherBindings;

  const merged: VisualWorldContract = {
    version: 1,
    chapterId,
    source: existing?.source ?? "studio_curated",
    locations,
    props,
    npcGroups,
    creatures,
    vehicles,
    factions,
    beatBindings,
    diagnostics: existing?.diagnostics,
  };

  return visualWorldContractSchema.parse(merged);
}
