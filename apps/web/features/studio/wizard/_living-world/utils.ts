import type {
  ChapterEntities,
  ChapterStudioData,
  ChapterWorldNpcContract,
} from "@manga-ai-studio/core";

export function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ent-${Date.now()}`;
}

export function emptyEntities(): ChapterEntities {
  return { npcs: [], creatures: [], props: [], vehicles: [], factions: [] };
}

export function countLocalEntities(entities: ChapterEntities): number {
  return (
    entities.npcs.length
    + entities.creatures.length
    + entities.props.length
    + entities.vehicles.length
    + entities.factions.length
  );
}

export function countVisualWorldEntities(
  vw: ChapterStudioData["visualWorldContract"],
): number {
  return (
    (vw?.npcGroups?.length ?? 0)
    + (vw?.creatures?.length ?? 0)
    + (vw?.props?.length ?? 0)
    + (vw?.vehicles?.length ?? 0)
    + (vw?.factions?.length ?? 0)
  );
}

/** Importe les besoins narratifs du contrat d'intention dans les entités du chapitre. */
export function buildEntitiesFromIntent(
  current: ChapterEntities,
  intent: ChapterStudioData["chapterIntentContract"] | null | undefined,
): ChapterEntities {
  if (!intent) return current;

  const next: ChapterEntities = {
    npcs: [...current.npcs],
    creatures: [...current.creatures],
    props: [...current.props],
    vehicles: [...current.vehicles],
    factions: [...current.factions],
  };

  const hasNpc = (label: string) =>
    next.npcs.some((x) => x.label.toLowerCase() === label.toLowerCase());
  const hasCreature = (label: string) =>
    next.creatures.some((x) => x.label.toLowerCase() === label.toLowerCase());
  const hasProp = (name: string) =>
    next.props.some((x) => x.name.toLowerCase() === name.toLowerCase());

  for (const raw of intent.requiredNpcs ?? []) {
    const label = raw.trim();
    if (!label || hasNpc(label)) continue;
    const row: ChapterWorldNpcContract = {
      id: newId(),
      label,
      narrativeRole: null,
      appearance: null,
      behavior: null,
      panelMoments: [],
      recurrence: "one_shot",
    };
    next.npcs.push(row);
  }
  for (const raw of intent.requiredCreatures ?? []) {
    const label = raw.trim();
    if (!label || hasCreature(label)) continue;
    next.creatures.push({
      id: newId(),
      label,
      species: null,
      sizeLabel: null,
      silhouette: null,
      powers: null,
      behavior: null,
      threatLevel: "medium",
      revealMoment: null,
      recurrence: "unique",
    });
  }
  for (const raw of intent.requiredProps ?? []) {
    const name = raw.trim();
    if (!name || hasProp(name)) continue;
    next.props.push({
      id: newId(),
      name,
      ownerCharacterId: null,
      ownerLabel: null,
      visualDescription: null,
      narrativeFunction: null,
      momentHints: [],
      continuityRules: [],
    });
  }

  return next;
}

export function intentHasRequirements(
  intent: ChapterStudioData["chapterIntentContract"] | null | undefined,
): boolean {
  if (!intent) return false;
  return Boolean(
    intent.requiredNpcs?.length
    || intent.requiredCreatures?.length
    || intent.requiredProps?.length,
  );
}
