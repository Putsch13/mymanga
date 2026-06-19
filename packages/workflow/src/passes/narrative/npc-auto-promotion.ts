/**
 * P3.1 (partiel) — Helpers purs de la phase "NPC auto-promotion".
 *
 * Ne contient aucune I/O ni accès DB. Ces fonctions sont extraites depuis
 * `narrative-pass.ts` pour :
 *   - être testables indépendamment ;
 *   - documenter les politiques de promotion (quel PNJ mérite d'être créé
 *     comme Character vs laissé comme "extra temporaire").
 *
 * L'appel au `prisma.character.upsert` reste dans `narrative-pass.ts` tant
 * que le refactor complet de la pass n'est pas fait (risque trop élevé
 * dans un commit unique — voir P3.1 full dans le plan).
 */

/**
 * Partitionne les noms de PNJ détectés dans le bundle selon la politique
 * d'entity registry :
 *   - s'il existe un entityRegistry : seuls les "promoted" / "story_locked"
 *     sont promus, tout le reste est skip ;
 *   - s'il n'y a pas de registry (legacy) : on promeut tout sauf les
 *     temporary/backgroundExtras.
 */
export function partitionNpcsByPolicy(params: {
  bundleCharNames: Set<string> | Iterable<string>;
  promotedNames: Set<string>;
  temporaryNames: Set<string>;
  hasEntityRegistry: boolean;
}): { toPromote: string[]; toSkip: string[] } {
  const toPromote: string[] = [];
  const toSkip: string[] = [];
  const names = params.bundleCharNames instanceof Set
    ? Array.from(params.bundleCharNames)
    : Array.from(params.bundleCharNames);

  for (const pnjName of names) {
    const nameLower = pnjName.toLowerCase();
    if (params.promotedNames.has(nameLower)) {
      toPromote.push(pnjName);
    } else if (params.temporaryNames.has(nameLower)) {
      toSkip.push(pnjName);
    } else if (params.hasEntityRegistry) {
      toSkip.push(pnjName);
    } else {
      toPromote.push(pnjName);
    }
  }

  return { toPromote, toSkip };
}

/**
 * P0.11 — Défaut de `forbiddenVisualDrift` pour un PNJ auto-créé selon son
 * `entityKind`. Évite qu'un "dragon" auto-créé dérive vers un humain, ou
 * qu'un "robot" ait de la peau organique.
 *
 * Retourne toujours un tableau (jamais null) — un PNJ humain standard
 * reçoit juste `[]`, pour signer explicitement qu'aucune dérive connue
 * n'est à interdire a priori.
 */
export function computeDefaultForbiddenDrift(entityKind: string | null | undefined): string[] {
  const kind = String(entityKind ?? "").toLowerCase();
  if (kind === "dragon" || kind === "beast" || kind === "monster") {
    return ["human face", "human hands", "modern clothing"];
  }
  if (kind === "spirit" || kind === "ghost") {
    return ["solid body material", "casting ordinary shadow"];
  }
  if (kind === "robot" || kind === "mecha") {
    return ["organic skin", "natural hair"];
  }
  return [];
}

/**
 * P0.12 — Mapping `entityKind → roleType` pour les PNJ auto-créés.
 * Les humains et named_npc deviennent "secondary" (captés par la regex
 * importantNpcs du shot plan). Les autres gardent leur entityKind comme
 * roleType.
 */
export function mapEntityKindToRoleType(entityKind: string | null | undefined): string {
  if (entityKind === "human" || entityKind === "named_npc") return "secondary";
  return entityKind ?? "pnj";
}

/**
 * Forme un slug déterministe à partir d'un nom de PNJ (ASCII only, maximum
 * 60 chars). Garantit l'unicité via le `@@unique(projectId, slug)` Prisma
 * tout en restant lisible par un humain.
 */
export function slugifyNpcName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
