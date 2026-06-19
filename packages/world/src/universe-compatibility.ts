import type { OntologyEntry } from "./types";

/**
 * BUG-20 fix — Compatibilité stricte d'univers pour le scoring des ontologies
 * (NPC, Location, Creature).
 *
 * Problème résolu : sans filtre d'univers strict, un projet "cyberpunk" pouvait sélectionner
 * un "cartographe des dunes" (universes: post-apocalyptique/fantasy/seinen) ou une "halte
 * désertique semi-effondrée" à cause du bonus rarity inconditionnel + du match de tone
 * ("brutal" présent partout). Résultat : fuite massive fantasy/post-apo dans les prompts
 * cyberpunk.
 *
 * Règle : un entry n'est éligible que si AU MOINS UN de ses `universes` appartient à la
 * famille compatible de l'univers projet. Sinon, le score retourné est 0 (filtré).
 */

/**
 * Familles d'univers compatibles. Chaque clé = univers projet, valeur = liste des univers
 * d'ontologie considérés comme cohérents thématiquement.
 *
 * Normalisation : toutes les clés/valeurs sont en minuscules, trim, sans accents majeurs.
 */
const UNIVERSE_COMPATIBILITY: Record<string, string[]> = {
  cyberpunk: ["cyberpunk", "sci-fi", "mecha", "neo-noir"],
  "sci-fi": ["sci-fi", "cyberpunk", "mecha", "post-apocalyptique"],
  "science-fiction": ["sci-fi", "cyberpunk", "mecha", "post-apocalyptique"],
  fantasy: ["fantasy", "dark_fantasy", "dark fantasy", "isekai", "shōnen", "shonen"],
  "dark fantasy": ["dark_fantasy", "dark fantasy", "fantasy", "horreur", "horror"],
  dark_fantasy: ["dark_fantasy", "dark fantasy", "fantasy", "horreur", "horror"],
  "post-apocalyptique": ["post-apocalyptique", "post-apo", "sci-fi", "western"],
  "post-apo": ["post-apocalyptique", "post-apo", "sci-fi", "western"],
  horreur: ["horreur", "horror", "dark_fantasy", "dark fantasy"],
  horror: ["horreur", "horror", "dark_fantasy", "dark fantasy"],
  romance: ["romance", "shōjo", "shojo"],
  "shōnen": ["shōnen", "shonen", "fantasy", "mecha"],
  shonen: ["shōnen", "shonen", "fantasy", "mecha"],
  seinen: ["seinen"],
  "shōjo": ["shōjo", "shojo", "romance"],
  shojo: ["shōjo", "shojo", "romance"],
  western: ["western", "post-apocalyptique"],
  mecha: ["mecha", "sci-fi", "cyberpunk", "shōnen", "shonen"],
  isekai: ["isekai", "fantasy"],
  "médiéval": ["fantasy", "dark_fantasy", "dark fantasy"],
  medieval: ["fantasy", "dark_fantasy", "dark fantasy"],
};

function normalizeUniverse(universe: string): string {
  return universe.trim().toLowerCase();
}

/**
 * Retourne la liste des univers d'ontologie compatibles avec l'univers du projet.
 * Si l'univers projet n'est pas dans la table, on renvoie [universe] lui-même (compat
 * directe uniquement, pas d'ouverture).
 */
export function getCompatibleUniverses(projectUniverse: string): string[] {
  const normalized = normalizeUniverse(projectUniverse);
  if (UNIVERSE_COMPATIBILITY[normalized]) {
    return UNIVERSE_COMPATIBILITY[normalized];
  }
  // Recherche floue : si le projet contient un mot-clé connu, on retourne sa famille.
  for (const [key, family] of Object.entries(UNIVERSE_COMPATIBILITY)) {
    if (normalized.includes(key)) return family;
  }
  return [normalized];
}

/**
 * Vérifie si l'entry est compatible avec l'univers projet selon la table de compatibilité.
 * C'est le filtre DUR du scoring : si false, l'entry est exclue quel que soit le tone/tags.
 */
export function isEntryUniverseCompatible(
  entry: Pick<OntologyEntry, "universes">,
  projectUniverse: string,
): boolean {
  if (!entry.universes || entry.universes.length === 0) {
    // Entry sans restriction d'univers : toujours compatible (fallback générique).
    return true;
  }
  const compatibleFamily = getCompatibleUniverses(projectUniverse);
  const entryUniverses = entry.universes.map(normalizeUniverse);
  return entryUniverses.some((u) => compatibleFamily.includes(u));
}
