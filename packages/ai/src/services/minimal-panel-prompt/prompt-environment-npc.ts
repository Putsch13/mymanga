/**
 * prompt-environment-npc.ts
 *
 * Suffixes ENVIRONMENT du prompt minimal : DNA décor + props monde +
 * blocs CREATURES / VEHICLES / FACTIONS / NPCS. Extrait de
 * `minimal-panel-prompt-builder.ts` (audit-v9).
 */

import type { PanelRenderSpec } from "../../contracts/panel-render-spec";
import { normalizePromptClause } from "./prompt-text-utils";

/** Plafonds pour le suffixe `environmentDNA` dans le bloc ENVIRONMENT (prompt court). */
export const ENV_DNA_CAPS = {
  descriptionChars: 200,
  visualAnchors: 3,
  /** Voir `LocationVisualDna.architecture` / hints persistés sur décor. */
  architecture: 3,
  atmosphere: 2,
  lighting: 2,
  recurringProps: 3,
  negativeConstraints: 2,
  totalChars: 520,
} as const;

function dnaStringList(value: unknown, max: number): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v !== "string") continue;
      const s = normalizePromptClause(v);
      if (s) out.push(s);
      if (out.length >= max) break;
    }
    return out;
  }
  if (typeof value === "string") {
    const s = normalizePromptClause(value);
    return s ? [s.slice(0, 240)] : [];
  }
  return [];
}

function firstDnaStringList(
  dna: Record<string, unknown>,
  keys: readonly string[],
  max: number,
): string[] {
  for (const k of keys) {
    const list = dnaStringList(dna[k], max);
    if (list.length > 0) return list;
  }
  return [];
}

/**
 * Suffixe décor contrôlé depuis `spec.environmentDNA` (clés camelCase ou snake_case).
 * Inclut architecture / atmosphère issus du monde visuel ou du canon lieu, avec plafonds
 * (aligné roadmap : pas d’explosion de longueur prompt).
 */
export function formatEnvironmentDnaForPrompt(
  dna: Record<string, unknown> | null | undefined,
): string {
  if (!dna || typeof dna !== "object") return "";
  const parts: string[] = [];
  const desc =
    typeof dna.description === "string"
      ? normalizePromptClause(dna.description).slice(0, ENV_DNA_CAPS.descriptionChars)
      : "";
  if (desc) parts.push(desc);

  const anchors = firstDnaStringList(
    dna,
    ["visualAnchors", "visual_anchors", "anchors"],
    ENV_DNA_CAPS.visualAnchors,
  );
  if (anchors.length) parts.push(`Anchors: ${anchors.join("; ")}.`);

  const architecture = firstDnaStringList(
    dna,
    ["architectureHints", "architecture", "permanentArchitecture", "architecture_hints"],
    ENV_DNA_CAPS.architecture,
  );
  if (architecture.length) parts.push(`Arch: ${architecture.join("; ")}.`);

  const atmosphere = firstDnaStringList(
    dna,
    ["atmosphere", "atmosphericNotes", "atmospheric_notes"],
    ENV_DNA_CAPS.atmosphere,
  );
  if (atmosphere.length) parts.push(`Atmos: ${atmosphere.join("; ")}.`);

  const lighting = firstDnaStringList(
    dna,
    ["lighting", "lightingNotes", "light", "lightingHints", "lighting_hints"],
    ENV_DNA_CAPS.lighting,
  );
  if (lighting.length) parts.push(`Light: ${lighting.join("; ")}.`);

  const props = firstDnaStringList(
    dna,
    ["recurringProps", "recurring_props", "props", "propAnchors", "prop_anchors"],
    ENV_DNA_CAPS.recurringProps,
  );
  if (props.length) parts.push(`Props: ${props.join("; ")}.`);

  const negs = firstDnaStringList(
    dna,
    [
      "negativeConstraints",
      "negative_constraints",
      "negatives",
      "avoid",
      "forbiddenDrift",
      "forbidden_drift",
    ],
    ENV_DNA_CAPS.negativeConstraints,
  );
  if (negs.length) parts.push(`Avoid: ${negs.join("; ")}.`);

  const joined = parts.join(" ").trim();
  if (!joined) return "";
  return joined.length > ENV_DNA_CAPS.totalChars ? joined.slice(0, ENV_DNA_CAPS.totalChars) : joined;
}

