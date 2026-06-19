/**
 * Scene Environment Engine
 *
 * Génère des descriptions d'environnement intelligentes pour les prompts image.
 * Combine : lieu détecté × genre du projet × tone × lore × mood × heure × météo × foule.
 * Couvre 100+ combinaisons de scènes vivantes.
 */

export interface EnvironmentContext {
  location: string;
  mood: string;
  genre: string;
  tone: string;
  visualStyle: string;
  lore?: string | null;
  worldRules?: unknown;
  sceneCharCount: number;
  panelCharCount: number;
  sceneSummary?: string | null;
  /** Lieux nommés connus dans la bible/lore du projet */
  knownLocations?: Array<{ name: string; description: string | null }> | null;
  /** Glossaire du projet (termes, technos, factions…) */
  glossary?: unknown;
  seed?: number | null;
}

function seededIndex(seed: number, max: number) {
  if (max <= 0) return 0;
  let state = seed | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return Math.abs(state) % max;
}

// ── Genre flavors : ajustent CHAQUE lieu selon l'univers ──────────────────

const GENRE_FLAVORS: Record<string, Record<string, string>> = {
  cyberpunk: {
    tavern: "neon-lit dive bar, holographic menus, synth-punk patrons with cybernetic implants, flickering neon signs",
    market: "black market tech bazaar, augmented reality overlays, vendors selling cybernetic parts under neon rain",
    city: "rain-soaked neon cityscape, towering megacorp buildings, flying vehicles, crowded cyberpunk streets",
    castle: "corporate headquarters tower, chrome and glass interior, armed security drones, holographic displays",
    forest: "overgrown industrial ruins, nature reclaiming concrete, bioluminescent mutant plants, toxic mist",
    arena: "underground cage fight ring, crowd betting on augmented fighters, sparking electric fences",
    school: "corporate training academy, sterile white corridors, students with neural interfaces",
    temple: "abandoned server cathedral, towering data banks as pillars, digital spirits flickering",
    prison: "high-tech containment facility, energy barriers, surveillance drones, inmates with deactivated implants",
    ship: "cargo freighter in orbit, rust and exposed circuits, zero-gravity corridors, viewport to Earth",
    lab: "illegal biotech lab, vats of synthetic tissue, holographic DNA strands, scientists in hazmat suits",
    wasteland: "irradiated wasteland outside city walls, scrap metal shelters, acid rain puddles",
    underground: "sewer tunnels converted to hacker dens, cables everywhere, dim screens glowing",
    home: "cramped apartment pod, wall of screens, instant ramen wrappers, view of neon skyline",
    mountain: "relay station on toxic peak, wind turbines, satellite dishes, acid clouds below",
    ocean: "underwater data center, pressurized domes, submarine traffic, deep-sea creatures with bioluminescence",
  },
  fantasy: {
    tavern: "medieval tavern, roaring fireplace, wooden mugs, armored adventurers, bard playing lute",
    market: "fantasy bazaar, exotic potions, enchanted weapons on display, mystical creatures in cages",
    city: "walled medieval city, cobblestone streets, horse-drawn carts, church spires, banner-draped buildings",
    castle: "grand stone castle, throne room with banners, armored guards, stained glass windows, torchlight",
    forest: "enchanted forest, ancient trees with glowing runes, fairy lights, mystical fog, hidden paths",
    arena: "gladiatorial colosseum, magical barriers, roaring crowd, sand and blood stains",
    school: "wizard academy, floating books, potion laboratories, students practicing spells in corridors",
    temple: "ancient stone temple, mystical altar, divine light beams, priest in ceremonial robes",
    prison: "dungeon with iron chains, stone walls dripping water, torch-lit corridors, skeletal remains",
    ship: "wooden sailing ship, billowing sails, crew on deck, sea monsters in distant waves",
    lab: "alchemist workshop, bubbling cauldrons, crystal phials, arcane diagrams on walls",
    wasteland: "cursed wasteland, dead trees, corrupted ground, dark sky with crimson lightning",
    underground: "dwarven mines, crystal veins glowing, carved stone halls, minecart tracks",
    home: "cozy cottage with herb garden, stone hearth, wooden furniture, warm candlelight",
    mountain: "snow-capped peak, dragon lair entrance, ancient ruins, howling wind",
    ocean: "merfolk kingdom, coral palace, schools of exotic fish, underwater light rays",
  },
  "dark fantasy": {
    tavern: "decrepit tavern, suspicious patrons hiding faces, blood-stained floor, dim oil lamps",
    market: "black market in catacombs, cursed artifacts, hooded sellers, whispered deals",
    city: "plague-ridden city, corpse carts, crows, crumbling buildings, desperate civilians",
    castle: "dark gothic castle, gargoyles, chains, blood-red tapestries, shadows with eyes",
    forest: "corrupted dark forest, twisted trees with faces, poisonous fog, bones in the mud",
    arena: "death pit, chained monsters, bloodthirsty audience, ritualistic symbols",
    temple: "desecrated temple, broken idols, dark rituals in progress, unholy symbols glowing",
    prison: "torture dungeon, screams echoing, iron maidens, blood channels in floor",
    wasteland: "ashen wasteland, giant skeletal remains, perpetual eclipse, wandering lost souls",
    underground: "labyrinth of flesh, organic walls pulsing, eldritch whispers, impossible geometry",
  },
  western: {
    tavern: "dusty saloon, swinging doors, piano player, cowboys at poker table, whiskey bottles",
    market: "frontier trading post, horse hitching posts, general store, barrels of supplies",
    city: "wild west town, wooden buildings, tumbleweeds, dusty main street, sheriff office",
    castle: "fort with wooden palisade, watchtowers, cavalry officers, American flag",
    forest: "sparse desert scrubland, cacti, distant mesas, rattlesnake territory",
    arena: "town square at high noon, dueling ground, crowd watching from porches, tension",
    prison: "frontier jail, iron bars, wanted posters on walls, sleeping deputy",
    wasteland: "endless desert, cracked earth, bleached bones, vultures circling",
    home: "ranch house, porch with rocking chair, horses in corral, sunset plains",
  },
  "post-apocalyptique": {
    tavern: "makeshift bar in ruined building, scavenged furniture, radiation-scarred patrons",
    market: "scrap trader camp, barter economy, improvised shelters, gas mask vendors",
    city: "ruined city overgrown with vegetation, collapsed skyscrapers, feral animals",
    castle: "fortified survivor compound, walls of car wrecks, guard towers with spotlights",
    forest: "mutated forest, oversized flora, strange creatures, toxic spores in air",
    arena: "thunderdome, scrap metal walls, crowd of raiders cheering, makeshift weapons",
    wasteland: "nuclear wasteland, rusted vehicles, radiation storms on horizon, desolate emptiness",
    underground: "metro tunnels converted to settlement, cooking fires, families in tents, dripping ceiling",
    lab: "abandoned research facility, biohazard signs, shattered containment pods, mutant specimens",
  },
  "sci-fi": {
    tavern: "space station cantina, alien species mingling, holographic bartender, viewport to stars",
    market: "orbital trading hub, anti-gravity cargo pods, alien merchants, universal translators",
    city: "futuristic metropolis, mag-lev trains, towering glass spires, drone delivery swarms",
    castle: "command bridge of capital ship, holographic star map, officers at stations",
    forest: "alien jungle, bioluminescent plants, unknown fauna, two moons visible",
    arena: "zero-gravity combat arena, energy shields, spectators in pressurized viewing pods",
    school: "space academy, flight simulators, cadets in uniform, viewport to nebula",
    ship: "starship interior, corridors with running lights, engine hum, crew at stations",
    lab: "advanced research lab, AI assistants, quantum computers, clean white aesthetic",
    ocean: "liquid methane sea on alien world, submersible craft, alien marine life",
  },
  horreur: {
    tavern: "abandoned inn, cobwebs, rotting wood, something moving in the shadows, creaking sounds",
    city: "fog-shrouded silent town, empty cars, flickering streetlights, something watching from windows",
    castle: "haunted mansion, portraits with moving eyes, endless corridors, ghostly whispers",
    forest: "dead forest at midnight, no animal sounds, pale moonlight, shapes between trees",
    temple: "occult temple, blood rituals, chanting in unknown language, eldritch symbols",
    prison: "asylum, padded cells with scratch marks, echoing screams, flickering fluorescent lights",
    underground: "catacombs with fresh blood, something breathing in the dark, walls closing in",
    home: "normal house hiding something wrong, family photos with faces scratched out, locked basement door",
    wasteland: "silent grey void, no horizon, impossible geometry, sanity-eroding emptiness",
  },
  romance: {
    tavern: "cozy café, warm lighting, couple at corner table, rain on windows, jazz playing softly",
    market: "flower market, cherry blossoms falling, colorful bouquets, romantic atmosphere",
    city: "Paris-like city at sunset, bridges over river, warm streetlights, couples walking",
    castle: "elegant ballroom, chandeliers, orchestra, couples dancing, moonlight through tall windows",
    forest: "sunlit meadow clearing, wildflowers, butterflies, picnic blanket under oak tree",
    school: "rooftop at sunset, confession scene, school uniforms, wind in hair, golden light",
    home: "cozy apartment, shared blanket on couch, warm tea, rain outside, intimate atmosphere",
    ocean: "moonlit beach, waves gently crashing, footprints in sand, starry sky",
  },
  seinen: {
    tavern: "gritty izakaya, salary men drinking, cigarette smoke, neon signs outside, realistic atmosphere",
    city: "Tokyo-like urban sprawl, crowds at crossing, office buildings, rain-slicked streets",
    arena: "underground fighting ring, brutal realistic combat, blood and sweat, no mercy",
    home: "messy bachelor apartment, beer cans, work documents scattered, lonely atmosphere",
  },
  shōnen: {
    tavern: "lively guild hall, adventurers comparing loot, job board on wall, energetic atmosphere",
    arena: "tournament arena, cheering crowd, dramatic entrances, rival fighters posing",
    school: "fighting academy, students training special moves, rival groups, dramatic poses",
    forest: "training ground in woods, broken trees from practice, determined expression",
  },
  isekai: {
    tavern: "RPG-style adventurer guild, quest board, party formation area, diverse fantasy races",
    market: "fantasy item shop, stats visible on items, merchant NPC vibes, game-like interface hints",
    city: "medieval city with subtle game elements, level-appropriate monsters nearby",
    forest: "starter zone forest, low-level monsters, herbs to gather, tutorial vibes transitioning to danger",
  },
  mecha: {
    arena: "mecha hangar bay, giant robots being maintained, pilots suiting up, industrial scale",
    city: "city with towering mecha visible between buildings, defense force on patrol",
    wasteland: "battlefield littered with destroyed mecha, smoking craters, damaged cockpits",
    ship: "aircraft carrier deck, mecha launch catapults, crew scrambling, alert klaxons",
  },
};

