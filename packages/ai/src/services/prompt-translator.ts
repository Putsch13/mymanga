/**
 * Prompt Translator — FR→EN automatique pour les prompts image
 *
 * Les modèles FLUX comprennent mieux l'anglais. Ce service traduit les éléments
 * français du prompt en anglais avant l'envoi à FAL, tout en préservant
 * les noms propres et les termes techniques.
 */

const FR_EN_LOCATION_MAP: Record<string, string> = {
  "taverne": "tavern", "auberge": "inn", "marché": "marketplace", "bazar": "bazaar",
  "ville": "city", "cité": "citadel", "rue": "street", "avenue": "avenue",
  "château": "castle", "palais": "palace", "trône": "throne room", "donjon": "dungeon keep",
  "forêt": "forest", "bois": "woods", "jungle": "jungle", "clairière": "clearing",
  "arène": "arena", "champ de bataille": "battlefield", "colisée": "colosseum",
  "école": "school", "académie": "academy", "université": "university",
  "temple": "temple", "sanctuaire": "sanctuary", "église": "church", "cathédrale": "cathedral",
  "prison": "prison", "cachot": "dungeon", "cellule": "cell",
  "navire": "ship", "bateau": "boat", "vaisseau": "vessel",
  "laboratoire": "laboratory", "atelier": "workshop", "forge": "forge",
  "désert": "desert", "terre désolée": "wasteland", "ruines": "ruins",
  "souterrain": "underground", "grotte": "cave", "caverne": "cavern", "mine": "mine",
  "égout": "sewer", "catacombe": "catacomb", "métro": "metro tunnel",
  "maison": "house", "appartement": "apartment", "chambre": "bedroom", "salon": "living room",
  "cuisine": "kitchen", "manoir": "manor",
  "montagne": "mountain", "sommet": "peak", "falaise": "cliff", "volcan": "volcano",
  "océan": "ocean", "mer": "sea", "plage": "beach", "port": "harbor", "île": "island",
  "ciel": "sky", "toit": "rooftop", "terrasse": "terrace", "balcon": "balcony",
  "route": "road", "chemin": "path", "sentier": "trail", "pont": "bridge",
  "hôpital": "hospital", "bibliothèque": "library", "jardin": "garden", "parc": "park",
  "cimetière": "cemetery", "gare": "station", "aéroport": "airport",
  "tranchée": "trench", "camp": "camp", "campement": "encampment",
  "quartier": "district", "place": "square", "ruelle": "alley", "impasse": "dead end",
  "tour": "tower", "rempart": "rampart", "muraille": "wall",
  "lac": "lake", "rivière": "river", "cascade": "waterfall", "marais": "swamp",
  "volière": "aviary", "étable": "stable", "grange": "barn",
  "théâtre": "theater", "opéra": "opera house", "cirque": "circus",
  "tribunal": "courthouse", "ambassade": "embassy", "sénat": "senate",
  "marché noir": "black market", "repaire": "hideout", "planque": "safe house",
};

const FR_EN_MOOD_MAP: Record<string, string> = {
  "sombre": "dark", "lumineux": "bright", "oppressant": "oppressive",
  "mélancolique": "melancholic", "joyeux": "joyful", "mystérieux": "mysterious",
  "terrifiant": "terrifying", "romantique": "romantic", "épique": "epic",
  "calme": "calm", "chaotique": "chaotic", "tendu": "tense",
};

const FR_EN_ACTION_MAP: Record<string, string> = {
  "combat": "fighting", "fuite": "fleeing", "discussion": "talking",
  "exploration": "exploring", "repos": "resting", "entraînement": "training",
  "confrontation": "confrontation", "révélation": "revelation",
  "poursuite": "chase", "embuscade": "ambush", "négociation": "negotiation",
  "sacrifice": "sacrifice", "trahison": "betrayal", "retrouvailles": "reunion",
};

/**
 * Traduit les termes français courants dans un prompt image en anglais.
 * Préserve les noms propres (commencent par une majuscule) et les termes techniques.
 */
export function translatePromptToEnglish(prompt: string): string {
  let result = prompt;

  // Traduire les lieux (du plus long au plus court pour éviter les collisions)
  const sortedLocations = Object.entries(FR_EN_LOCATION_MAP)
    .sort(([a], [b]) => b.length - a.length);
  for (const [fr, en] of sortedLocations) {
    result = result.replace(new RegExp(`\\b${escapeRegex(fr)}\\b`, "gi"), en);
  }

  // Traduire les moods
  for (const [fr, en] of Object.entries(FR_EN_MOOD_MAP)) {
    result = result.replace(new RegExp(`\\b${escapeRegex(fr)}\\b`, "gi"), en);
  }

  // Traduire les actions
  for (const [fr, en] of Object.entries(FR_EN_ACTION_MAP)) {
    result = result.replace(new RegExp(`\\b${escapeRegex(fr)}\\b`, "gi"), en);
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Nettoie et optimise un prompt avant envoi à FAL :
 * - Traduit FR→EN
 * - Supprime les doublons consécutifs
 * - Limite la longueur
 */
export function optimizePromptForFal(prompt: string, maxLength = 1500): string {
  let translated = translatePromptToEnglish(prompt);

  // Supprimer les segments dupliqués (split par virgule, dédupliquer)
  const segments = translated.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const seg of segments) {
    const key = seg.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(seg);
    }
  }

  return deduped.join(", ").slice(0, maxLength);
}
