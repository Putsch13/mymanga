/**
 * Détection d'univers et sélection des templates de props associés.
 *
 * Cette détection est utilisée par le pipeline legacy ; le pipeline premium
 * IA-first la court-circuite (voir `engine.ts`).
 */
import type { ProductionBeat } from "@manga-ai-studio/core";
import type { PropTemplate, UniverseType } from "./types";
import {
  COMBAT_NINJA_PROPS,
  MEDICAL_PROPS,
  MILITARY_PROPS,
  MYSTICAL_PROPS,
  OFFICE_SCHOOL_LAB_PROPS,
  SURVEILLANCE_HACKING_PROPS,
  URBAN_TECH_PROPS,
} from "./templates";

export function getUniverseProps(universeType: UniverseType): PropTemplate[] {
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

export function getAdditionalDomainsOnlyIfExplicitlySignaled(
  text: string,
): PropTemplate[][] {
  const lower = text.toLowerCase();
  const domains: PropTemplate[][] = [];

  if (
    /(téléphone|telephone|smartphone|mobile|appelle|calls|sonne|rings|sms|message texte)/i.test(
      lower,
    )
  ) {
    domains.push(URBAN_TECH_PROPS);
  }

  if (
    /(ordinateur|laptop|clavier|keyboard|terminal|hack|pirate|code|serveur|surveillance|caméra|camera|moniteur|monitor)/.test(
      lower,
    )
  ) {
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

  if (
    /(lycée|lycee|école|ecole|laboratoire|laboratory|bureau open space)/.test(lower)
  ) {
    domains.push(OFFICE_SCHOOL_LAB_PROPS);
  }

  return domains;
}

export function detectUniverseFromContext(
  beat: ProductionBeat,
  context: { universeType?: UniverseType | null; projectGenre?: string | null; projectTone?: string | null },
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
  if (/(post.apo|wasteland|survie|survival|ruines|ruins|apocalypse)/.test(text))
    return "post_apo";
  if (/(lycée|lycee|école|ecole|school|campus|élève|student)/.test(text))
    return "school_life";
  if (/(mecha|robot|cockpit|pilote|pilot|giant robot)/.test(text)) return "mecha";
  if (/(magie|magic|sort|spell|fantasy|fantaisie|dragon|elfe|elf)/.test(text))
    return "fantasy";
  if (/(militaire|military|soldat|soldier|guerre|war|armée|army)/.test(text))
    return "military";
  if (
    /(médecin|doctor|hôpital|hospital|chirurgie|surgery|urgence|emergency)/.test(text)
  )
    return "medical";

  return "generic";
}