// ── Lieux détectables (100+ patterns FR/EN) ──────────────────────────────

const LOCATION_PATTERNS: Array<{ keys: string[]; category: string }> = [
  { keys: ["tavern", "bar", "auberge", "inn", "pub", "saloon", "cantina", "café", "bistrot", "izakaya", "guild hall", "guilde"], category: "tavern" },
  { keys: ["marché", "market", "bazar", "bazaar", "plaza", "souk", "trading", "commerce", "boutique", "shop", "échoppe", "magasin"], category: "market" },
  { keys: ["ville", "city", "cité", "rue", "street", "avenue", "boulevard", "quartier", "district", "métropole", "mégapole", "metropolis"], category: "city" },
  { keys: ["château", "castle", "palais", "palace", "trône", "throne", "donjon", "keep", "tour", "tower", "citadelle", "citadel", "forteresse", "fortress"], category: "castle" },
  { keys: ["forêt", "forest", "bois", "wood", "jungle", "clairière", "clearing", "bosquet", "grove", "canopée"], category: "forest" },
  { keys: ["combat", "arène", "arena", "battlefield", "champ de bataille", "ring", "colisée", "colosseum", "duel", "tournoi", "tournament"], category: "arena" },
  { keys: ["école", "school", "académie", "academy", "université", "university", "lycée", "collège", "campus", "classe", "classroom"], category: "school" },
  { keys: ["temple", "sanctuaire", "sanctuary", "église", "church", "cathédrale", "cathedral", "autel", "altar", "shrine", "monastère", "monastery"], category: "temple" },
  { keys: ["prison", "cachot", "dungeon", "cellule", "cell", "geôle", "jail", "bagne", "asile", "asylum"], category: "prison" },
  { keys: ["navire", "ship", "bateau", "boat", "vaisseau", "vessel", "pont du navire", "deck", "cabine", "cabin", "sous-marin", "submarine"], category: "ship" },
  { keys: ["laboratoire", "lab", "labo", "atelier", "workshop", "forge", "foundry", "usine", "factory"], category: "lab" },
  { keys: ["désert", "desert", "wasteland", "terre désolée", "ruines", "ruins", "décombres", "rubble", "friche"], category: "wasteland" },
  { keys: ["souterrain", "underground", "tunnel", "grotte", "cave", "caverne", "cavern", "mine", "égout", "sewer", "catacombe", "catacomb", "métro", "metro"], category: "underground" },
  { keys: ["maison", "home", "appartement", "apartment", "chambre", "bedroom", "salon", "living room", "cuisine", "kitchen", "manoir", "manor", "résidence"], category: "home" },
  { keys: ["montagne", "mountain", "sommet", "peak", "col", "pass", "falaise", "cliff", "pic", "volcan", "volcano", "cratère"], category: "mountain" },
  { keys: ["océan", "ocean", "mer", "sea", "plage", "beach", "côte", "coast", "port", "harbor", "quai", "dock", "phare", "lighthouse", "île", "island"], category: "ocean" },
  { keys: ["ciel", "sky", "nuage", "cloud", "air", "vol", "flight", "aérien", "aerial", "toit", "rooftop", "terrasse", "balcon", "balcony"], category: "sky" },
  { keys: ["route", "road", "chemin", "path", "sentier", "trail", "pont", "bridge", "carrefour", "crossroad", "passage", "corridor"], category: "road" },
  { keys: ["hôpital", "hospital", "infirmerie", "infirmary", "clinique", "clinic", "morgue", "médecin", "doctor"], category: "hospital" },
  { keys: ["bibliothèque", "library", "archive", "archives", "salle de lecture", "reading room", "librairie", "bookshop"], category: "library" },
  { keys: ["jardin", "garden", "parc", "park", "verger", "orchard", "serre", "greenhouse", "pré", "meadow", "champ", "field"], category: "garden" },
  { keys: ["cimetière", "cemetery", "graveyard", "tombe", "tomb", "mausolée", "mausoleum", "crypte", "crypt"], category: "cemetery" },
  { keys: ["gare", "station", "aéroport", "airport", "hangar", "dock", "spatioport", "spaceport", "terminal"], category: "station" },
  { keys: ["tranchée", "trench", "bunker", "camp", "campement", "encampment", "bivouac", "poste de garde", "checkpoint"], category: "military" },
];

