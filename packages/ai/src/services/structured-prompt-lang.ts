/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║ LEGACY — PREMIUM-FORBIDDEN (P0.B quarantine)                       ║
 * ╠════════════════════════════════════════════════════════════════════╣
 * ║ Le chemin premium v3 construit ses prompts DIRECTEMENT en anglais  ║
 * ║ via `minimal-panel-prompt-builder.ts`. Plus jamais besoin de       ║
 * ║ traduire FR→EN à la sortie d'un prompt français généré par le      ║
 * ║ composer legacy.                                                   ║
 * ║                                                                    ║
 * ║ `premium-path-legacy-isolation.test.ts` bloque tout import.        ║
 * ╚════════════════════════════════════════════════════════════════════╝
 *
 * @deprecated Prompt Translator — FR→EN automatique pour les prompts image legacy.
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
 * - Tronque en préservant les segments complets depuis la fin
 *   (plutôt qu'un `slice(0, maxLength)` qui coupe les critiques en cours de mot).
 *
 * @deprecated LEGACY. **Ne pas utiliser dans le render-pass v3.**
 *
 * La pipeline v3 construit les prompts directement en anglais via
 * `buildMinimalPanelPrompt` à partir d'un `PanelRenderSpec`. Plus de
 * traduction FR→EN à la volée dans le chemin critique du rendu image.
 * Cette fonction reste disponible pour du tooling legacy (audit, export
 * documentaire), pas pour le rendu FAL v3.
 */
export function optimizePromptForFal(prompt: string, maxLength = 1500): string {
  const translated = translatePromptToEnglish(prompt);

  // Dédupe par segment (split par virgule).
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

  return truncateByBudget(deduped, maxLength);
}

/**
 * Tronque une liste de segments en préservant les entrées complètes depuis la fin.
 * - Ne coupe jamais un mot ou une phrase au milieu.
 * - Retire les derniers segments jusqu'à passer sous `maxLength`.
 * - Garantit au minimum le premier segment (même s'il dépasse légèrement).
 */
export function truncateByBudget(segments: string[], maxLength: number): string {
  if (segments.length === 0) return "";
  const joined = segments.join(", ");
  if (joined.length <= maxLength) return joined;

  const kept = [...segments];
  while (kept.length > 1 && kept.join(", ").length > maxLength) {
    kept.pop();
  }
  return kept.join(", ");
}

/**
 * Variante priorisée — assemble un prompt en respectant un budget de caractères
 * réparti selon la priorité des segments.
 *
 * - `priority=1` : critique (char lock, action, framing) — jamais tronqué.
 * - `priority=2` : important (spatial, style, continuity).
 * - `priority=3` : contextuel (genre, beat effects).
 * - `priority=4` : décoratif (tail, subtext) — tronqué en premier.
 *
 * Algorithme :
 *   1. Dédoublonnage global par contenu (case-insensitive).
 *   2. On conserve d'abord tous les P1, puis ajoute P2/P3/P4 tant que le budget
 *      n'est pas atteint.
 *   3. Si même tous les P1 dépassent la limite, on tronque par segment (queue
 *      en premier) avec `truncateByBudget`.
 *
 * Le résultat reste une string compatible avec le pipeline existant.
 */
/**
 * Traduit un prompt structuré par sections (`[TAG] contenu…`) en préservant :
 *   - les tags de section (jamais traduits),
 *   - les noms propres en `PascalCase` ou `CamelCase`,
 *   - les IDs canoniques `canon:*`, `lora:*`, `npc:*`, `loc:*`,
 *   - les ratings (`teen`, `mature`, `explicit_adult`).
 *
 * Passe uniquement par les dictionnaires contrôlés (pas d'interprétation
 * libre). Si un segment contient du texte non traduit, il est conservé
 * tel quel (la traduction n'est pas agressive pour éviter les pertes de sens).
 */
export function translateStructuredPrompt(structuredFr: string): string {
  const lines = structuredFr.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      out.push("");
      continue;
    }
    const match = /^(\s*)(\[[A-Z_]+\])\s*(.*)$/.exec(line);
    if (match) {
      const [, indent, tag, rest] = match;
      out.push(`${indent}${tag} ${translatePromptToEnglish(rest)}`.trimEnd());
    } else {
      out.push(translatePromptToEnglish(line));
    }
  }
  return out.join("\n");
}

/**
 * Vérifie qu'un prompt final est bien en anglais — heuristique simple basée
 * sur la détection de tokens manifestement français encore présents.
 * Retourne la liste des tokens FR détectés (vide = OK pour envoi provider).
 */
export function detectResidualFrenchTokens(prompt: string): string[] {
  const frTokens = new Set<string>();
  const lower = prompt.toLowerCase();
  const redFlags = [
    "héros",
    "ennemi",
    "château",
    "forêt",
    "décor",
    "arrière-plan",
    "premier plan",
    "personnage principal",
    "cheveux",
    "yeux bleus",
    "yeux verts",
    "une jeune",
    "le héros",
    "la héroïne",
  ];
  for (const token of redFlags) {
    if (lower.includes(token.toLowerCase())) frTokens.add(token);
  }
  return Array.from(frTokens);
}

export function composePrioritizedPrompt(
  segments: ReadonlyArray<{ priority: 1 | 2 | 3 | 4; text: string }>,
  maxLength = 1500,
): string {
  const seen = new Set<string>();
  const byPriority: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };

  for (const { priority, text } of segments) {
    const cleaned = translatePromptToEnglish(text).trim();
    if (!cleaned) continue;
    const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      byPriority[priority].push(part);
    }
  }

  const mustHave = byPriority[1];
  const optionalOrder: string[][] = [byPriority[2], byPriority[3], byPriority[4]];

  let current = mustHave.join(", ");
  if (current.length >= maxLength) {
    return truncateByBudget(mustHave, maxLength);
  }

  for (const bucket of optionalOrder) {
    for (const segment of bucket) {
      const candidate = current.length === 0 ? segment : `${current}, ${segment}`;
      if (candidate.length > maxLength) return current;
      current = candidate;
    }
  }
  return current;
}
