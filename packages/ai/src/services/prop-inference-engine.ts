/**
 * Moteur d'inférence automatique des props narratifs.
 * Déduit les accessoires/armes/objets automatiquement en fonction de l'histoire,
 * sans configuration manuelle utilisateur.
 */

import type {
  NarrativeFact,
  RequiredProp,
  PropNarrativeRole,
  PropVisibilityMode,
  PropOwnerCategory,
} from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";

export type UniverseType =
  | "ninja"
  | "cyberpunk"
  | "post_apo"
  | "school_life"
  | "mecha"
  | "fantasy"
  | "military"
  | "medical"
  | "urban"
  | "generic";

export interface PropInferenceContext {
  universeType?: UniverseType | null;
  projectGenre?: string | null;
  projectTone?: string | null;
  heroCharacterId?: string | null;
  /**
   * Premium-only : n'impose des props « domaine » (smartphone, grimoire, etc.)
   * que si le texte du beat contient une preuve explicite (mot ou expression dédiée).
   */
  premiumStrictChapterSourcing?: boolean;
}

// ─── Règle "objet utilisé = objet visible" ────────────────────────────────────

const USAGE_VERBS_REQUIRING_VISIBILITY = [
  "appelle", "calls",
  "écrit", "writes",
  "tape", "types",
  "vise", "aims",
  "lance", "throws",
  "tranche", "slashes",
  "pirater", "hacks",
  "scanne", "scans",
  "injecte", "injects",
  "brandit", "wields",
  "transmet", "transmits",
  "tire", "shoots",
  "dégaine", "draws",
  "utilise", "uses",
  "saisit", "grabs",
  "sort", "pulls out",
  "branche", "plugs",
];

const STRICT_PREMIUM_PROP_NAMES = new Set<string>([
  "smartphone",
  "grimoire",
  "talisman",
  "document / dossier",
  "photo / evidence",
  "laptop",
  "tablet",
]);

function matchesStrictPremiumPropEvidence(template: PropTemplate, text: string): boolean {
  const lower = text.toLowerCase();
  const key = template.canonicalName.toLowerCase();
  if (key.includes("smartphone")) {
    return /\b(smartphone|téléphone portable|iphone|android)\b/i.test(text)
      || (/\b(appelle|appel|téléphone|sms|texto)\b/i.test(lower) && /\b(portable|mobile)\b/i.test(lower));
  }
  if (key.includes("grimoire")) {
    return /\bgrimoire\b/i.test(text) || /\bspell\s*book\b/i.test(lower);
  }
  if (key.includes("talisman")) {
    return /\btalisman\b/i.test(text) || /\bamulette\b/i.test(lower);
  }
  if (key.includes("document") || key.includes("photo / evidence")) {
    return /\b(preuve|evidence|dossier|fichier|rapport|affidavit)\b/i.test(lower);
  }
  if (key.includes("laptop") || key.includes("tablet")) {
    return /\b(laptop|ordinateur portable|notebook|tablette|ipad)\b/i.test(lower);
  }
  return template.triggers.some((tr) => {
    const t = tr.toLowerCase();
    if (t.length <= 4 && /^(book|sort|spell|file)$/i.test(tr)) return false;
    return lower.includes(t);
  });
}

function requiresVisibility(text: string): boolean {
  const lower = text.toLowerCase();
  return USAGE_VERBS_REQUIRING_VISIBILITY.some((v) => lower.includes(v.toLowerCase()));
}

function makeVisibilityMode(text: string, defaultMode: PropVisibilityMode): PropVisibilityMode {
  if (requiresVisibility(text)) return "used_in_action";
  return defaultMode;
}

// ─── Domaines de props ────────────────────────────────────────────────────────

interface PropTemplate {
  canonicalName: string;
  aliases: string[];
  category: string;
  narrativeRole: PropNarrativeRole;
  defaultVisibilityMode: PropVisibilityMode;
  triggers: string[];
  confidence: number;
}

