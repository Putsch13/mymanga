/**
 * Registre d'entités visuelles premium — base pour rebalancing / QA / prompts canoniques.
 * Les soldats / robots / créatures doivent exister ici pour être comptés et cadrés,
 * pas seulement "devinés" par le LLM au moment du rendu.
 */

export type VisualEntityKind =
  | "hero"
  | "main_character"
  | "ally"
  | "enemy"
  | "soldier"
  | "creature"
  | "monster"
  | "robot"
  | "android"
  | "spirit"
  | "beast"
  | "npc"
  | "crowd"
  | "vehicle"
  | "faction"
  | "environment";

export type VisualEntityRole =
  | "protagonist"
  | "ally"
  | "antagonist"
  | "obstacle"
  | "background"
  | "neutral";

export type VisualEntityImportance = "primary" | "secondary" | "group" | "ambient";

export interface VisualEntity {
  id: string;
  name: string;
  kind: VisualEntityKind;
  role: VisualEntityRole;
  importance: VisualEntityImportance;
  visualTags: string[];
  beatIds: string[];
  canAppearAsGroup: boolean;
  groupCountHint?: number;
  referenceImageUrls?: string[];
  fallbackVisualDna?: string;
}

function roleFromCharacter(roleType: string | null | undefined): VisualEntityRole {
  const r = (roleType ?? "").toLowerCase();
  if (r.includes("hero") || r.includes("protagonist")) return "protagonist";
  if (r.includes("enemy") || r.includes("antagonist") || r.includes("villain")) return "antagonist";
  if (r.includes("ally") || r.includes("support")) return "ally";
  return "neutral";
}

function kindFromCharacter(roleType: string | null | undefined): VisualEntityKind {
  const r = (roleType ?? "").toLowerCase();
  if (r.includes("enemy") || r.includes("antagonist") || r.includes("villain")) return "enemy";
  if (r.includes("hero") || r.includes("protagonist")) return "hero";
  return "main_character";
}

export interface BuildVisualEntitiesInput {
  rawCharacters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    hairColor?: string | null;
    eyeColor?: string | null;
    canonSignatureText?: string | null;
  }>;
  focusCharacterIds: string[];
  heroCharacterId?: string | null;
  activeCreatureIds?: string[];
}

/**
 * Construit un registre minimal à partir du contexte pipeline V3.
 * Étendre plus tard avec story bible / outline / factions explicites.
 */
export function buildVisualEntitiesFromPremiumV3Input(input: BuildVisualEntitiesInput): VisualEntity[] {
  const out: VisualEntity[] = [];
  const heroId = input.heroCharacterId ?? input.focusCharacterIds[0] ?? null;

  for (const c of input.rawCharacters) {
    const isHero = heroId === c.id || (c.roleType ?? "").toLowerCase().includes("hero");
    out.push({
      id: c.id,
      name: c.name,
      kind: isHero ? "hero" : kindFromCharacter(c.roleType),
      role: roleFromCharacter(c.roleType),
      importance: isHero ? "primary" : "secondary",
      visualTags: [
        ...(c.canonSignatureText ? [c.canonSignatureText] : []),
        ...(c.hairColor ? [`hair:${c.hairColor}`] : []),
        ...(c.eyeColor ? [`eyes:${c.eyeColor}`] : []),
      ].filter(Boolean),
      beatIds: [],
      canAppearAsGroup: false,
      referenceImageUrls: [],
      fallbackVisualDna: c.canonSignatureText ?? undefined,
    });
  }

  for (const cid of input.activeCreatureIds ?? []) {
    if (out.some((e) => e.id === cid)) continue;
    out.push({
      id: cid,
      name: `creature:${cid}`,
      kind: "creature",
      role: "obstacle",
      importance: "secondary",
      visualTags: ["creature", "non_human_threat"],
      beatIds: [],
      canAppearAsGroup: false,
    });
  }

  return out;
}

export function pickPrimaryActorForBeat(
  beatId: string,
  entities: VisualEntity[],
  fallbackHeroId: string | null,
): VisualEntity | null {
  const inBeat = entities.filter((e) => e.beatIds.length === 0 || e.beatIds.includes(beatId));
  const hero = inBeat.find((e) => e.kind === "hero") ?? entities.find((e) => e.kind === "hero");
  if (hero) return hero;
  const main = inBeat.find((e) => e.kind === "main_character" && e.importance === "primary");
  if (main) return main;
  if (fallbackHeroId) {
    return entities.find((e) => e.id === fallbackHeroId) ?? null;
  }
  return inBeat.find((e) => e.role === "protagonist") ?? entities[0] ?? null;
}

export function pickOpponentEntityForBeat(beatId: string, entities: VisualEntity[]): VisualEntity | null {
  const inBeat = entities.filter((e) => e.beatIds.length === 0 || e.beatIds.includes(beatId));
  const enemy =
    inBeat.find((e) => e.kind === "enemy" || e.role === "antagonist")
    ?? entities.find((e) => e.kind === "enemy" || e.role === "antagonist");
  if (enemy) return enemy;
  return (
    inBeat.find((e) => e.kind === "creature" || e.kind === "monster" || e.kind === "robot" || e.kind === "soldier")
    ?? entities.find((e) => e.kind === "creature" || e.kind === "robot" || e.kind === "soldier")
    ?? null
  );
}
