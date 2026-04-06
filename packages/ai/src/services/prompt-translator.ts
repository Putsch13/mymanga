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

const FR_EN_CHARACTER_MAP: Record<string, string> = {
  "homme": "man", "femme": "woman", "garçon": "boy", "fille": "girl",
  "cheveux courts": "short hair", "cheveux longs": "long hair", "cheveux mi-longs": "medium length hair",
  "cheveux rasés": "shaved head", "chauve": "bald", "barbe": "beard", "moustache": "mustache",
  "cicatrice": "scar", "tatouage": "tattoo", "prothèse": "prosthetic",
  "bras bionique": "bionic arm", "œil mécanique": "mechanical eye",
  "musclé": "muscular", "mince": "slim", "corpulent": "heavyset",
  "grand": "tall", "petit": "short", "âgé": "elderly", "jeune": "young",
  "yeux bleus": "blue eyes", "yeux verts": "green eyes", "yeux marrons": "brown eyes",
  "yeux noirs": "black eyes", "yeux rouges": "red eyes",
  "cheveux blonds": "blonde hair", "cheveux noirs": "black hair", "cheveux bruns": "brown hair",
  "cheveux roux": "red hair", "cheveux blancs": "white hair", "cheveux gris": "gray hair",
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
 * Utilise une détection par délimiteurs non-alphanumériques (compatible accents FR).
 */
export function translatePromptToEnglish(prompt: string): string {
  let result = prompt;

  // Normaliser les accents pour la comparaison (NFKC)
  const normalized = result.normalize("NFKC");
  let working = normalized;

  // Délimiteur : début/fin de chaîne ou caractère non-lettre (compatible accents)
  const wordBoundary = (term: string) =>
    new RegExp(`(?<![a-zA-ZÀ-ÿ])${escapeRegex(term)}(?![a-zA-ZÀ-ÿ])`, "gi");

  // Traduire les lieux (du plus long au plus court pour éviter les collisions)
  const sortedLocations = Object.entries(FR_EN_LOCATION_MAP)
    .sort(([a], [b]) => b.length - a.length);
  for (const [fr, en] of sortedLocations) {
    working = working.replace(wordBoundary(fr), en);
  }

  // Traduire les moods
  for (const [fr, en] of Object.entries(FR_EN_MOOD_MAP)) {
    working = working.replace(wordBoundary(fr), en);
  }

  // Traduire les actions
  for (const [fr, en] of Object.entries(FR_EN_ACTION_MAP)) {
    working = working.replace(wordBoundary(fr), en);
  }

  // Traduire les termes personnage (genre, cheveux, corps)
  for (const [fr, en] of Object.entries(FR_EN_CHARACTER_MAP)) {
    working = working.replace(wordBoundary(fr), en);
  }

  return working;
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