const COMBAT_NINJA_PROPS: PropTemplate[] = [
  {
    canonicalName: "kunai",
    aliases: ["throwing knife", "ninja knife"],
    category: "weapon",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "in_hand",
    triggers: ["kunai", "ninja", "shinobi", "infiltr", "lancer", "throw"],
    confidence: 0.9,
  },
  {
    canonicalName: "shuriken",
    aliases: ["throwing star", "étoile ninja"],
    category: "weapon",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "in_hand",
    triggers: ["shuriken", "ninja", "shinobi", "étoile", "star"],
    confidence: 0.85,
  },
  {
    canonicalName: "short blade",
    aliases: ["lame courte", "tanto", "ninjato", "wakizashi"],
    category: "weapon",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "in_hand",
    triggers: ["lame", "blade", "sword", "épée", "katana", "tranche", "slashes", "combat"],
    confidence: 0.8,
  },
  {
    canonicalName: "scroll",
    aliases: ["parchemin", "ninja scroll"],
    category: "document",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "in_hand",
    triggers: ["parchemin", "scroll", "mission", "ordre", "order"],
    confidence: 0.7,
  },
  {
    canonicalName: "smoke bomb",
    aliases: ["fumigène", "smoke grenade"],
    category: "equipment",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "used_in_action",
    triggers: ["fumée", "smoke", "disparaît", "disappears", "fuite", "escape"],
    confidence: 0.75,
  },
  {
    canonicalName: "holster / pouch",
    aliases: ["étui", "sacoche", "bandeau", "bandolier"],
    category: "equipment",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_body",
    triggers: ["ninja", "shinobi", "équipement", "equipment", "combat"],
    confidence: 0.65,
  },
];

const URBAN_TECH_PROPS: PropTemplate[] = [
  {
    canonicalName: "smartphone",
    aliases: ["phone", "téléphone", "mobile", "cellphone"],
    category: "device",
    narrativeRole: "communication",
    defaultVisibilityMode: "in_hand",
    triggers: ["appelle", "calls", "message", "texte", "text", "phone", "téléphone", "mobile"],
    confidence: 0.9,
  },
  {
    canonicalName: "laptop",
    aliases: ["ordinateur portable", "computer", "notebook"],
    category: "device",
    narrativeRole: "computation",
    defaultVisibilityMode: "on_surface",
    triggers: ["ordinateur", "laptop", "computer", "code", "coding", "programme informatique"],
    confidence: 0.88,
  },
  {
    canonicalName: "screen / monitor",
    aliases: ["écran", "monitor", "display"],
    category: "device",
    narrativeRole: "computation",
    defaultVisibilityMode: "background_support",
    triggers: ["écran", "screen", "monitor", "affiche", "displays"],
    confidence: 0.8,
  },
  {
    canonicalName: "tablet",
    aliases: ["tablette", "iPad", "pad"],
    category: "device",
    narrativeRole: "computation",
    defaultVisibilityMode: "in_hand",
    triggers: ["tablette", "tablet", "pad"],
    confidence: 0.75,
  },
  {
    canonicalName: "earpiece",
    aliases: ["oreillette", "écouteur", "headset", "earphone"],
    category: "device",
    narrativeRole: "communication",
    defaultVisibilityMode: "on_body",
    triggers: ["oreillette", "earpiece", "headset", "communique", "communicates"],
    confidence: 0.8,
  },
  {
    canonicalName: "badge",
    aliases: ["badge", "ID card", "carte d'accès"],
    category: "document",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_body",
    triggers: ["badge", "accès", "access", "identité", "identity", "sécurité", "security"],
    confidence: 0.85,
  },
  {
    canonicalName: "access card",
    aliases: ["carte d'accès", "keycard", "badge magnétique"],
    category: "document",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "in_hand",
    triggers: ["carte d'accès", "keycard", "porte", "door", "déverrouille", "unlocks"],
    confidence: 0.9,
  },
];