/**
 * Entités monde (créature / véhicule / faction) en tête pour ne pas les perdre
 * derrière des PNJ crowd.
 *
 * SPRINT 3 — budgets relevés (audit v7) :
 *   - 5 entités au lieu de 3 → couvre les scènes chargées (foules, factions
 *     multiples, scène de tribunal/marché).
 *   - 3 marqueurs/PNJ au lieu de 2 → permet barbe + tenue + détail signature.
 *   - 700 chars au lieu de 300 → ~2 lignes de prompt vs ~1/2 ligne avant.
 *     L'enveloppe globale du prompt fait 4096+ chars : 700 reste raisonnable
 *     pour CREATURES + VEHICLES + FACTIONS + NPCS combinés.
 */
const NPC_PROMPT_MAX = 5;
const NPC_MARKER_MAX_PER_NPC = 3;
const NPC_VISUAL_PROMPT_CHARS = 700;

const WORLD_PROP_PROMPT_MAX = 4;
const WORLD_PROP_DESC_CHARS = 100;
const WORLD_PROP_TOTAL_CHARS = 200;

/**
 * Props monde / beat (`VisualWorldPropDna` / `RequiredProp` mappés) — bloc **PROPS:** (P0.12).
 */
export function formatWorldPropsVisualDnaForPrompt(spec: PanelRenderSpec): string {
  const list = spec.propVisualDna ?? spec.worldPropsVisualDna;
  if (!Array.isArray(list) || list.length === 0) return "";
  const chunks: string[] = [];
  for (const p of list.slice(0, WORLD_PROP_PROMPT_MAX)) {
    const name = normalizePromptClause(p.canonicalName) || "object";
    const desc = normalizePromptClause(p.visualDescription).slice(0, WORLD_PROP_DESC_CHARS);
    const bit = desc && desc.toLowerCase() !== name.toLowerCase() ? `${name} (${desc})` : name;
    const policy = "visibilityPolicy" in p && p.visibilityPolicy ? String(p.visibilityPolicy) : "";
    const sym =
      "symbolicMeaning" in p && typeof p.symbolicMeaning === "string" && p.symbolicMeaning.trim().length > 0
        ? p.symbolicMeaning.trim().slice(0, 48)
        : "";
    const tail = [policy ? `vis:${policy}` : null, sym ? `sym:${sym}` : null].filter(Boolean).join(" ");
    chunks.push(tail ? `${bit} [${tail}]` : bit);
  }
  if (!chunks.length) return "";
  let s = `PROPS: ${chunks.join(" | ")}.`;
  if (s.length > WORLD_PROP_TOTAL_CHARS) {
    s = `${s.slice(0, WORLD_PROP_TOTAL_CHARS - 1)}…`;
  }
  return s;
}

function npcWorldPresenceSortKey(category: string | null | undefined): number {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "creature") return 0;
  if (c === "vehicle") return 1;
  if (c === "faction") return 2;
  return 3;
}

function worldEntityKindLabel(category: string | null | undefined): "Creature" | "Vehicle" | "Faction" | null {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "creature") return "Creature";
  if (c === "vehicle") return "Vehicle";
  if (c === "faction") return "Faction";
  return null;
}

