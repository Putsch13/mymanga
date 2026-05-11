/**
 * Normalisation des rôles / kinds renvoyés par le LLM (FR, synonymes, alias)
 * avant `safeParse` Zod. Centralise les tables d'alias studio.
 */
import { normalizeCharacterRoleType } from "@manga-ai-studio/core";

function stripDiacriticsKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeCharacterRole(
  value: unknown,
): "main" | "secondary" | "npc" | "unknown" {
  const { role } = normalizeCharacterRoleType(value);
  switch (role) {
    case "hero":
      return "main";
    case "antagonist":
    case "rival":
    case "ally":
    case "support":
    case "secondary":
      return "secondary";
    case "npc":
    case "recurring_npc":
      return "npc";
    default:
      return "unknown";
  }
}

export function normalizeGroupKind(
  value: unknown,
): "npc_group" | "species" | "crowd" | "faction" {
  const raw = stripDiacriticsKey(String(value ?? ""));
  const map: Record<string, "npc_group" | "species" | "crowd" | "faction"> = {
    npc_group: "npc_group",
    pnj: "npc_group",
    groupe: "npc_group",
    humains: "npc_group",
    humain: "npc_group",
    human: "npc_group",
    humans: "npc_group",
    personnes: "npc_group",
    people: "npc_group",
    pecheurs: "npc_group",
    pêcheurs: "npc_group",
    villagers: "npc_group",
    foule: "crowd",
    crowd: "crowd",
    passants: "crowd",
    faction: "faction",
    clan: "faction",
    guilde: "faction",
    espece: "species",
    species: "species",
    peuple: "species",
  };
  return map[raw] ?? "npc_group";
}

export function normalizeCreatureKind(
  value: unknown,
): "monster" | "hybrid" | "robot" | "animal" | "spirit" | "unknown" {
  const raw = stripDiacriticsKey(String(value ?? ""));
  const map: Record<
    string,
    "monster" | "hybrid" | "robot" | "animal" | "spirit" | "unknown"
  > = {
    monstre: "monster",
    monster: "monster",
    creature: "monster",
    créature: "monster",
    hybride: "hybrid",
    hybrid: "hybrid",
    robot: "robot",
    mecha: "robot",
    animal: "animal",
    animaux: "animal",
    esprit: "spirit",
    spirit: "spirit",
    fantome: "spirit",
    unknown: "unknown",
    inconnu: "unknown",
  };
  return map[raw] ?? "unknown";
}

/**
 * Normalise les rôles / kinds dans le JSON brut renvoyé par le LLM.
 *
 * On ne valide pas la structure ici (c'est le rôle de Zod après l'appel) ;
 * on se contente d'aligner les `role`, `kind` sur l'enum attendu.
 */
export function normalizeChapterVisualContractJsonRoles(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  return {
    ...o,
    characters: Array.isArray(o.characters)
      ? o.characters.map((c) => {
          if (!c || typeof c !== "object" || Array.isArray(c)) return c;
          const ch = c as Record<string, unknown>;
          return { ...ch, role: normalizeCharacterRole(ch.role) };
        })
      : o.characters,
    groups: Array.isArray(o.groups)
      ? o.groups.map((g) => {
          if (!g || typeof g !== "object" || Array.isArray(g)) return g;
          const group = g as Record<string, unknown>;
          return { ...group, kind: normalizeGroupKind(group.kind) };
        })
      : o.groups,
    species: Array.isArray(o.species)
      ? o.species.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? {
                ...(c as Record<string, unknown>),
                kind: normalizeCreatureKind((c as Record<string, unknown>).kind),
              }
            : c,
        )
      : o.species,
    robots: Array.isArray(o.robots)
      ? o.robots.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: "robot" }
            : c,
        )
      : o.robots,
    hybrids: Array.isArray(o.hybrids)
      ? o.hybrids.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: "hybrid" }
            : c,
        )
      : o.hybrids,
    creatures: Array.isArray(o.creatures)
      ? o.creatures.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? {
                ...(c as Record<string, unknown>),
                kind: normalizeCreatureKind((c as Record<string, unknown>).kind),
              }
            : c,
        )
      : o.creatures,
  };
}