const SURVEILLANCE_HACKING_PROPS: PropTemplate[] = [
  {
    canonicalName: "surveillance monitor",
    aliases: ["moniteur de surveillance", "CCTV screen"],
    category: "device",
    narrativeRole: "evidence",
    defaultVisibilityMode: "background_support",
    triggers: ["surveillance", "caméra", "camera", "cctv", "moniteur de surveillance", "filme secrètement"],
    confidence: 0.85,
  },
  {
    canonicalName: "keyboard",
    aliases: ["clavier", "keyboard"],
    category: "device",
    narrativeRole: "computation",
    defaultVisibilityMode: "on_surface",
    triggers: ["clavier", "keyboard", "hack", "pirate informatique", "pirate"],
    confidence: 0.8,
  },
  {
    canonicalName: "camera",
    aliases: ["caméra", "camera", "webcam"],
    category: "device",
    narrativeRole: "evidence",
    defaultVisibilityMode: "background_support",
    triggers: ["caméra", "camera", "film", "enregistre", "records"],
    confidence: 0.8,
  },
  {
    canonicalName: "document / dossier",
    aliases: ["dossier", "folder", "file", "rapport"],
    category: "document",
    narrativeRole: "evidence",
    defaultVisibilityMode: "in_hand",
    triggers: ["dossier", "document", "fichier", "file", "rapport", "report", "preuve", "evidence"],
    confidence: 0.85,
  },
  {
    canonicalName: "photo / evidence",
    aliases: ["photo", "photograph", "preuve", "cliché"],
    category: "document",
    narrativeRole: "evidence",
    defaultVisibilityMode: "foreground_insert",
    triggers: ["photo", "photograph", "preuve", "evidence", "cliché", "image"],
    confidence: 0.9,
  },
  {
    canonicalName: "USB drive",
    aliases: ["clé USB", "USB key", "flash drive"],
    category: "device",
    narrativeRole: "action_tool",
    defaultVisibilityMode: "in_hand",
    triggers: ["usb", "clé usb", "flash drive", "données", "data", "transfère", "transfers"],
    confidence: 0.85,
  },
  {
    canonicalName: "terminal",
    aliases: ["terminal", "console", "workstation"],
    category: "device",
    narrativeRole: "computation",
    defaultVisibilityMode: "on_surface",
    triggers: ["terminal", "console", "workstation", "hack", "pirate", "système", "system"],
    confidence: 0.85,
  },
];

const MEDICAL_PROPS: PropTemplate[] = [
  {
    canonicalName: "bandage",
    aliases: ["pansement", "bandage", "dressing", "bande"],
    category: "medical",
    narrativeRole: "medical",
    defaultVisibilityMode: "on_body",
    triggers: ["blessé", "wounded", "blessure", "wound", "soigne", "heals", "bandage", "pansement"],
    confidence: 0.9,
  },
  {
    canonicalName: "medical kit",
    aliases: ["mallette médicale", "trousse de secours", "first aid kit"],
    category: "medical",
    narrativeRole: "medical",
    defaultVisibilityMode: "foreground_insert",
    triggers: ["soins", "medical", "premiers secours", "first aid", "traite", "treats"],
    confidence: 0.8,
  },
  {
    canonicalName: "syringe",
    aliases: ["seringue", "injection", "needle"],
    category: "medical",
    narrativeRole: "medical",
    defaultVisibilityMode: "in_hand",
    triggers: ["seringue", "syringe", "injection", "injecte", "injects", "antidote", "poison"],
    confidence: 0.9,
  },
  {
    canonicalName: "stretcher",
    aliases: ["civière", "brancard", "stretcher"],
    category: "medical",
    narrativeRole: "medical",
    defaultVisibilityMode: "background_support",
    triggers: ["civière", "stretcher", "brancard", "transport", "évacue", "evacuates"],
    confidence: 0.75,
  },
];

