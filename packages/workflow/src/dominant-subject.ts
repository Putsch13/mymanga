/**
 * P1.3 — Résolution d'un `dominantSubject` subject-aware pour un panel.
 *
 * Motivation :
 *   - Jusqu'ici, le routing et la reference policy se construisaient en
 *     chaîne : `subjectFocus` + `heroFocus` + `heroPresent` + `shotType` +
 *     `panelCharacterImportanceTiers`. Chaque consommateur refaisait la
 *     déduction à sa sauce, avec un biais récurrent vers le héros.
 *   - `dominantSubject` répond à une seule question : « quelle est l'entité
 *     qui doit porter le rendu de ce panel, et faut-il la locker avec des
 *     références canon ? ».
 *
 * Source de vérité (par ordre de priorité) :
 *   1. `subjectFocus` explicite du blueprint premium → map direct.
 *   2. `cutawayType` : un cutaway prop/environment/reaction override le cast.
 *   3. Cast panel + shotType :
 *        - 1 seul personnage + closeup/extreme_closeup → ce personnage.
 *        - 2+ personnages + medium/over_shoulder → group.
 *        - 0 personnage + wide → environment.
 *   4. Fallback : `none` (laisse l'appelant décider).
 *
 * La résolution NE retombe JAMAIS implicitement sur le héros quand un autre
 * personnage est dominant. C'est la clé de P1.3.
 */

import { normalizeSubjectFocus, normalizeCutawayType } from "@manga-ai-studio/core";

export type DominantSubjectKind =
  | "hero"
  | "enemy"
  | "ally"
  | "npc"
  | "group"
  | "environment"
  | "prop"
  | "reaction"
  | "aftermath"
  | "none";

export interface DominantSubject {
  kind: DominantSubjectKind;
  /**
   * Index du personnage dans `panelCharacterRoles` / `panelCharacterImportanceTiers`,
   * si la résolution cible un personnage précis. null pour environment/prop/etc.
   */
  characterIndex: number | null;
  /**
   * Tier du personnage dominant (pour piloter la force du lock). null si
   * le sujet n'est pas un personnage.
   */
  characterTier: "MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA" | null;
  /**
   * Origine de la décision :
   *   - "explicit" : `subjectFocus` ou `cutawayType` du blueprint.
   *   - "inferred" : déduit du cast + shotType.
   *   - "default"  : aucune info utilisable, fallback `none`.
   */
  provenance: "explicit" | "inferred" | "default";
  /** Tag court pour debug / logs. */
  reason: string;
}

export interface ResolveDominantSubjectInput {
  subjectFocus?: string | null;
  cutawayType?: string | null;
  shotType?: string | null;
  panelCharacterRoles?: string[];
  panelCharacterImportanceTiers?: Array<"MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA">;
}

const HERO_ROLE_RE = /hero|protagon|main_hero|h[eé]ros/i;
const ENEMY_ROLE_RE = /antagon|villain|rival|boss|enemy|ennemi/i;
const ALLY_ROLE_RE = /ally|alli[eé]|partner|deuterag|mentor|support/i;

function findCharacterIndex(
  roles: string[],
  predicate: (r: string) => boolean,
): number {
  return roles.findIndex((r) => predicate(r));
}