// ── Fallback universel par catégorie (quand pas de genre match) ──────────

const UNIVERSAL_SCENES: Record<string, string> = {
  tavern: "interior establishment, patrons present, warm lighting, social gathering place",
  market: "open-air or covered market, vendors and buyers, diverse goods on display",
  city: "urban setting, buildings and streets, people going about their day, architecture",
  castle: "imposing fortified structure, grand interior, authority and power",
  forest: "natural environment, trees and vegetation, filtered light, wildlife hints",
  arena: "combat or competition venue, audience space, dramatic staging",
  school: "educational institution, students and corridors, institutional design",
  temple: "sacred or spiritual place, ritual elements, reverence and mystery",
  prison: "confinement space, barriers and locks, oppressive atmosphere",
  ship: "vessel interior or deck, crew activity, journey and movement",
  lab: "research or craft space, tools and experiments, intellectual atmosphere",
  wasteland: "desolate open terrain, ruins or emptiness, survival atmosphere",
  underground: "subterranean space, limited light, enclosed tunnels or chambers",
  home: "personal living space, comfort items, intimate atmosphere",
  mountain: "elevated terrain, vast views, challenging landscape, altitude",
  ocean: "water body, coastal or deep sea, maritime atmosphere",
  sky: "elevated viewpoint, open air, clouds or stars, vertigo or freedom",
  road: "transit space, journey and movement, connecting places",
  hospital: "medical facility, clinical atmosphere, healing and pain",
  library: "knowledge repository, books and scrolls, quiet studious atmosphere",
  garden: "cultivated nature, flowers or crops, peaceful outdoors",
  cemetery: "burial ground, monuments and memorials, death and remembrance",
  station: "transit hub, arrivals and departures, waiting and movement",
  military: "fortified position, tactical setup, soldiers and equipment",
};