const MYSTICAL_PROPS: PropTemplate[] = [
  {
    canonicalName: "talisman",
    aliases: ["talisman", "charm", "amulette"],
    category: "mystical",
    narrativeRole: "ritual",
    defaultVisibilityMode: "in_hand",
    triggers: ["talisman", "charm", "magie", "magic", "sort", "spell", "rituel", "ritual", "parchemin", "mystique"],
    confidence: 0.85,
  },
  {
    canonicalName: "grimoire",
    aliases: ["grimoire", "spell book", "livre de sorts"],
    category: "mystical",
    narrativeRole: "ritual",
    defaultVisibilityMode: "in_hand",
    triggers: ["grimoire", "spell book", "livre", "book", "sort", "spell", "incantation"],
    confidence: 0.85,
  },
  {
    canonicalName: "artifact",
    aliases: ["artefact", "artifact", "relique", "relic"],
    category: "mystical",
    narrativeRole: "payoff",
    defaultVisibilityMode: "foreground_insert",
    triggers: ["artefact", "artifact", "relique", "relic", "objet ancien", "ancient object"],
    confidence: 0.9,
  },
  {
    canonicalName: "seal / sigil",
    aliases: ["sceau", "seal", "sigil", "glyphe", "glyph"],
    category: "mystical",
    narrativeRole: "ritual",
    defaultVisibilityMode: "foreground_insert",
    triggers: ["sceau", "seal", "sigil", "glyphe", "glyph", "marque", "mark"],
    confidence: 0.8,
  },
  {
    canonicalName: "amulet",
    aliases: ["amulette", "amulet", "pendentif", "pendant"],
    category: "mystical",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_body",
    triggers: ["amulette", "amulet", "pendentif", "pendant", "collier", "necklace"],
    confidence: 0.8,
  },
];

const MILITARY_PROPS: PropTemplate[] = [
  {
    canonicalName: "handgun",
    aliases: ["pistolet", "handgun", "pistol", "revolver"],
    category: "weapon",
    narrativeRole: "threat",
    defaultVisibilityMode: "in_hand",
    triggers: ["pistolet", "gun", "pistol", "revolver", "tire", "shoots", "vise", "aims"],
    confidence: 0.9,
  },
  {
    canonicalName: "rifle",
    aliases: ["fusil", "rifle", "carabine"],
    category: "weapon",
    narrativeRole: "threat",
    defaultVisibilityMode: "in_hand",
    triggers: ["fusil", "rifle", "carabine", "sniper", "tire", "shoots"],
    confidence: 0.9,
  },
  {
    canonicalName: "holster",
    aliases: ["holster", "étui à arme", "fourreau"],
    category: "equipment",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_body",
    triggers: ["holster", "étui", "fourreau", "militaire", "military", "soldat", "soldier"],
    confidence: 0.7,
  },
];

const OFFICE_SCHOOL_LAB_PROPS: PropTemplate[] = [
  {
    canonicalName: "notebook",
    aliases: ["cahier", "notebook", "carnet"],
    category: "stationery",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "in_hand",
    triggers: ["cahier", "notebook", "carnet", "note", "écrit", "writes", "classe", "class"],
    confidence: 0.75,
  },
  {
    canonicalName: "pen",
    aliases: ["stylo", "pen", "crayon", "pencil"],
    category: "stationery",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "in_hand",
    triggers: ["stylo", "pen", "crayon", "pencil", "écrit", "writes", "signe", "signs"],
    confidence: 0.7,
  },
  {
    canonicalName: "can / drink",
    aliases: ["canette", "can", "boisson", "drink", "verre", "glass"],
    category: "prop",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_surface",
    triggers: ["canette", "can", "boisson", "drink", "verre", "glass", "pause", "break"],
    confidence: 0.65,
  },
  {
    canonicalName: "school bag",
    aliases: ["sac", "bag", "sac à dos", "backpack"],
    category: "prop",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "on_body",
    triggers: ["sac", "bag", "backpack", "école", "school", "lycée", "student"],
    confidence: 0.7,
  },
  {
    canonicalName: "lab equipment",
    aliases: ["équipement de labo", "lab equipment", "beaker", "éprouvette"],
    category: "prop",
    narrativeRole: "worldbuilding",
    defaultVisibilityMode: "background_support",
    triggers: ["labo", "lab", "laboratoire", "laboratory", "expérience", "experiment"],
    confidence: 0.75,
  },
];

// ─── Inférence contextuelle par univers ───────────────────────────────────────

