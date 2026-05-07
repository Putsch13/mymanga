/**
 * Résolution des références personnage (noms affichés vs IDs DB) pour la QA premium.
 * Ne crée jamais d’ID : seuls les personnages du catalogue projet sont reconnus.
 */

export type CharacterRefForResolution = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  roleType?: string | null;
};

export type ResolveCharacterRefsResult = {
  /** IDs stables à injecter dans `involvedCharacters` / obligations machine */
  ids: string[];
  /** Libellés d’entrée sans match catalogue (à signaler produit / QA) */
  unresolved: string[];
  /** NPC group IDs résolus séparément (ne sont pas des personnages individuels) */
  npcGroupIds?: string[];
};

export type NpcGroupRefForResolution = {
  id: string;
  label?: string | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Règles : match exact sur `id` ; sinon match insensible à la casse sur `name` et `displayName` (trim).
 *
 * Si `npcGroups` est fourni, les libellés qui matchent un NPC group sont retournés
 * dans `npcGroupIds` (et NON dans `unresolved`). Cela évite que le QA premium
 * échoue à tort sur des libellés comme "Groupe de pêcheurs", "Garde", etc.
 */
export function resolveCharacterRefsToIds(
  refs: string[],
  characters: CharacterRefForResolution[],
  npcGroups: readonly NpcGroupRefForResolution[] = [],
): ResolveCharacterRefsResult {
  const ids: string[] = [];
  const unresolved: string[] = [];
  const npcGroupIds: string[] = [];

  const byId = new Map<string, CharacterRefForResolution>();
  const byName = new Map<string, CharacterRefForResolution>();
  for (const c of characters) {
    if (typeof c.id === "string" && c.id.length > 0) {
      byId.set(c.id, c);
      const n = typeof c.name === "string" ? norm(c.name) : "";
      if (n) {
        if (!byName.has(n)) byName.set(n, c);
      }
      const d = typeof c.displayName === "string" ? norm(c.displayName) : "";
      if (d && d !== n && !byName.has(d)) byName.set(d, c);
    }
  }

  const npcByLabel = new Map<string, string>();
  const npcByIdSet = new Set<string>();
  for (const g of npcGroups) {
    if (typeof g.id === "string" && g.id.length > 0) {
      npcByIdSet.add(g.id);
      const lbl = typeof g.label === "string" ? norm(g.label) : "";
      if (lbl && !npcByLabel.has(lbl)) npcByLabel.set(lbl, g.id);
    }
  }

  for (const raw of refs) {
    if (typeof raw !== "string") continue;
    const ref = raw.trim();
    if (!ref) continue;

    if (byId.has(ref)) {
      ids.push(ref);
      continue;
    }

    const key = norm(ref);
    const hit = byName.get(key);
    if (hit) {
      ids.push(hit.id);
      continue;
    }

    if (npcByIdSet.has(ref)) {
      npcGroupIds.push(ref);
      continue;
    }
    const npcHit = npcByLabel.get(key);
    if (npcHit) {
      npcGroupIds.push(npcHit);
      continue;
    }

    unresolved.push(ref);
  }

  return {
    ids: [...new Set(ids)],
    unresolved: [...new Set(unresolved)],
    npcGroupIds: [...new Set(npcGroupIds)],
  };
}
