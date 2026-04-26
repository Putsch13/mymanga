/**
 * Registre d’entités visuelles premium — modèle ouvert (userDefinedKind + ADN + rôle).
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import {
  canonicalizeCharacterRoleType,
  isHeroRole,
  isAntagonistRole,
  isSupportingRole,
} from "@manga-ai-studio/core";

export type VisualEntityRole =
  | "protagonist"
  | "ally"
  | "antagonist"
  | "obstacle"
  | "neutral"
  | "ambient"
  | "faction"
  | "crowd"
  | "summon"
  | "pet"
  | "vehicle"
  | "environmental_threat";

export type VisualEntityScale =
  | "individual"
  | "pair"
  | "small_group"
  | "squad"
  | "crowd"
  | "swarm"
  | "giant"
  | "environment_scale";

export type VisualEntityConsistency = "strict" | "medium" | "loose";

export type VisualEntityCreatedFrom =
  | "user_description"
  | "story_bible"
  | "character_sheet"
  | "npc_sheet"
  | "faction_sheet"
  | "auto_canonized"
  | "generated_model_sheet";

export interface VisualEntityVisualDna {
  silhouette?: string;
  face?: string;
  hair?: string;
  body?: string;
  outfit?: string;
  armor?: string;
  anatomy?: string;
  materials?: string[];
  colors: string[];
  props: string[];
  symbols: string[];
  aura?: string;
  movementStyle?: string;
  forbiddenDrift: string[];
}

export interface VisualEntity {
  id: string;
  projectId: string;
  name: string;
  aliases: string[];
  userDefinedKind: string;
  semanticTags: string[];
  role: VisualEntityRole;
  scale: VisualEntityScale;
  isOpponent: boolean;
  isSentient: boolean;
  isNamed: boolean;
  isFaction: boolean;
  canAppearAsGroup: boolean;
  groupCountHint?: number;
  canonicalDescription: string;
  visualDna: VisualEntityVisualDna;
  referenceImageUrls: string[];
  consistencyLevel: VisualEntityConsistency;
  createdFrom: VisualEntityCreatedFrom;
  /** Optionnel : restriction par beat (vide = tous les beats). */
  beatIds: string[];
}

function emptyDna(): VisualEntityVisualDna {
  return { colors: [], props: [], symbols: [], forbiddenDrift: [] };
}

/**
 * P0.2 — Utilise le normaliseur centralisé pour les rôles personnages.
 * Plus de checks fragiles `includes("hero")` / `includes("protagon")`.
 */
function roleFromCharacter(roleType: string | null | undefined): VisualEntityRole {
  if (isHeroRole(roleType)) return "protagonist";
  if (isAntagonistRole(roleType)) return "antagonist";
  if (isSupportingRole(roleType)) return "ally";
  const canon = canonicalizeCharacterRoleType(roleType);
  if (canon === "npc" || canon === "recurring_npc") return "neutral";
  return "neutral";
}