function getUniverseProps(universeType: UniverseType): PropTemplate[] {
  switch (universeType) {
    case "ninja":
      return COMBAT_NINJA_PROPS;
    case "cyberpunk":
      return [...URBAN_TECH_PROPS, ...SURVEILLANCE_HACKING_PROPS];
    case "post_apo":
      return [
        ...MILITARY_PROPS,
        {
          canonicalName: "improvised weapon",
          aliases: ["arme improvisée", "makeshift weapon"],
          category: "weapon",
          narrativeRole: "action_tool",
          defaultVisibilityMode: "in_hand",
          triggers: ["survie", "survival", "improvisé", "improvised", "débris", "debris"],
          confidence: 0.75,
        },
        {
          canonicalName: "gas filter / mask",
          aliases: ["filtre à gaz", "masque", "gas mask"],
          category: "equipment",
          narrativeRole: "travel",
          defaultVisibilityMode: "on_body",
          triggers: ["filtre", "filter", "masque", "mask", "gaz", "gas", "toxique", "toxic"],
          confidence: 0.8,
        },
      ];
    case "school_life":
      return [...OFFICE_SCHOOL_LAB_PROPS, ...URBAN_TECH_PROPS.slice(0, 3)];
    case "mecha":
      return [
        {
          canonicalName: "control console",
          aliases: ["console de contrôle", "cockpit controls"],
          category: "device",
          narrativeRole: "computation",
          defaultVisibilityMode: "on_surface",
          triggers: ["console", "cockpit", "contrôle", "control", "mecha", "robot"],
          confidence: 0.85,
        },
        {
          canonicalName: "interface panel",
          aliases: ["panneau d'interface", "interface panel", "HUD"],
          category: "device",
          narrativeRole: "computation",
          defaultVisibilityMode: "background_support",
          triggers: ["interface", "panneau", "panel", "HUD", "écran", "screen"],
          confidence: 0.8,
        },
      ];
    case "fantasy":
      return MYSTICAL_PROPS;
    case "military":
      return MILITARY_PROPS;
    case "medical":
      return MEDICAL_PROPS;
    default:
      return [];
  }
}

function getAdditionalDomainsOnlyIfExplicitlySignaled(text: string): PropTemplate[][] {
  const lower = text.toLowerCase();
  const domains: PropTemplate[][] = [];

  if (/(téléphone|telephone|smartphone|mobile|appelle|calls|sonne|rings|sms|message texte)/i.test(lower)) {
    domains.push(URBAN_TECH_PROPS);
  }

  if (/(ordinateur|laptop|clavier|keyboard|terminal|hack|pirate|code|serveur|surveillance|caméra|camera|moniteur|monitor)/.test(lower)) {
    domains.push(URBAN_TECH_PROPS, SURVEILLANCE_HACKING_PROPS);
  }

  if (/(pistolet|fusil|soldat|militaire|arme|guerre|bataille)/.test(lower)) {
    domains.push(MILITARY_PROPS);
  }

  if (/(magie|sort|rituel|grimoire|artefact|talisman|mana)/.test(lower)) {
    domains.push(MYSTICAL_PROPS);
  }

  if (/(hôpital|hopital|médecin|medecin|seringue|bandage|blessure)/.test(lower)) {
    domains.push(MEDICAL_PROPS);
  }

  if (/(lycée|lycee|école|ecole|laboratoire|laboratory|bureau open space)/.test(lower)) {
    domains.push(OFFICE_SCHOOL_LAB_PROPS);
  }

  return domains;
}

