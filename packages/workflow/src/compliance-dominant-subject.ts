/**
 * P0.4 (sprint 5) — Mapping canonique `dominantSubject.kind` (résolveur
 * unique) vers la string consommée par `validateShotCompliance`.
 *
 * Règles :
 *   - TOUT kind non-héros (enemy, npc, ally, environment, aftermath, prop,
 *     reaction, group) est préservé et n'est JAMAIS reclassé en "hero".
 *   - Quand le résolveur renvoie `none`, on retombe sur `blueprintFocus` si
 *     disponible (même mapping qu'avant l'intro du résolveur canonique).
 *   - Sinon on renvoie `"unknown"` plutôt que `"hero"` → pas de biais héros
 *     dans le cas par défaut.
 *
 * Cette fonction pure est utilisée par `image-generation-pass.ts` pour
 * construire `renderedAnalysis.dominantSubject` sans jamais réintroduire
 * d'heuristique locale basée uniquement sur `backgroundPresenceScore`.
 */

export type DominantKind =
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

export type ComplianceDominantSubject =
  | "hero"
  | "enemy"
  | "npc"
  | "environment"
  | "prop"
  | "reaction"
  | "group"
  | "unknown";

export function mapCanonicalToComplianceDominantSubject(
  kind: DominantKind,
  blueprintFocus: string | null,
): ComplianceDominantSubject {
  switch (kind) {
    case "hero":
      return "hero";
    case "enemy":
      return "enemy";
    case "ally":
    case "npc":
      return "npc";
    case "environment":
    case "aftermath":
      return "environment";
    case "prop":
      return "prop";
    case "reaction":
      return "reaction";
    case "group":
      return "group";
    case "none":
      // Fallback sur blueprintFocus s'il est renseigné. Aucun biais hero.
      if (blueprintFocus === "environment" || blueprintFocus === "aftermath") return "environment";
      if (blueprintFocus === "enemy" || blueprintFocus === "antagonist") return "enemy";
      if (blueprintFocus === "npc" || blueprintFocus === "important_npc") return "npc";
      if (blueprintFocus === "prop") return "prop";
      if (blueprintFocus === "reaction") return "reaction";
      if (blueprintFocus === "group") return "group";
      if (blueprintFocus === "hero") return "hero";
      return "unknown";
  }
}