export function resolveDominantSubject(
  input: ResolveDominantSubjectInput,
): DominantSubject {
  const roles = input.panelCharacterRoles ?? [];
  const tiers = input.panelCharacterImportanceTiers ?? [];

  const tierAt = (idx: number): DominantSubject["characterTier"] =>
    idx >= 0 && idx < tiers.length ? tiers[idx] ?? null : null;

  // 1. cutawayType explicite dominant → court-circuit le cast.
  const cutaway = normalizeCutawayType(input.cutawayType).value;
  if (cutaway === "environment" || cutaway === "environment_establishing" || cutaway === "location_transition") {
    return {
      kind: "environment",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: `cutawayType=${cutaway}`,
    };
  }
  if (cutaway === "prop_insert" || cutaway === "object_insert") {
    return {
      kind: "prop",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: `cutawayType=${cutaway}`,
    };
  }
  if (cutaway === "aftermath" || cutaway === "movement_trace") {
    return {
      kind: "aftermath",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: `cutawayType=${cutaway}`,
    };
  }

  // 2. subjectFocus explicite (post-normalisation canonique).
  const focus = normalizeSubjectFocus(input.subjectFocus).value;

  if (focus === "hero") {
    const idx = findCharacterIndex(roles, (r) => HERO_ROLE_RE.test(r));
    return {
      kind: "hero",
      characterIndex: idx >= 0 ? idx : null,
      characterTier: tierAt(idx) ?? "MAIN_HERO",
      provenance: "explicit",
      reason: "subjectFocus=hero",
    };
  }
  if (focus === "enemy") {
    const idx = findCharacterIndex(roles, (r) => ENEMY_ROLE_RE.test(r));
    return {
      kind: "enemy",
      characterIndex: idx >= 0 ? idx : null,
      characterTier: tierAt(idx),
      provenance: "explicit",
      reason: "subjectFocus=enemy",
    };
  }
  if (focus === "ally") {
    const idx = findCharacterIndex(roles, (r) => ALLY_ROLE_RE.test(r));
    return {
      kind: "ally",
      characterIndex: idx >= 0 ? idx : null,
      characterTier: tierAt(idx),
      provenance: "explicit",
      reason: "subjectFocus=ally",
    };
  }
  if (focus === "npc" || focus === "speaker") {
    // NPC : on prend le premier perso non-hero non-enemy si possible.
    const idx = findCharacterIndex(
      roles,
      (r) => !HERO_ROLE_RE.test(r) && !ENEMY_ROLE_RE.test(r),
    );
    return {
      kind: "npc",
      characterIndex: idx >= 0 ? idx : null,
      characterTier: tierAt(idx),
      provenance: "explicit",
      reason: `subjectFocus=${focus}`,
    };
  }
  if (focus === "group" || focus === "duo") {
    return {
      kind: "group",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: `subjectFocus=${focus}`,
    };
  }
  if (focus === "environment" || focus === "location") {
    return {
      kind: "environment",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: `subjectFocus=${focus}`,
    };
  }
  if (focus === "prop") {
    return {
      kind: "prop",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: "subjectFocus=prop",
    };
  }
  if (focus === "reaction") {
    // Une reaction cible typiquement un non-hero. On renvoie `reaction` avec
    // idx du premier non-hero (fallback sur le 1er perso disponible).
    const nonHeroIdx = findCharacterIndex(roles, (r) => !HERO_ROLE_RE.test(r));
    const idx = nonHeroIdx >= 0 ? nonHeroIdx : roles.length > 0 ? 0 : -1;
    return {
      kind: "reaction",
      characterIndex: idx >= 0 ? idx : null,
      characterTier: tierAt(idx),
      provenance: "explicit",
      reason: "subjectFocus=reaction",
    };
  }
  if (focus === "aftermath") {
    return {
      kind: "aftermath",
      characterIndex: null,
      characterTier: null,
      provenance: "explicit",
      reason: "subjectFocus=aftermath",
    };
  }

  // 3. Fallback : déduction depuis cast + shotType, SANS biais héros.
  const shot = input.shotType ?? null;
  const characterCount = roles.length;

  if (characterCount === 0) {
    if (shot === "wide" || shot === "establishing") {
      return {
        kind: "environment",
        characterIndex: null,
        characterTier: null,
        provenance: "inferred",
        reason: "no_characters+wide",
      };
    }
    return {
      kind: "none",
      characterIndex: null,
      characterTier: null,
      provenance: "default",
      reason: "no_characters",
    };
  }

  if (characterCount === 1) {
    // Un seul perso en cadre : on le désigne dominant, peu importe son rôle.
    const role = roles[0]!;
    const kind: DominantSubjectKind = HERO_ROLE_RE.test(role)
      ? "hero"
      : ENEMY_ROLE_RE.test(role)
        ? "enemy"
        : ALLY_ROLE_RE.test(role)
          ? "ally"
          : "npc";
    return {
      kind,
      characterIndex: 0,
      characterTier: tierAt(0),
      provenance: "inferred",
      reason: `single_character+${shot ?? "medium"}`,
    };
  }

  // 2+ personnages :
  //   - closeup/extreme_closeup → on ne peut pas inférer sans info (on retombe
  //     sur `group` plutôt que de choisir le héros par défaut).
  //   - medium/wide → group
  return {
    kind: "group",
    characterIndex: null,
    characterTier: null,
    provenance: "inferred",
    reason: `multi_characters+${shot ?? "medium"}`,
  };
}

/**
 * Utilitaire : l'entité dominante est-elle un personnage "non-héros" ?
 * Utile pour les gardes aval qui doivent éviter de forcer un lock héros.
 */
export function isNonHeroCharacterDominant(d: DominantSubject): boolean {
  return (
    d.characterIndex !== null
    && d.kind !== "hero"
    && (d.kind === "enemy" || d.kind === "ally" || d.kind === "npc" || d.kind === "reaction")
  );
}

/** Vrai si le sujet dominant n'est pas un personnage (env/prop/aftermath/group). */
export function isNonCharacterDominant(d: DominantSubject): boolean {
  return d.characterIndex === null
    && (d.kind === "environment" || d.kind === "prop" || d.kind === "aftermath" || d.kind === "group");
}
