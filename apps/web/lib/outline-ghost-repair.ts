/**
 * B6-1 — Détection et réparation des personnages fantômes dans les outlines.
 * Un personnage fantôme est un actorId/nom mentionné dans l'outline mais absent de la DB du projet.
 */

export type KnownCharacter = {
  id: string;
  name: string;
  roleType?: string | null;
};

export type GhostCharacterIssue = {
  originalId: string;
  resolvedId: string | null;
  resolvedName: string | null;
  matchMethod: "exact" | "fuzzy" | "role_fallback" | "unresolved";
  levenshteinDistance?: number;
};

export type OutlineRepairResult = {
  repaired: boolean;
  ghostsFound: number;
  ghostsResolved: number;
  issues: GhostCharacterIssue[];
};

/**
 * Distance de Levenshtein entre deux chaînes (insensible à la casse).
 */
function levenshtein(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const m = aLower.length;
  const n = bLower.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aLower[i - 1] === bLower[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

/**
 * Tente de résoudre un actorId inconnu en matchant par nom ou rôle.
 */
function resolveUnknownActor(
  unknownId: string,
  knownCharacters: KnownCharacter[],
  narrativeRole?: string | null,
): GhostCharacterIssue {
  // 1. Match exact par ID
  const exactById = knownCharacters.find((c) => c.id === unknownId);
  if (exactById) {
    return {
      originalId: unknownId,
      resolvedId: exactById.id,
      resolvedName: exactById.name,
      matchMethod: "exact",
    };
  }

  // 2. Match exact par nom (l'outline peut contenir un nom au lieu d'un ID)
  const exactByName = knownCharacters.find(
    (c) => c.name.toLowerCase() === unknownId.toLowerCase(),
  );
  if (exactByName) {
    return {
      originalId: unknownId,
      resolvedId: exactByName.id,
      resolvedName: exactByName.name,
      matchMethod: "exact",
    };
  }

  // 3. Fuzzy match par nom (Levenshtein ≤ 2)
  let bestMatch: KnownCharacter | null = null;
  let bestDist = Infinity;
  for (const character of knownCharacters) {
    const dist = levenshtein(unknownId, character.name);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      bestMatch = character;
    }
  }
  if (bestMatch) {
    console.warn(
      `[outline-ghost-repair] GHOST_CHARACTER_DETECTED: "${unknownId}" → fuzzy match "${bestMatch.name}" (dist=${bestDist})`,
    );
    return {
      originalId: unknownId,
      resolvedId: bestMatch.id,
      resolvedName: bestMatch.name,
      matchMethod: "fuzzy",
      levenshteinDistance: bestDist,
    };
  }

  // 4. Fallback par rôle narratif
  if (narrativeRole) {
    const roleKeywords: Record<string, string[]> = {
      hero: ["hero", "protagonist", "main", "héros", "protagon"],
      villain: ["villain", "antagonist", "enemy", "ennemi", "antagoniste"],
      ally: ["ally", "allié", "companion", "compagnon", "sidekick"],
    };
    for (const [roleKey, keywords] of Object.entries(roleKeywords)) {
      if (keywords.some((kw) => narrativeRole.toLowerCase().includes(kw))) {
        const roleMatch = knownCharacters.find(
          (c) => c.roleType?.toLowerCase().includes(roleKey) ||
            keywords.some((kw) => c.roleType?.toLowerCase().includes(kw)),
        );
        if (roleMatch) {
          console.warn(
            `[outline-ghost-repair] GHOST_CHARACTER_DETECTED: "${unknownId}" → role fallback "${roleMatch.name}" (role=${roleKey})`,
          );
          return {
            originalId: unknownId,
            resolvedId: roleMatch.id,
            resolvedName: roleMatch.name,
            matchMethod: "role_fallback",
          };
        }
      }
    }
  }

  // 5. Non résolu
  console.error(
    `[outline-ghost-repair] GHOST_CHARACTER_UNRESOLVED: "${unknownId}" — no match found in ${knownCharacters.length} known characters`,
  );
  return {
    originalId: unknownId,
    resolvedId: null,
    resolvedName: null,
    matchMethod: "unresolved",
  };
}

/**
 * Répare les personnages fantômes dans un outline.
 * Modifie `beat.involvedCharacters` et `beat.actorIds` en place si des remplacements sont trouvés.
 */
export function repairGhostCharacters(
  outline: { beats: Array<Record<string, unknown>> },
  knownCharacterIds: string[],
  knownCharacters: KnownCharacter[],
): OutlineRepairResult {
  const knownIdSet = new Set(knownCharacterIds);
  const issues: GhostCharacterIssue[] = [];
  let ghostsFound = 0;
  let ghostsResolved = 0;

  for (const beat of outline.beats) {
    // Réparer involvedCharacters (tableau de noms ou d'IDs)
    const involved = Array.isArray(beat.involvedCharacters)
      ? (beat.involvedCharacters as string[])
      : [];
    const repairedInvolved: string[] = [];
    for (const actorRef of involved) {
      if (!knownIdSet.has(actorRef)) {
        ghostsFound++;
        const resolution = resolveUnknownActor(
          actorRef,
          knownCharacters,
          typeof beat.narrativeFunction === "string" ? beat.narrativeFunction : null,
        );
        issues.push(resolution);
        if (resolution.resolvedId) {
          repairedInvolved.push(resolution.resolvedId);
          ghostsResolved++;
        }
        // Si non résolu, on garde la référence originale pour ne pas casser le beat
        else {
          repairedInvolved.push(actorRef);
        }
      } else {
        repairedInvolved.push(actorRef);
      }
    }
    if (repairedInvolved.length > 0) {
      beat.involvedCharacters = repairedInvolved;
    }

    // Réparer actorIds si présent
    const actorIds = Array.isArray(beat.actorIds) ? (beat.actorIds as string[]) : null;
    if (actorIds) {
      const repairedActorIds: string[] = [];
      for (const actorId of actorIds) {
        if (!knownIdSet.has(actorId)) {
          const resolution = resolveUnknownActor(actorId, knownCharacters, null);
          if (resolution.resolvedId) {
            repairedActorIds.push(resolution.resolvedId);
          } else {
            repairedActorIds.push(actorId);
          }
        } else {
          repairedActorIds.push(actorId);
        }
      }
      beat.actorIds = repairedActorIds;
    }
  }

  return {
    repaired: ghostsFound > 0,
    ghostsFound,
    ghostsResolved,
    issues,
  };
}