// ── Mood × time of day ──────────────────────────────────────────────────

const MOOD_LIGHTING: Record<string, string> = {
  action: "dynamic lighting, motion blur particles, energy crackling in the air, speed lines",
  tension: "low-key lighting, deep shadows, single harsh light source, silhouettes",
  emotion: "soft diffused light, warm tones, shallow depth of field, intimate framing",
  revelation: "sudden dramatic spotlight, everything else dark, frozen moment of truth",
  calm: "soft golden hour sunlight, gentle shadows, peaceful ambient glow",
  horror: "near-total darkness, single flickering light, unsettling colored glow, something in shadows",
  romance: "warm sunset or moonlight, soft bokeh, dreamy atmosphere, petal particles",
  comedy: "bright flat lighting, exaggerated expressions, clean simple background",
  dramatic: "high contrast chiaroscuro, theatrical staging, dramatic camera angle",
};

// ── Creatures / entities par genre ──────────────────────────────────────

const GENRE_CREATURES: Record<string, string[]> = {
  fantasy: ["dragons in distant sky", "fairy lights floating", "mystical familiar creature nearby", "elemental spirits"],
  "dark fantasy": ["shadowy wraiths", "undead lurking", "corrupted creatures", "demonic entities partially visible"],
  cyberpunk: ["stray cyber-dogs", "holographic adverts with AI faces", "drones scanning crowd", "augmented street cats"],
  "sci-fi": ["alien species in crowd", "robotic assistants walking", "holographic pets", "exotic alien fauna"],
  horreur: ["something barely visible in shadow", "unnatural movement in periphery", "eyes reflecting in darkness"],
  "post-apocalyptique": ["mutated animals", "feral dogs in pack", "irradiated insects", "scavenger birds circling"],
  isekai: ["fantasy RPG creatures", "tamed monsters as mounts", "slimes near road", "familiar spirits"],
  mecha: ["small maintenance drones", "mini-robots", "mechanical birds", "automated cleaning units"],
  western: ["horses tied to posts", "vultures on rooftops", "cattle in distance", "stray dog"],
  romance: ["butterflies", "birds singing", "cat lounging nearby", "gentle breeze visible in curtains"],
  shōnen: ["training dummies", "elemental effects from practice", "rival team in background"],
  seinen: ["stray cats", "pigeons on power lines", "urban wildlife", "rain dripping"],
};

