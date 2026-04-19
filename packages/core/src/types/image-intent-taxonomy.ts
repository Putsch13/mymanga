/**
 * Taxonomie canonique des intents d'image pour le chapitre-compiler.
 *
 * Cette taxonomie est la source de vérité pour décrire ce qu'une image
 * "doit être" (sujet dominant, fonction narrative, hiérarchie visuelle).
 *
 * Elle est plus large que `PanelIntentType` dans workflow (qui est lui-même
 * un sous-ensemble ciblant les panels du pipeline actuel). Utiliser ce type
 * dès qu'on parle d'images de chapitre (70–75 par chapitre).
 */

export const IMAGE_INTENT_TYPES = [
  // ── Héros ────────────────────────────────────────────────────────────────
  "hero_focus",
  "hero_action",
  "hero_emotion",
  "hero_duo",
  "hero_secondary_character",
  "hero_reaction",
  // ── Autres personnages ───────────────────────────────────────────────────
  "secondary_character_focus",
  "npc_focus",
  "enemy_focus",
  "enemy_reveal",
  "ally_focus",
  // ── Groupes ──────────────────────────────────────────────────────────────
  "guard_group_focus",
  "soldier_patrol",
  "threat_group_focus",
  "crowd_presence",
  "group_conflict",
  "group_presence",
  // ── Environnement & transitions ──────────────────────────────────────────
  "environment_establishing",
  "environment_transition",
  // ── Props & inserts ──────────────────────────────────────────────────────
  "prop_insert",
  "reaction_cutaway",
  "aftermath",
  "symbolic_insert",
  "magic_manifestation",
  // ── Combat & dialogue ────────────────────────────────────────────────────
  "combat_exchange",
  "combat_turning_point",
  "dialogue_two_shot",
  "dialogue_anchor",
  "threat_presence",
] as const;

export type ImageIntentType = (typeof IMAGE_INTENT_TYPES)[number];

export type HeroPresenceMode = "primary" | "secondary" | "silhouette" | "absent";

export type ContentRating = "all_ages" | "teen" | "mature" | "explicit_adult";

/**
 * Familles d'intent — utile pour appliquer des règles de composition
 * groupées (ex. "tous les intents 'cutaway' interdisent le hero_lock").
 */
export const IMAGE_INTENT_FAMILIES = {
  hero: new Set<ImageIntentType>([
    "hero_focus",
    "hero_action",
    "hero_emotion",
    "hero_reaction",
  ]),
  duo: new Set<ImageIntentType>([
    "hero_duo",
    "hero_secondary_character",
    "dialogue_two_shot",
  ]),
  other_character: new Set<ImageIntentType>([
    "secondary_character_focus",
    "npc_focus",
    "enemy_focus",
    "enemy_reveal",
    "ally_focus",
  ]),
  group: new Set<ImageIntentType>([
    "guard_group_focus",
    "soldier_patrol",
    "threat_group_focus",
    "crowd_presence",
    "group_conflict",
    "group_presence",
  ]),
  cutaway: new Set<ImageIntentType>([
    "prop_insert",
    "reaction_cutaway",
    "symbolic_insert",
    "environment_establishing",
    "environment_transition",
  ]),
  combat: new Set<ImageIntentType>([
    "combat_exchange",
    "combat_turning_point",
    "threat_presence",
  ]),
  aftermath: new Set<ImageIntentType>(["aftermath"]),
  magic: new Set<ImageIntentType>(["magic_manifestation"]),
  dialogue: new Set<ImageIntentType>(["dialogue_two_shot", "dialogue_anchor"]),
} as const;

export type ImageIntentFamily = keyof typeof IMAGE_INTENT_FAMILIES;

export function getIntentFamilies(intent: ImageIntentType): ImageIntentFamily[] {
  const families: ImageIntentFamily[] = [];
  for (const [family, set] of Object.entries(IMAGE_INTENT_FAMILIES) as [
    ImageIntentFamily,
    Set<ImageIntentType>,
  ][]) {
    if (set.has(intent)) families.push(family);
  }
  return families;
}

export function isIntentInFamily(
  intent: ImageIntentType,
  family: ImageIntentFamily,
): boolean {
  return IMAGE_INTENT_FAMILIES[family].has(intent);
}

/**
 * Intents qui interdisent formellement le lock/portrait sur le héros.
 * Utilisé par le preflight + prompt-recipe-builder pour ne jamais fabriquer
 * un "hero portrait" quand le panel est sur autre chose.
 */
export function isNonHeroDominantIntent(intent: ImageIntentType): boolean {
  return (
    isIntentInFamily(intent, "cutaway") ||
    isIntentInFamily(intent, "group") ||
    (isIntentInFamily(intent, "other_character") &&
      intent !== "hero_secondary_character") ||
    intent === "aftermath" ||
    intent === "symbolic_insert"
  );
}
