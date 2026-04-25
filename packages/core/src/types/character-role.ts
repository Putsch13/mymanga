/**
 * P2.1 — Normaliseur et enum central pour `roleType`.
 *
 * Contexte
 * --------
 * Historiquement le repo contient plusieurs conventions pour le role d'un
 * personnage :
 *   - `hero`, `HERO`, `main_hero`, `protagonist`, `main`, `MAIN_CHARACTER`
 *   - `antagonist`, `villain`, `enemy`, `rival`, `boss`
 *   - `ally`, `companion`, `support`, `secondary`, `SECONDARY_CORE`
 *   - `recurring_npc`, `npc`, `pnj`
 *
 * Chaque module a son propre regex et ses propres fallbacks, ce qui produit
 * du drift silencieux (un personnage `main_hero` peut etre classe comme
 * `other` par un module mais comme `hero` par un autre).
 *
 * Ce module introduit :
 *   1. `CHARACTER_ROLE_CANONICAL` : l'enum central des valeurs canoniques.
 *   2. `normalizeCharacterRoleType(value)` : tolere toutes les variantes et
 *      renvoie une valeur canonique + un `confidence` pour traquer les
 *      fallbacks.
 *
 * L'objectif n'est PAS de reecrire toute la codebase en une passe (30+
 * callsites) mais de fournir une source de verite unique vers laquelle les
 * modules critiques migrent progressivement.
 */

export const CHARACTER_ROLE_CANONICAL = {
  HERO: "hero",
  ANTAGONIST: "antagonist",
  ALLY: "ally",
  RIVAL: "rival",
  SUPPORT: "support",
  SECONDARY: "secondary",
  RECURRING_NPC: "recurring_npc",
  NPC: "npc",
  UNKNOWN: "unknown",
} as const;

export type CanonicalCharacterRole =
  (typeof CHARACTER_ROLE_CANONICAL)[keyof typeof CHARACTER_ROLE_CANONICAL];

export type CanonicalCharacterRoleValue = Exclude<
  CanonicalCharacterRole,
  "unknown"
>;

export interface NormalizedCharacterRole {
  role: CanonicalCharacterRole;
  /**
   * `canonical` = valeur deja dans l'enum, `aliased` = traduite depuis un
   * alias connu, `fallback` = valeur inconnue → `unknown`.
   */
  confidence: "canonical" | "aliased" | "fallback";
  /**
   * Valeur originale pour audit/debug.
   */
  raw: string | null;
}

const CANONICAL_SET = new Set<string>(
  Object.values(CHARACTER_ROLE_CANONICAL),
);

const ALIAS_TABLE: Record<string, CanonicalCharacterRoleValue> = {
  // Hero variants (EN + FR)
  hero: "hero",
  main_hero: "hero",
  "main-hero": "hero",
  protagonist: "hero",
  protagoniste: "hero",
  héros: "hero",
  heros: "hero",
  main: "hero",
  main_character: "hero",
  main_protagonist: "hero",
  personnage_principal: "hero",
  // Antagonist variants (EN + FR)
  antagonist: "antagonist",
  antagoniste: "antagonist",
  villain: "antagonist",
  enemy: "antagonist",
  ennemi: "antagonist",
  boss: "antagonist",
  méchant: "antagonist",
  mechant: "antagonist",
  // Rival — proche d'antagonist mais distinct
  rival: "rival",
  // Ally (EN + FR)
  ally: "ally",
  allié: "ally",
  allie: "ally",
  companion: "ally",
  compagnon: "ally",
  // Support (EN + FR)
  support: "support",
  supporting: "support",
  soutien: "support",
  important_supporting_character: "support",
  // Secondary (EN + FR)
  secondary: "secondary",
  secondaire: "secondary",
  secondary_core: "secondary",
  personnage_secondaire: "secondary",
  // NPCs (EN + FR)
  recurring_npc: "recurring_npc",
  recurring: "recurring_npc",
  récurrent: "recurring_npc",
  recurrent: "recurring_npc",
  npc: "npc",
  pnj: "npc",
  figurant: "npc",
};

function toLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function normalizeCharacterRoleType(
  value: unknown,
): NormalizedCharacterRole {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { role: "unknown", confidence: "fallback", raw: null };
  }
  const lookup = toLookupKey(value);
  if (CANONICAL_SET.has(lookup)) {
    return {
      role: lookup as CanonicalCharacterRole,
      confidence: "canonical",
      raw: value,
    };
  }
  const aliased = ALIAS_TABLE[lookup];
  if (aliased) {
    return { role: aliased, confidence: "aliased", raw: value };
  }
  return { role: "unknown", confidence: "fallback", raw: value };
}

/**
 * Variante "simple" — retourne la valeur canonique (ou `unknown`) sans
 * metadata. A utiliser dans les callsites où `confidence` n'a pas d'usage.
 */
export function canonicalizeCharacterRoleType(
  value: unknown,
): CanonicalCharacterRole {
  return normalizeCharacterRoleType(value).role;
}

/**
 * Predicats utilitaires pour les callsites les plus frequents.
 */
export function isHeroRole(value: unknown): boolean {
  return canonicalizeCharacterRoleType(value) === "hero";
}

export function isAntagonistRole(value: unknown): boolean {
  return canonicalizeCharacterRoleType(value) === "antagonist";
}

export function isSupportingRole(value: unknown): boolean {
  const role = canonicalizeCharacterRoleType(value);
  return role === "support" || role === "secondary" || role === "ally";
}

export function isNpcRole(value: unknown): boolean {
  const role = canonicalizeCharacterRoleType(value);
  return role === "npc" || role === "recurring_npc";
}