function detectUniverseFromContext(
  beat: ProductionBeat,
  context: PropInferenceContext,
): UniverseType {
  if (context.universeType) return context.universeType;

  const text = [
    beat.summary,
    beat.narrativeFunction,
    ...(beat.environmentContext ?? []),
    context.projectGenre ?? "",
    context.projectTone ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/(ninja|shinobi|kunai|shuriken|ninjutsu)/.test(text)) return "ninja";
  if (/(cyber|hack|neon|implant|drone|dystopi)/.test(text)) return "cyberpunk";
  if (/(post.apo|wasteland|survie|survival|ruines|ruins|apocalypse)/.test(text)) return "post_apo";
  if (/(lycée|lycee|école|ecole|school|campus|élève|student)/.test(text)) return "school_life";
  if (/(mecha|robot|cockpit|pilote|pilot|giant robot)/.test(text)) return "mecha";
  if (/(magie|magic|sort|spell|fantasy|fantaisie|dragon|elfe|elf)/.test(text)) return "fantasy";
  if (/(militaire|military|soldat|soldier|guerre|war|armée|army)/.test(text)) return "military";
  if (/(médecin|doctor|hôpital|hospital|chirurgie|surgery|urgence|emergency)/.test(text)) return "medical";

  return "generic";
}

// ─── P0.4 — Inférence de propriétaire ──────────────────────────────────────────

const GUARD_ENEMY_PATTERNS = [
  /garde[s]?\b/i,
  /guard[s]?\b/i,
  /soldat[s]?\b/i,
  /soldier[s]?\b/i,
  /sentinelle[s]?\b/i,
  /sentinel[s]?\b/i,
  /patrouille[s]?\b/i,
  /patrol[s]?\b/i,
  /ennemi[s]?\b/i,
  /enem(y|ies)\b/i,
  /adversaire[s]?\b/i,
  /mercenaire[s]?\b/i,
  /mercenary|mercenaries/i,
  /troupe[s]?\b/i,
  /troop[s]?\b/i,
  /armée\b/i,
  /army\b/i,
  /milice\b/i,
  /militia\b/i,
  /police\b/i,
  /vigile[s]?\b/i,
  /security guard/i,
  /agent de sécurité/i,
  /chasseur[s]?\b/i,
  /hunter[s]?\b/i,
];

