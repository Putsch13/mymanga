/**
 * P1.5 — CanonResolver : résolution canonique des entités détectées.
 *
 * Ce pass prend les entités détectées par VisualDiscoveryPass et :
 * 1. Les matche avec les fiches utilisateur existantes
 * 2. Crée des entités temporaires de chapitre si aucune fiche n'existe
 * 3. Crée des mystery entities si volontairement flou
 * 4. Bloque si une entité critique est incompréhensible
 *
 * @module canon-resolver-pass
 */

import type {
  ChapterVisualDiscoveryContract,
  DiscoveredVisualEntity,
  CanonLevel,
} from "./legacy-visual-discovery-pass";

/**
 * Entité résolue par le CanonResolver.
 */
export interface ResolvedEntity {
  id: string;
  label: string;
  canonicalId?: string;
  canonicalName?: string;
  matchConfidence: number;
  resolutionType: "exact_match" | "fuzzy_match" | "temporary" | "mystery" | "unknown_critical";
  visualDescription: string;
  requiredBeats: string[];
  canonLevel: CanonLevel;
}

/**
 * Contrat résolu par le CanonResolver.
 */
export interface CanonResolvedVisualContract {
  chapterId: string;
  matchedCharacters: ResolvedEntity[];
  matchedLocations: ResolvedEntity[];
  temporaryLocations: ResolvedEntity[];
  temporaryNpcGroups: ResolvedEntity[];
  temporaryRobots: ResolvedEntity[];
  temporaryHybrids: ResolvedEntity[];
  temporaryCreatures: ResolvedEntity[];
  temporaryFactions: ResolvedEntity[];
  props: ResolvedEntity[];
  mysteryEntities: ResolvedEntity[];
  unknownCritical: ResolvedEntity[];
}

/**
 * Input pour le CanonResolver.
 */
export interface CanonResolverInput {
  discoveryContract: ChapterVisualDiscoveryContract;
  /** Fiches personnages existantes. */
  userCharacters?: Array<{
    id: string;
    name: string;
    aliases?: string[];
    roleType?: string | null;
    description?: string | null;
  }>;
  /** Fiches lieux existantes. */
  userLocations?: Array<{
    id: string;
    name: string;
    aliases?: string[];
    description?: string | null;
  }>;
  /** Fiches PNJ existantes. */
  userNpcGroups?: Array<{
    id: string;
    name: string;
    aliases?: string[];
    description?: string | null;
  }>;
  /** Mode strict : bloque sur unknown_critical. */
  strictMode?: boolean;
}

/**
 * Résultat du CanonResolver.
 */
export interface CanonResolverResult {
  contract: CanonResolvedVisualContract;
  issues: CanonResolverIssue[];
  ok: boolean;
  stats: {
    exactMatches: number;
    fuzzyMatches: number;
    temporaryCreated: number;
    mysteryCreated: number;
    unknownCritical: number;
  };
}

