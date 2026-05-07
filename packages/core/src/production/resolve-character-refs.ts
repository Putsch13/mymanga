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
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Préfixes français qui désignent un collectif et qu'on doit STRIP avant de
 * matcher contre un label de NPC group. Ainsi :
 *   - "Groupe de pêcheurs" → "pecheurs" → match "Pêcheurs"
 *   - "Les gardes du port" → "gardes du port" → match
 *   - "Bande de bandits"  → "bandits"
 *   - "Foule de villageois" → "villageois"
 */
const COLLECTIVE_PREFIX_PATTERNS = [
  /^groupe\s+(?:de|d')\s+/i,
  /^bande\s+(?:de|d')\s+/i,
  /^foule\s+(?:de|d')\s+/i,
  /^groupes?\s+(?:de|d')\s+/i,
  /^equipe\s+(?:de|d')\s+/i,
  /^equipes?\s+(?:de|d')\s+/i,
  /^les?\s+/i,
  /^des?\s+/i,
  /^un\s+(?:groupe|gang|clan)\s+(?:de|d')\s+/i,
];

function stripCollectivePrefix(label: string): string {
  let result = label;
  for (const p of COLLECTIVE_PREFIX_PATTERNS) {
    if (p.test(result)) {
      result = result.replace(p, "").trim();
      break;
    }
  }
  return result;
}

/**
 * Tente de matcher un label sur un NPC group via 3 stratégies :
 *   1. Match exact normalisé
 *   2. Match après strip des préfixes collectifs ("Groupe de pêcheurs" → "pêcheurs")
 *   3. Match par sous-chaîne réciproque ("Pêcheurs du port" ⊇ "pêcheurs")
 */
function findNpcGroupMatch(
  rawLabel: string,
  npcByLabel: Map<string, string>,
): string | null {
  const normalized = norm(rawLabel);
  if (npcByLabel.has(normalized)) return npcByLabel.get(normalized)!;

  const stripped = norm(stripCollectivePrefix(rawLabel));
  if (stripped !== normalized && npcByLabel.has(stripped)) {
    return npcByLabel.get(stripped)!;
  }

  // Sous-chaîne réciproque : on prend le label le plus court qui contient
  // ou est contenu par notre référence (évite les faux-positifs trop larges).
  for (const [groupLabel, groupId] of npcByLabel.entries()) {
    if (groupLabel.length < 3) continue;
    if (
      (stripped.length >= 3 && (groupLabel.includes(stripped) || stripped.includes(groupLabel)))
      || (normalized.length >= 3 && (groupLabel.includes(normalized) || normalized.includes(groupLabel)))
    ) {
      return groupId;
    }
  }

  return null;
}

/**
 * Règles : match exact sur `id` ; sinon match insensible à la casse sur `name` et `displayName` (trim).
 *
 * Si `npcGroups` est fourni, les libellés qui matchent un NPC group sont retournés
 * dans `npcGroupIds` (et NON dans `unresolved`). Cela évite que le QA premium
 * échoue à tort sur des libellés comme "Groupe de pêcheurs", "Garde", etc.
 *
 * Le matching NPC group tolère les préfixes collectifs français
 * ("Groupe de", "Bande de", "Les", "Des"…) et fait un match par sous-chaîne
 * pour absorber les variantes de description.
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

    // Prio 1 : match catalogue personnages par id ou par nom normalisé.
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

    // Prio 2 : NPC group par id ou par label (avec strip préfixes + sous-chaîne).
    if (npcByIdSet.has(ref)) {
      npcGroupIds.push(ref);
      continue;
    }
    const npcHit = findNpcGroupMatch(ref, npcByLabel);
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

/**
 * Filtre une liste de `unresolvedCharacterRefs` en éliminant celles qui matchent
 * un NPC group connu. Utile quand un plan canonique a été persisté avec des
 * `unresolvedCharacterRefs` avant que les NPC groups ne soient connus (ex.
 * l'estimate a figé les refs, puis les NPC groups ont été ajoutés/découverts),
 * et qu'on le re-valide plus tard dans `/launch`.
 *
 * Retourne les refs toujours non résolues (celles qui ne matchent aucun NPC
 * group ni aucun personnage du catalogue).
 */
export function filterOutResolvedNpcGroupRefs(
  unresolvedRefs: readonly string[],
  npcGroups: readonly NpcGroupRefForResolution[],
  characters: readonly CharacterRefForResolution[] = [],
): string[] {
  if (unresolvedRefs.length === 0) return [];
  if (npcGroups.length === 0 && characters.length === 0) return [...unresolvedRefs];

  const result = resolveCharacterRefsToIds([...unresolvedRefs], [...characters], npcGroups);
  return result.unresolved;
}

// Exporté pour tests et autres consommateurs (ex. dialogue writer).
export { stripCollectivePrefix as __stripCollectivePrefix };