const HERO_ACTION_PATTERNS = [
  /(?:le |la |l')?(?:héros?|hero|protagonist|main character)\s+(?:utilise|uses|tient|holds|brandit|wields|tire|shoots|vise|aims|dégaine|draws)/i,
  /(?:son|sa|leur)\s+(?:arme|weapon|pistolet|gun|épée|sword|lame|blade)/i,
];

const ENEMY_ACTION_PATTERNS = [
  /(?:l')?(?:ennemi|enemy|adversaire|adversary|attaquant|attacker)\s+(?:utilise|uses|tient|holds|brandit|wields|tire|shoots|vise|aims|dégaine|draws)/i,
  /(?:les |l')?(?:ennemis|enemies|adversaires|adversaries|attaquants|attackers)\s+/i,
];

function inferPropOwnerCategory(
  template: PropTemplate,
  text: string,
  context: PropInferenceContext,
): PropOwnerCategory {
  const lower = text.toLowerCase();
  const isWeapon = template.category === "weapon" || template.narrativeRole === "threat";
  const isMilitaryEquipment = template.category === "equipment" && MILITARY_PROPS.some((p) => p.canonicalName === template.canonicalName);

  // Règle 0: Si ennemi est explicitement mentionné comme utilisant l'arme → enemy
  // (Cette règle passe AVANT le héros pour gérer "L'ennemi tire...")
  if (ENEMY_ACTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "enemy";
  }

  // Règle 1: Si le héros est explicitement mentionné comme utilisant l'arme → hero
  if (HERO_ACTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return "hero";
  }

  // Règle 2: Si le texte mentionne des gardes/soldats/ennemis ET que c'est une arme → guard/enemy
  if ((isWeapon || isMilitaryEquipment) && GUARD_ENEMY_PATTERNS.some((pattern) => pattern.test(text))) {
    if (/ennemi|enemy|adversaire|adversary|attaquant|attacker/i.test(lower)) {
      return "enemy";
    }
    return "guard";
  }

  // Règle 3: Si c'est une arme dans un contexte militaire sans mention de héros → guard par défaut
  if (isWeapon && context.universeType === "military") {
    return "guard";
  }

  // Règle 4: Props d'environnement/background → ambient
  if (template.narrativeRole === "worldbuilding" && template.defaultVisibilityMode === "background_support") {
    return "ambient";
  }

  // Règle 5: Si le héros est le seul personnage mentionné et utilise l'objet → hero
  if (context.heroCharacterId && requiresVisibility(text)) {
    return "hero";
  }

  return "unassigned";
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export function inferRequiredPropsFromBeat(
  beat: ProductionBeat,
  facts: NarrativeFact[],
  context: PropInferenceContext,
): RequiredProp[] {
  const text = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  const universeType = detectUniverseFromContext(beat, context);
  const enrichedContext = { ...context, universeType };
  const props: RequiredProp[] = [];
  const seenNames = new Set<string>();

  const allDomains: PropTemplate[][] = [
    getUniverseProps(universeType),
    ...getAdditionalDomainsOnlyIfExplicitlySignaled(text),
  ];

  // Dédupliquer les domaines
  const testedTemplates = new Set<string>();
  const flatTemplates: PropTemplate[] = [];
  for (const domain of allDomains) {
    for (const tpl of domain) {
      if (!testedTemplates.has(tpl.canonicalName)) {
        testedTemplates.add(tpl.canonicalName);
        flatTemplates.push(tpl);
      }
    }
  }

  for (const template of flatTemplates) {
    const triggered = template.triggers.some((trigger) =>
      text.toLowerCase().includes(trigger.toLowerCase()),
    );
    if (!triggered) continue;
    if (
      enrichedContext.premiumStrictChapterSourcing
      && STRICT_PREMIUM_PROP_NAMES.has(template.canonicalName.trim().toLowerCase())
      && !matchesStrictPremiumPropEvidence(template, text)
    ) {
      continue;
    }
    if (seenNames.has(template.canonicalName)) continue;
    seenNames.add(template.canonicalName);

    const mustBeVisible = requiresVisibility(text) || template.narrativeRole === "action_tool" || template.narrativeRole === "threat";
    const visibilityMode = makeVisibilityMode(text, template.defaultVisibilityMode);
    // P0.4 — Inférer le propriétaire
    const ownerCategory = inferPropOwnerCategory(template, text, enrichedContext);

    props.push({
      id: `prop_${beat.beatId}_${template.canonicalName.replace(/\s+/g, "_")}`,
      canonicalName: template.canonicalName,
      aliases: template.aliases,
      category: template.category,
      narrativeRole: template.narrativeRole,
      requiredForBeatIds: [beat.beatId],
      visibilityMode,
      mustBeVisible,
      confidence: template.confidence,
      source: "story_inference",
      ownerCategory,
    });
  }

  // Réinjecter les props issus des faits narratifs (prop_usage, prop_transfer)
  for (const fact of facts) {
    if (
      (fact.type === "prop_usage" || fact.type === "prop_transfer") &&
      fact.beatId === beat.beatId
    ) {
      for (const candidate of fact.propCandidates) {
        if (seenNames.has(candidate)) continue;
        seenNames.add(candidate);
        props.push({
          id: `prop_fact_${beat.beatId}_${candidate.replace(/\s+/g, "_")}`,
          canonicalName: candidate,
          aliases: [],
          category: "inferred",
          narrativeRole: fact.type === "prop_transfer" ? "payoff" : "action_tool",
          requiredForBeatIds: [beat.beatId],
          visibilityMode: fact.requiredVisibility === "must_show" ? "foreground_insert" : "background_support",
          mustBeVisible: fact.requiredVisibility === "must_show",
          confidence: fact.evidenceStrength,
          source: fact.source === "continuity" ? "continuity" : "story_inference",
        });
      }
    }
  }

  // Règle "objet important = au moins un insert ou panel lisible"
  // Marquer les props evidence/payoff comme nécessitant un panel dédié
  for (const prop of props) {
    if (prop.narrativeRole === "evidence" || prop.narrativeRole === "payoff") {
      prop.mustBeVisible = true;
      prop.visibilityMode = "foreground_insert";
      if (!prop.preferredPanelIds) {
        prop.preferredPanelIds = [];
      }
    }
  }

  return props;
}