export interface BuildVisualEntitiesInput {
  projectId: string;
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

export function buildVisualEntitiesFromPremiumV3Input(input: BuildVisualEntitiesInput): VisualEntity[] {
  const out: VisualEntity[] = [];

  // P2.6 — Seul heroCharacterId devient protagonist
  // focusCharacterIds devient ally/support, PAS protagonist
  const heroId = input.heroCharacterId ?? null;

  // Fallback : si pas de heroCharacterId explicite, utiliser le premier focusCharacter
  // SEULEMENT si son roleType indique qu'il est bien un héros
  const fallbackHeroId =
    heroId ??
    input.focusCharacterIds.find((fid) => {
      const c = input.rawCharacters.find((rc) => rc.id === fid);
      return c && isHeroRole(c.roleType);
    }) ??
    null;

  for (const c of input.rawCharacters) {
    // P2.6 — Strictement : seul heroCharacterId (ou fallback validé) est protagonist
    const isCharHero = c.id === heroId || c.id === fallbackHeroId;

    // P2.6 — focusCharacterIds (autres que héros) deviennent ally, pas protagonist
    const isFocusCharacter = input.focusCharacterIds.includes(c.id);
    const isActiveSupport = isFocusCharacter && !isCharHero;

    // Déterminer le rôle
    let role: VisualEntityRole;
    if (isCharHero) {
      role = "protagonist";
    } else if (isActiveSupport) {
      // P2.6 — Support/active character devient ally, pas protagonist
      role = "ally";
    } else {
      role = roleFromCharacter(c.roleType);
    }

    const colors: string[] = [];
    if (c.hairColor) colors.push(`hair:${c.hairColor}`);
    if (c.eyeColor) colors.push(`eyes:${c.eyeColor}`);
    const tags = [
      ...(c.canonSignatureText ? [c.canonSignatureText] : []),
      ...colors,
    ].filter(Boolean) as string[];

    // Déterminer le kind pour les logs/debug
    const userDefinedKind = isCharHero
      ? "main protagonist"
      : isActiveSupport
        ? "active support"
        : "story character";

    // Tags sémantiques
    const semanticTagsBase = tags.length
      ? tags
      : isCharHero
        ? ["hero"]
        : isActiveSupport
          ? ["support", "active"]
          : ["cast"];

    out.push({
      id: c.id,
      projectId: input.projectId,
      name: c.name,
      aliases: [],
      userDefinedKind,
      semanticTags: semanticTagsBase,
      role,
      scale: "individual",
      isOpponent: role === "antagonist" || role === "obstacle",
      isSentient: true,
      isNamed: true,
      isFaction: false,
      canAppearAsGroup: false,
      canonicalDescription: c.canonSignatureText ?? c.name,
      visualDna: {
        ...emptyDna(),
        colors: colors.length ? colors : ["(palette from project)"],
        props: [],
        symbols: [],
        forbiddenDrift: [],
      },
      referenceImageUrls: [],
      consistencyLevel: isCharHero ? "strict" : isActiveSupport ? "strict" : "medium",
      createdFrom: "character_sheet",
      beatIds: [],
    });
  }

  for (const cid of input.activeCreatureIds ?? []) {
    if (out.some((e) => e.id === cid)) continue;
    out.push({
      id: cid,
      projectId: input.projectId,
      name: `creature:${cid}`,
      aliases: [],
      userDefinedKind: "creature",
      semanticTags: ["creature", "non_human_threat"],
      role: "obstacle",
      scale: "individual",
      isOpponent: true,
      isSentient: true,
      isNamed: false,
      isFaction: false,
      canAppearAsGroup: false,
      canonicalDescription: "Non-human threat presence for this chapter.",
      visualDna: {
        ...emptyDna(),
        colors: ["muted natural tones"],
        props: [],
        symbols: [],
        forbiddenDrift: ["human proportions", "cute mascot"],
      },
      referenceImageUrls: [],
      consistencyLevel: "loose",
      createdFrom: "npc_sheet",
      beatIds: [],
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
  const hero =
    inBeat.find((e) => e.role === "protagonist")
    ?? entities.find((e) => e.role === "protagonist");
  if (hero) return hero;
  if (fallbackHeroId) {
    return entities.find((e) => e.id === fallbackHeroId) ?? null;
  }
  return inBeat.find((e) => !e.isOpponent && e.role !== "antagonist") ?? entities[0] ?? null;
}

export function pickRequiredOpponentForBeat(args: {
  beatId: string;
  beatPanels?: PanelBlueprintPremium[];
  visualEntities: VisualEntity[];
}): VisualEntity | null {
  void args.beatPanels;
  const { beatId, visualEntities } = args;
  const inBeat = visualEntities.filter((e) => e.beatIds.length === 0 || e.beatIds.includes(beatId));
  return (
    inBeat.find((e) => e.isOpponent)
    ?? visualEntities.find((e) => e.isOpponent)
    ?? null
  );
}

/** @deprecated utiliser pickRequiredOpponentForBeat */
export function pickOpponentEntityForBeat(beatId: string, entities: VisualEntity[]): VisualEntity | null {
  return pickRequiredOpponentForBeat({ beatId, visualEntities: entities });
}

export function subjectFocusForVisualEntity(entity: VisualEntity): "hero" | "enemy" | "npc" {
  if (entity.isOpponent) return "enemy";
  if (entity.role === "protagonist") return "hero";
  return "npc";
}

export function entityForId(entities: VisualEntity[], id: string): VisualEntity | undefined {
  return entities.find((e) => e.id === id);
}