/**
 * Moteur principal : génère une description d'environnement riche et cohérente
 * en combinant le lieu × genre × tone × mood × lore.
 */
export function composeEnvironment(ctx: EnvironmentContext): string {
  const locLower = ctx.location.toLowerCase();
  const genreLower = ctx.genre.toLowerCase();
  const toneLower = ctx.tone.toLowerCase();
  const parts: string[] = [];

  // 1. Détecter la catégorie du lieu
  let category = "city";
  for (const pattern of LOCATION_PATTERNS) {
    if (pattern.keys.some((k) => locLower.includes(k))) {
      category = pattern.category;
      break;
    }
  }

  // 2. Chercher un flavor de genre pour ce lieu
  let genreKey = genreLower;
  const genreAliases: Record<string, string> = {
    "shōnen": "shōnen", "shonen": "shōnen", "action": "shōnen",
    "drame": "seinen", "psychologique": "seinen", "thriller": "seinen",
    "shōjo": "romance", "shojo": "romance",
    "horreur": "horreur", "horror": "horreur",
    "cyberpunk": "cyberpunk", "cyber": "cyberpunk",
    "sci-fi": "sci-fi", "science-fiction": "sci-fi", "space opera": "sci-fi",
    "western": "western",
    "post-apocalyptique": "post-apocalyptique", "post-apo": "post-apocalyptique", "apocalypse": "post-apocalyptique",
    "fantasy": "fantasy", "médiéval": "fantasy", "medieval": "fantasy",
    "dark fantasy": "dark fantasy",
    "isekai": "isekai",
    "mecha": "mecha",
  };
  for (const [alias, mapped] of Object.entries(genreAliases)) {
    if (genreLower.includes(alias)) { genreKey = mapped; break; }
  }

  const genreFlavors = GENRE_FLAVORS[genreKey];
  if (genreFlavors?.[category]) {
    parts.push(genreFlavors[category]);
  } else {
    parts.push(UNIVERSAL_SCENES[category] ?? "detailed environment, atmospheric setting");
  }

  // 3. Villes / lieux nommés : si l'user a défini "Neo-Tokyo" ou "La Citadelle de Kael",
  //    on détecte le nom dans le lieu et on injecte sa description unique.
  if (ctx.knownLocations && ctx.knownLocations.length > 0) {
    for (const known of ctx.knownLocations) {
      if (locLower.includes(known.name.toLowerCase()) && known.description) {
        parts.push(`named location "${known.name}": ${known.description.slice(0, 200)}`);
        break;
      }
    }
  }

  // 3b. Lore / worldRules → inject context-specific details
  if (ctx.lore && typeof ctx.lore === "string" && ctx.lore.length > 10) {
    const loreHint = ctx.lore.slice(0, 150).replace(/\n/g, " ");
    parts.push(`world lore: ${loreHint}`);
  }

  // 3c. Glossaire → si un terme du glossaire apparaît dans la scène
  if (ctx.glossary && typeof ctx.glossary === "object") {
    const glossaryEntries = Object.entries(ctx.glossary as Record<string, unknown>);
    for (const [term, def] of glossaryEntries.slice(0, 10)) {
      if (locLower.includes(term.toLowerCase()) || (ctx.sceneSummary ?? "").toLowerCase().includes(term.toLowerCase())) {
        parts.push(`${term}: ${String(def).slice(0, 80)}`);
        break;
      }
    }
  }

  // 4. Lighting / heure du jour selon mood
  const lighting = MOOD_LIGHTING[ctx.mood];
  if (lighting) parts.push(lighting);

  // 5. Tone flavor
  if (toneLower.includes("sombre") || toneLower.includes("dark") || toneLower.includes("brutal")) {
    parts.push("dark oppressive atmosphere, muted desaturated colors");
  } else if (toneLower.includes("épique") || toneLower.includes("epic")) {
    parts.push("epic cinematic scale, vast sense of grandeur");
  } else if (toneLower.includes("mélancolique") || toneLower.includes("melancholic")) {
    parts.push("wistful melancholic atmosphere, nostalgic soft tones");
  } else if (toneLower.includes("humoristique") || toneLower.includes("comedy")) {
    parts.push("lighthearted comedic atmosphere, bright cheerful tones");
  } else if (toneLower.includes("oppressant") || toneLower.includes("oppressive")) {
    parts.push("claustrophobic oppressive atmosphere, walls closing in feel");
  }

  // 6. Creatures / éléments vivants selon le genre
  const creatures = GENRE_CREATURES[genreKey];
  if (creatures && creatures.length > 0) {
    const seedBase =
      ctx.seed
      ?? `${ctx.location}|${ctx.mood}|${ctx.genre}|${ctx.sceneSummary ?? ""}`
        .split("")
        .reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) | 0, 7);
    const pick = creatures[seededIndex(seedBase, creatures.length)];
    if (pick) parts.push(pick);
  }

  // 7. Foule / background characters
  if (ctx.sceneCharCount > ctx.panelCharCount && ctx.panelCharCount <= 2) {
    parts.push("other characters visible in background, environmental storytelling");
  }

  // 8. Contexte narratif résumé (aide l'IA à comprendre pourquoi cette scène existe)
  if (ctx.sceneSummary) {
    parts.push(`scene purpose: ${ctx.sceneSummary.slice(0, 150)}`);
  }

  // 9. Visual style override si spécifique
  if (ctx.visualStyle && !parts.some((p) => p.includes(ctx.visualStyle))) {
    parts.push(ctx.visualStyle);
  }

  return parts.filter(Boolean).join(", ");
}