export interface CanonResolverIssue {
  entityLabel: string;
  entityKind: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Calcule un score de similarité simple entre deux chaînes.
 */
function similarityScore(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();

  if (al === bl) return 1.0;
  if (al.includes(bl) || bl.includes(al)) return 0.8;

  const aWords = new Set(al.split(/\s+/));
  const bWords = new Set(bl.split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = aWords.size + bWords.size - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Tente de matcher une entité découverte avec une fiche utilisateur.
 */
function matchEntity<T extends { id: string; name: string; aliases?: string[] }>(
  entity: DiscoveredVisualEntity,
  candidates: T[],
): { match: T; confidence: number } | null {
  let bestMatch: { match: T; confidence: number } | null = null;

  for (const candidate of candidates) {
    // Match exact sur le nom
    let score = similarityScore(entity.label, candidate.name);

    // Vérifier les alias
    for (const alias of candidate.aliases ?? []) {
      const aliasScore = similarityScore(entity.label, alias);
      if (aliasScore > score) score = aliasScore;
    }

    if (score >= 0.6 && (!bestMatch || score > bestMatch.confidence)) {
      bestMatch = { match: candidate, confidence: score };
    }
  }

  return bestMatch;
}

function createResolvedEntity(
  entity: DiscoveredVisualEntity,
  resolutionType: ResolvedEntity["resolutionType"],
  canonicalId?: string,
  canonicalName?: string,
  matchConfidence = 0.5,
): ResolvedEntity {
  return {
    id: canonicalId ?? `temp_${entity.kind}_${entity.label.toLowerCase().replace(/\s+/g, "_")}`,
    label: entity.label,
    canonicalId,
    canonicalName,
    matchConfidence,
    resolutionType,
    visualDescription: entity.visualDescription,
    requiredBeats: entity.requiredBeats,
    canonLevel: resolutionType === "exact_match" || resolutionType === "fuzzy_match"
      ? "user_canon"
      : resolutionType === "mystery"
        ? "mystery"
        : "chapter_temporary",
  };
}

/**
 * Exécute le CanonResolver.
 */
export function runCanonResolverPass(input: CanonResolverInput): CanonResolverResult {
  const issues: CanonResolverIssue[] = [];
  const disc = input.discoveryContract;

  const matchedCharacters: ResolvedEntity[] = [];
  const matchedLocations: ResolvedEntity[] = [];
  const temporaryLocations: ResolvedEntity[] = [];
  const temporaryNpcGroups: ResolvedEntity[] = [];
  const temporaryRobots: ResolvedEntity[] = [];
  const temporaryHybrids: ResolvedEntity[] = [];
  const temporaryCreatures: ResolvedEntity[] = [];
  const temporaryFactions: ResolvedEntity[] = [];
  const props: ResolvedEntity[] = [];
  const mysteryEntities: ResolvedEntity[] = [];
  const unknownCritical: ResolvedEntity[] = [];

  let exactMatches = 0;
  let fuzzyMatches = 0;
  let temporaryCreated = 0;
  let mysteryCreated = 0;

  // 1. Résoudre les personnages
  for (const char of disc.characters) {
    if (char.source === "existing_user_entity" && char.id) {
      matchedCharacters.push(
        createResolvedEntity(char, "exact_match", char.id, char.label, 1.0),
      );
      exactMatches++;
      continue;
    }

    const match = matchEntity(char, input.userCharacters ?? []);
    if (match) {
      matchedCharacters.push(
        createResolvedEntity(
          char,
          match.confidence >= 0.9 ? "exact_match" : "fuzzy_match",
          match.match.id,
          match.match.name,
          match.confidence,
        ),
      );
      if (match.confidence >= 0.9) exactMatches++;
      else fuzzyMatches++;
    } else {
      issues.push({
        entityLabel: char.label,
        entityKind: "character",
        code: "E_CANON_CHARACTER_NOT_MATCHED",
        message: `Character "${char.label}" not found in user fiches`,
        severity: "warning",
      });
    }
  }

  // 2. Résoudre les lieux
  for (const loc of disc.locations) {
    if (loc.source === "existing_user_entity" && loc.id) {
      matchedLocations.push(
        createResolvedEntity(loc, "exact_match", loc.id, loc.label, 1.0),
      );
      exactMatches++;
      continue;
    }

    const match = matchEntity(loc, input.userLocations ?? []);
    if (match) {
      matchedLocations.push(
        createResolvedEntity(
          loc,
          match.confidence >= 0.9 ? "exact_match" : "fuzzy_match",
          match.match.id,
          match.match.name,
          match.confidence,
        ),
      );
      if (match.confidence >= 0.9) exactMatches++;
      else fuzzyMatches++;
    } else {
      // Créer un lieu temporaire
      temporaryLocations.push(createResolvedEntity(loc, "temporary"));
      temporaryCreated++;
    }
  }

  // 3. Résoudre les groupes PNJ
  for (const npc of disc.npcGroups) {
    const match = matchEntity(npc, input.userNpcGroups ?? []);
    if (match) {
      temporaryNpcGroups.push(
        createResolvedEntity(
          npc,
          match.confidence >= 0.9 ? "exact_match" : "fuzzy_match",
          match.match.id,
          match.match.name,
          match.confidence,
        ),
      );
      if (match.confidence >= 0.9) exactMatches++;
      else fuzzyMatches++;
    } else {
      // Créer un groupe temporaire
      temporaryNpcGroups.push(createResolvedEntity(npc, "temporary"));
      temporaryCreated++;
    }
  }

  // 4. Résoudre robots, hybrides, créatures, factions (temporaires)
  for (const robot of disc.robots) {
    temporaryRobots.push(createResolvedEntity(robot, "temporary"));
    temporaryCreated++;
  }
  for (const hybrid of disc.hybrids) {
    temporaryHybrids.push(createResolvedEntity(hybrid, "temporary"));
    temporaryCreated++;
  }
  for (const creature of disc.creatures) {
    temporaryCreatures.push(createResolvedEntity(creature, "temporary"));
    temporaryCreated++;
  }
  for (const faction of disc.factions) {
    temporaryFactions.push(createResolvedEntity(faction, "temporary"));
    temporaryCreated++;
  }

  // 5. Résoudre les props
  for (const prop of disc.props) {
    props.push(createResolvedEntity(prop, "temporary"));
    temporaryCreated++;
  }

  // 6. Vérifier les entités critiques manquantes
  const strictMode = input.strictMode ?? false;
  if (strictMode) {
    // En mode strict, pas de lieu = erreur
    if (matchedLocations.length === 0 && temporaryLocations.length === 0) {
      issues.push({
        entityLabel: "location",
        entityKind: "location",
        code: "E_CANON_LOCATION_MISSING_CRITICAL",
        message: "No location found — chapter requires at least one location",
        severity: "error",
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");

  const contract: CanonResolvedVisualContract = {
    chapterId: disc.chapterId,
    matchedCharacters,
    matchedLocations,
    temporaryLocations,
    temporaryNpcGroups,
    temporaryRobots,
    temporaryHybrids,
    temporaryCreatures,
    temporaryFactions,
    props,
    mysteryEntities,
    unknownCritical,
  };

  const stats = {
    exactMatches,
    fuzzyMatches,
    temporaryCreated,
    mysteryCreated,
    unknownCritical: unknownCritical.length,
  };

  console.info(
    `[canon-resolver] matchedCharacters=${matchedCharacters.length} matchedLocations=${matchedLocations.length} ` +
      `temporaryLocations=${temporaryLocations.length} temporaryNpcGroups=${temporaryNpcGroups.length}`,
  );

  return { contract, issues, ok, stats };
}

/**
 * Formate le log du CanonResolver.
 */
export function formatCanonResolverLog(result: CanonResolverResult): string {
  const c = result.contract;
  return (
    `[canon-resolver] matchedCharacters=${c.matchedCharacters.length} ` +
    `temporaryLocations=${c.temporaryLocations.length} ` +
    `temporaryNpcGroups=${c.temporaryNpcGroups.length}` +
    (result.issues.length > 0 ? ` issues=${result.issues.length}` : "")
  );
}
