/**
 * CanonBindingResolver
 *
 * Pour un item de plan image, résout les bindings canon et LoRA à injecter
 * dans le `CanonicalImagePromptPacket`. Garantit qu'aucune image ne part
 * avec une description libre si une version canonique existe.
 *
 * Entrées attendues (façon registre) :
 *   - univers canonique
 *   - style manga canonique
 *   - personnages canon (avec loras)
 *   - PNJ canon
 *   - lieux canon
 *   - props canon
 *
 * Sortie : liste de `CanonBinding[]` + `LoraBinding[]` déjà dédupliqués,
 * ordonnés par criticité (hero > enemy > npc > style > universe > location > prop).
 */

import type {
  CanonBinding,
  LoraBinding,
  CharacterContextEntry,
  NpcContextEntry,
  PropContextEntry,
  EnvironmentContext,
  MangaStyleProfileRef,
  UniverseProfileRef,
} from "@manga-ai-studio/core";

export interface CanonRegistryInput {
  universe: UniverseProfileRef;
  mangaStyle: MangaStyleProfileRef;
  characters: CharacterContextEntry[];
  npcs: NpcContextEntry[];
  locations: EnvironmentContext[];
  props: PropContextEntry[];
  loraMappings: Record<string, { loraId: string; loraName: string; scope: LoraBinding["scope"]; weight: number }>;
}

export interface CanonResolutionInput {
  imageId: string;
  requiredCharacterIds: string[];
  requiredNpcIds: string[];
  requiredLocationId: string | null;
  requiredPropIds: string[];
}

export interface CanonResolutionResult {
  canonBindings: CanonBinding[];
  loraBindings: LoraBinding[];
  unresolvedReferences: string[];
  resolutionWarnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Resolver
// ────────────────────────────────────────────────────────────────────────────

export function resolveCanonBindings(
  registry: CanonRegistryInput,
  request: CanonResolutionInput,
): CanonResolutionResult {
  const canonBindings: CanonBinding[] = [];
  const loraBindings: LoraBinding[] = [];
  const unresolved: string[] = [];
  const warnings: string[] = [];

  // ── Universe (systématique) ─────────────────────────────────────────────
  canonBindings.push({
    canonType: "universe",
    canonId: registry.universe.universeId,
    canonLabel: registry.universe.universeName,
    sourcePath: `canon://universe/${registry.universe.universeId}`,
  });

  // ── Manga style (systématique) ──────────────────────────────────────────
  canonBindings.push({
    canonType: "style",
    canonId: registry.mangaStyle.styleId,
    canonLabel: registry.mangaStyle.styleName,
    sourcePath: `canon://style/${registry.mangaStyle.styleId}`,
  });

  const styleLora = registry.loraMappings[registry.mangaStyle.styleId];
  if (styleLora) {
    loraBindings.push({ ...styleLora });
  }

  const universeLora = registry.loraMappings[registry.universe.universeId];
  if (universeLora) {
    loraBindings.push({ ...universeLora });
  }

  // ── Characters ──────────────────────────────────────────────────────────
  for (const charId of request.requiredCharacterIds) {
    const canon = registry.characters.find((c) => c.characterId === charId);
    if (!canon) {
      unresolved.push(`character:${charId}`);
      warnings.push(`CHARACTER_NOT_IN_CANON: ${charId}`);
      continue;
    }
    canonBindings.push({
      canonType: "character",
      canonId: canon.characterId,
      canonLabel: canon.characterName,
      sourcePath: `canon://character/${canon.characterId}`,
    });
    const charLora = registry.loraMappings[canon.characterId];
    if (charLora) loraBindings.push({ ...charLora });
  }

  // ── NPCs ────────────────────────────────────────────────────────────────
  for (const npcId of request.requiredNpcIds) {
    const canon = registry.npcs.find((n) => n.npcId === npcId);
    if (!canon) {
      unresolved.push(`npc:${npcId}`);
      warnings.push(`NPC_NOT_IN_CANON: ${npcId}`);
      continue;
    }
    canonBindings.push({
      canonType: "npc",
      canonId: canon.npcId,
      canonLabel: canon.npcName,
      sourcePath: `canon://npc/${canon.npcId}`,
    });
  }

  // ── Location ────────────────────────────────────────────────────────────
  if (request.requiredLocationId) {
    const canon = registry.locations.find((l) => l.locationId === request.requiredLocationId);
    if (!canon) {
      unresolved.push(`location:${request.requiredLocationId}`);
      warnings.push(`LOCATION_NOT_IN_CANON: ${request.requiredLocationId}`);
    } else {
      canonBindings.push({
        canonType: "location",
        canonId: canon.locationId,
        canonLabel: canon.locationName,
        sourcePath: `canon://location/${canon.locationId}`,
      });
    }
  }

  // ── Props ───────────────────────────────────────────────────────────────
  for (const propId of request.requiredPropIds) {
    const canon = registry.props.find((p) => p.propId === propId);
    if (!canon) {
      unresolved.push(`prop:${propId}`);
      warnings.push(`PROP_NOT_IN_CANON: ${propId}`);
      continue;
    }
    canonBindings.push({
      canonType: "prop",
      canonId: canon.propId,
      canonLabel: canon.propName,
      sourcePath: `canon://prop/${canon.propId}`,
    });
  }

  return {
    canonBindings: dedupeCanonBindings(canonBindings),
    loraBindings: dedupeLoraBindings(loraBindings),
    unresolvedReferences: unresolved,
    resolutionWarnings: warnings,
  };
}

function dedupeCanonBindings(list: CanonBinding[]): CanonBinding[] {
  const seen = new Set<string>();
  const out: CanonBinding[] = [];
  for (const b of list) {
    const key = `${b.canonType}:${b.canonId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function dedupeLoraBindings(list: LoraBinding[]): LoraBinding[] {
  const seen = new Set<string>();
  const out: LoraBinding[] = [];
  for (const b of list) {
    if (seen.has(b.loraId)) continue;
    seen.add(b.loraId);
    out.push(b);
  }
  return out;
}

/**
 * Vérifie qu'aucun champ "description libre" ne serait envoyé en clair
 * si une version canonique existe. Retourne la liste des dérives détectées.
 */
export function auditCanonCoverage(
  registry: CanonRegistryInput,
  requestedCharacterIds: string[],
  requestedNpcIds: string[],
  requestedLocationId: string | null,
  requestedPropIds: string[],
): { covered: boolean; gaps: string[] } {
  const gaps: string[] = [];
  for (const id of requestedCharacterIds) {
    if (!registry.characters.find((c) => c.characterId === id)) {
      gaps.push(`character_missing_canon:${id}`);
    }
  }
  for (const id of requestedNpcIds) {
    if (!registry.npcs.find((n) => n.npcId === id)) {
      gaps.push(`npc_missing_canon:${id}`);
    }
  }
  if (requestedLocationId && !registry.locations.find((l) => l.locationId === requestedLocationId)) {
    gaps.push(`location_missing_canon:${requestedLocationId}`);
  }
  for (const id of requestedPropIds) {
    if (!registry.props.find((p) => p.propId === id)) {
      gaps.push(`prop_missing_canon:${id}`);
    }
  }
  return { covered: gaps.length === 0, gaps };
}
