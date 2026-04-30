/**
 * Moteur d'inférence automatique des props narratifs.
 * Déduit les accessoires/armes/objets automatiquement en fonction de l'histoire,
 * sans configuration manuelle utilisateur.
 *
 * PR4 — validation / owner : logique partagée dans
 * `prop-evidence-validator.ts` et `prop-owner-resolver.ts` (importés ici).
 * En premium IA-first (`visualWorldContractActive` / `suppressUniverseTemplateProps`),
 * les catalogues univers ne servent plus de source créative principale.
 */

import type {
  NarrativeFact,
  RequiredProp,
  PropNarrativeRole,
  PropVisibilityMode,
  VisualWorldPropDna,
} from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";
import {
  makeVisibilityMode,
  matchesStrictPremiumPropEvidence,
  requiresVisibility,
  STRICT_PREMIUM_PROP_NAMES,
} from "./prop-evidence-validator";
import { inferPropOwnerCategory } from "./prop-owner-resolver";

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
  /**
   * Premium IA-first : ne pas injecter les catalogues `getUniverseProps(detectUniverse…)`
   * (ninja/urban/…). Reste : signaux explicites dans le texte + faits narratifs (`prop_usage` / …).
   */
  suppressUniverseTemplateProps?: boolean;
  /**
   * Premium IA-first : props issus du `VisualWorldContract` pour ce beat
   * (`requiredBeatIds` sur chaque entrée). Fusionnés avant les templates / faits.
   */
  visualWorldPropsForBeat?: Readonly<Record<string, readonly VisualWorldPropDna[]>> | null;
  /**
   * Chapitre avec monde visuel composé (contrat présent) : ne pas utiliser les catalogues
   * `getUniverseProps` comme source créative, même si `props` du contrat est vide ou non indexé par beat.
   */
  visualWorldContractActive?: boolean;
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

  const hasVisualWorldPropIndex =
    context.visualWorldPropsForBeat != null
    && Object.values(context.visualWorldPropsForBeat).some((arr) => Array.isArray(arr) && arr.length > 0);
  const suppressUniverseTemplates =
    context.suppressUniverseTemplateProps === true
    || hasVisualWorldPropIndex
    || context.visualWorldContractActive === true;

  /** Avec `suppressUniverseTemplates`, éviter la détection regex d’univers (IA-first + contrat monde). */
  const universeType = suppressUniverseTemplates
    ? (context.universeType ?? "generic")
    : detectUniverseFromContext(beat, context);
  const enrichedContext = { ...context, universeType };
  const props: RequiredProp[] = [];
  const seenNames = new Set<string>();

  const vwList = context.visualWorldPropsForBeat?.[beat.beatId];
  if (vwList && vwList.length > 0) {
    for (const p of vwList) {
      const name = p.canonicalName.trim();
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      const ownerCategory = p.ownerCharacterId
        ? p.ownerCharacterId === context.heroCharacterId
          ? "hero"
          : "npc"
        : p.locationId
          ? "ambient"
          : "unassigned";
      props.push({
        id: `prop_vw_${beat.beatId}_${p.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
        canonicalName: name,
        aliases: [],
        category: p.category || "prop",
        narrativeRole: "worldbuilding",
        requiredForBeatIds: p.requiredBeatIds.length > 0 ? [...p.requiredBeatIds] : [beat.beatId],
        visibilityMode: p.continuityPolicy === "symbolic" ? "foreground_insert" : "background_support",
        mustBeVisible: p.continuityPolicy === "recurring" || p.continuityPolicy === "symbolic",
        confidence: 0.92,
        source: "visual_world_contract",
        ownerCategory,
        ownerId: p.ownerCharacterId ?? null,
      });
    }
  }

  // IA-first : pas de catalogue univers quand le caller impose `suppressUniverseTemplateProps`
  // ou qu’un index `VisualWorldContract` est déjà fourni pour ce chapitre.
  const allDomains: PropTemplate[][] = suppressUniverseTemplates
    ? []
    : [getUniverseProps(universeType), ...getAdditionalDomainsOnlyIfExplicitlySignaled(text)];

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
    const isMilitaryEquipment = template.category === "equipment"
      && MILITARY_PROPS.some((p) => p.canonicalName === template.canonicalName);
    const ownerCategory = inferPropOwnerCategory(template, text, {
      universeType: enrichedContext.universeType ?? null,
      heroCharacterId: enrichedContext.heroCharacterId ?? null,
    }, isMilitaryEquipment);

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
        const narrativeRole = fact.type === "prop_transfer" ? "payoff" : "action_tool";
        const defaultVisibilityMode =
          fact.requiredVisibility === "must_show" ? "foreground_insert" : "background_support";
        const ownerCategory = inferPropOwnerCategory(
          {
            canonicalName: candidate,
            category: "inferred",
            narrativeRole,
            defaultVisibilityMode,
          },
          text,
          {
            universeType: enrichedContext.universeType ?? null,
            heroCharacterId: enrichedContext.heroCharacterId ?? null,
          },
          false,
        );
        props.push({
          id: `prop_fact_${beat.beatId}_${candidate.replace(/\s+/g, "_")}`,
          canonicalName: candidate,
          aliases: [],
          category: "inferred",
          narrativeRole,
          requiredForBeatIds: [beat.beatId],
          visibilityMode: fact.requiredVisibility === "must_show" ? "foreground_insert" : "background_support",
          mustBeVisible: fact.requiredVisibility === "must_show",
          confidence: fact.evidenceStrength,
          source: fact.source === "continuity" ? "continuity" : "story_inference",
          ownerCategory,
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

/** Indexe `VisualWorldContract.props` par beat (`requiredBeatIds`). */
export function indexVisualWorldPropsByBeat(
  vw: { props: readonly VisualWorldPropDna[] } | null | undefined,
): Readonly<Record<string, readonly VisualWorldPropDna[]>> | undefined {
  if (!vw?.props?.length) return undefined;
  const map = new Map<string, VisualWorldPropDna[]>();
  for (const p of vw.props) {
    for (const bid of p.requiredBeatIds) {
      const cur = map.get(bid) ?? [];
      cur.push(p);
      map.set(bid, cur);
    }
  }
  if (map.size === 0) return undefined;
  return Object.fromEntries(map);
}