function shouldSkipNpcRowForDedicatedDup(spec: PanelRenderSpec, category: string | null | undefined): boolean {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "creature" && Array.isArray(spec.creatureVisualDna) && spec.creatureVisualDna.length > 0) return true;
  if (c === "vehicle" && Array.isArray(spec.vehicleVisualDna) && spec.vehicleVisualDna.length > 0) return true;
  if (c === "faction" && Array.isArray(spec.factionVisualDna) && spec.factionVisualDna.length > 0) return true;
  return false;
}

type WorldEntityBucket = "creature" | "vehicle" | "faction" | "npc";

type TaggedWorldLine = { sort: number; bucket: WorldEntityBucket; line: string };

function creatureLineFromContract(cr: NonNullable<PanelRenderSpec["creatureVisualDna"]>[number]): string {
  const name =
    normalizePromptClause(cr.label)
    || normalizePromptClause(String(cr.id ?? "").replace(/^cre[-_]?/i, ""))
    || "creature";
  const markers = normalizePromptClause(cr.visualDescription);
  const tier = cr.threatLevel && cr.threatLevel !== "none" ? ` [threat:${cr.threatLevel}]` : "";
  const core = markers ? `${name} (${markers})` : name;
  return `${core}${tier}`.trim();
}

function vehicleLineFromContract(v: NonNullable<PanelRenderSpec["vehicleVisualDna"]>[number]): string {
  const name = normalizePromptClause(v.label) || normalizePromptClause(String(v.id ?? "")) || "vehicle";
  const markers = normalizePromptClause(v.visualDescription);
  const tier = v.scale ? ` [scale:${v.scale}]` : "";
  const core = markers ? `${name} (${markers})` : name;
  return `${core}${tier}`.trim();
}

function factionLineFromContract(f: NonNullable<PanelRenderSpec["factionVisualDna"]>[number]): string {
  const name = normalizePromptClause(f.label) || normalizePromptClause(String(f.id ?? "")) || "faction";
  const motifBits = [
    ...f.visualMarkers.map((s) => normalizePromptClause(String(s))).filter(Boolean),
    ...f.visualMotifs.map((s) => normalizePromptClause(String(s))).filter(Boolean),
    ...f.colors.map((s) => normalizePromptClause(String(s))).filter(Boolean),
    f.emblem?.trim() ? `emblem:${normalizePromptClause(f.emblem)}` : "",
  ].filter(Boolean);
  const uniq = [...new Set(motifBits)].slice(0, 4).join(", ");
  return uniq ? `${name} (${uniq})` : name;
}

function npcGroupLineFromNpcVisual(n: NonNullable<PanelRenderSpec["npcVisualDna"]>[number]): string {
  const name =
    normalizePromptClause(n.displayName ?? "")
    || normalizePromptClause(String(n.continuityId ?? "").replace(/^npc[-_]?/i, ""))
    || "figure";
  const cat = normalizePromptClause(n.category ?? "");
  const markers = Array.isArray(n.visualMarkers)
    ? n.visualMarkers
        .map((m) => normalizePromptClause(String(m)))
        .filter(Boolean)
        .slice(0, NPC_MARKER_MAX_PER_NPC)
        .join(", ")
    : "";
  const tierBits = [
    n.threatLevel && n.category === "creature" ? `threat:${n.threatLevel}` : null,
    n.vehicleScale && n.category === "vehicle" ? `scale:${n.vehicleScale}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const kind = worldEntityKindLabel(n.category);
  if (kind) {
    const tierSuffix = tierBits ? ` [${tierBits}]` : "";
    const core = markers ? `${name} (${markers})` : name;
    return `${core}${tierSuffix}`.trim();
  }
  const bits = [name, cat || null, markers || null].filter(Boolean) as string[];
  return bits.join("; ");
}

function collectTaggedWorldEntities(spec: PanelRenderSpec): TaggedWorldLine[] {
  const rows: TaggedWorldLine[] = [];

  if (Array.isArray(spec.creatureVisualDna)) {
    for (const cr of spec.creatureVisualDna) {
      rows.push({ sort: 0, bucket: "creature", line: creatureLineFromContract(cr) });
    }
  }

  if (Array.isArray(spec.vehicleVisualDna)) {
    for (const v of spec.vehicleVisualDna) {
      rows.push({ sort: 1, bucket: "vehicle", line: vehicleLineFromContract(v) });
    }
  }

  if (Array.isArray(spec.factionVisualDna)) {
    for (const f of spec.factionVisualDna) {
      rows.push({ sort: 2, bucket: "faction", line: factionLineFromContract(f) });
    }
  }

  const npcList = spec.npcVisualDna;
  if (Array.isArray(npcList)) {
    for (const n of npcList) {
      if (shouldSkipNpcRowForDedicatedDup(spec, n.category)) continue;
      const kind = worldEntityKindLabel(n.category);
      const line = npcGroupLineFromNpcVisual(n);
      if (!line.trim()) continue;
      if (kind === "Creature") {
        rows.push({ sort: 0, bucket: "creature", line });
      } else if (kind === "Vehicle") {
        rows.push({ sort: 1, bucket: "vehicle", line });
      } else if (kind === "Faction") {
        rows.push({ sort: 2, bucket: "faction", line });
      } else {
        rows.push({ sort: npcWorldPresenceSortKey(n.category), bucket: "npc", line });
      }
    }
  }

  rows.sort((a, b) => a.sort - b.sort || a.line.localeCompare(b.line));
  return rows.slice(0, NPC_PROMPT_MAX);
}

/** P0.12 — blocs explicites pour le modèle image (suffixe ENVIRONMENT). */
function formatStructuredWorldEntitiesForPrompt(spec: PanelRenderSpec): string {
  const picked = collectTaggedWorldEntities(spec);
  if (!picked.length) return "";
  const creatures = picked.filter((r) => r.bucket === "creature").map((r) => r.line);
  const vehicles = picked.filter((r) => r.bucket === "vehicle").map((r) => r.line);
  const factions = picked.filter((r) => r.bucket === "faction").map((r) => r.line);
  const npcs = picked.filter((r) => r.bucket === "npc").map((r) => r.line);

  const sections: string[] = [];
  if (creatures.length) sections.push(`CREATURES: ${creatures.join(" | ")}`);
  if (vehicles.length) sections.push(`VEHICLES: ${vehicles.join(" | ")}`);
  if (factions.length) sections.push(`FACTIONS: ${factions.join(" | ")}`);
  if (npcs.length) sections.push(`NPCS: ${npcs.join(" | ")}`);

  let s = sections.join(". ");
  if (s.length > NPC_VISUAL_PROMPT_CHARS) {
    s = `${s.slice(0, NPC_VISUAL_PROMPT_CHARS - 1)}…`;
  }
  return `${s}.`;
}

/**
 * Figures monde hors cast principal : blocs **CREATURES / VEHICLES / FACTIONS / NPCS**
 * (P0.12), plafonnés pour le suffixe ENVIRONMENT.
 */
export function formatNpcVisualDnaForPrompt(spec: PanelRenderSpec): string {
  return formatStructuredWorldEntitiesForPrompt(spec);
}

/** Suffixe décor : `environmentDNA` + props beat + présence monde (PNJ / créatures / véhicules / factions, PR6–PR7). */
export function buildDecorDnaAndNpcSuffix(spec: PanelRenderSpec): string {
  const dnaRaw = formatEnvironmentDnaForPrompt(spec.environmentDNA);
  const propRaw = formatWorldPropsVisualDnaForPrompt(spec);
  const npcRaw = formatNpcVisualDnaForPrompt(spec);
  const parts: string[] = [];
  if (dnaRaw) parts.push(`LOCATION: ${dnaRaw}`);
  if (propRaw) parts.push(propRaw);
  if (npcRaw) parts.push(npcRaw);
  if (!parts.length) return "";
  return ` ${parts.join(" ")}`;
}
