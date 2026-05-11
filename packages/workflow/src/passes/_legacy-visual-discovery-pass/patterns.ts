/**
 * Patterns de détection pour les groupes PNJ.
 */
export const NPC_GROUP_PATTERNS = [
  { pattern: /pêcheurs?|marins?|matelots?/gi, label: "pêcheurs", kind: "npc_group" as const },
  { pattern: /passants?|piétons?/gi, label: "passants", kind: "npc_group" as const },
  { pattern: /soldats?|gardes?|sentinelles?/gi, label: "soldats", kind: "npc_group" as const },
  { pattern: /villageois|habitants?/gi, label: "villageois", kind: "npc_group" as const },
  { pattern: /marchands?|vendeurs?|commerçants?/gi, label: "marchands", kind: "npc_group" as const },
  { pattern: /foule|public|spectateurs?|audience/gi, label: "foule", kind: "crowd" as const },
  { pattern: /clients?|acheteurs?/gi, label: "clients", kind: "npc_group" as const },
  { pattern: /élèves?|étudiants?|écoliers?/gi, label: "élèves", kind: "npc_group" as const },
  { pattern: /enfants?|gamins?/gi, label: "enfants", kind: "npc_group" as const },
  { pattern: /ouvriers?|travailleurs?/gi, label: "ouvriers", kind: "npc_group" as const },
  { pattern: /serveurs?|serveuses?/gi, label: "serveurs", kind: "npc_group" as const },
  { pattern: /prisonniers?|détenus?/gi, label: "prisonniers", kind: "npc_group" as const },
  { pattern: /nobles?|aristocrates?/gi, label: "nobles", kind: "npc_group" as const },
  { pattern: /paysans?|fermiers?/gi, label: "paysans", kind: "npc_group" as const },
  { pattern: /bandits?|brigands?|voleurs?/gi, label: "bandits", kind: "npc_group" as const },
];

/**
 * Patterns de détection pour les lieux (vrais décors).
 * P1.10 — Ne pas inclure les véhicules comme lieux principaux.
 */
export const LOCATION_PATTERNS = [
  { pattern: /port|quai|dock/gi, label: "port" },
  { pattern: /mer|océan|plage|côte/gi, label: "bord de mer" },
  { pattern: /forêt|bois|jungle/gi, label: "forêt" },
  { pattern: /ville|cité|métropole/gi, label: "ville" },
  { pattern: /village|hameau/gi, label: "village" },
  { pattern: /rue|avenue|boulevard|ruelle/gi, label: "rue" },
  { pattern: /marché|bazar|foire/gi, label: "marché" },
  { pattern: /école|académie|université/gi, label: "école" },
  { pattern: /temple|église|sanctuaire|autel/gi, label: "temple" },
  { pattern: /palais|château|forteresse|citadelle/gi, label: "palais" },
  { pattern: /laboratoire|labo/gi, label: "laboratoire" },
  { pattern: /désert|dunes/gi, label: "désert" },
  { pattern: /montagne|sommet|pic/gi, label: "montagne" },
  { pattern: /grotte|caverne|souterrain/gi, label: "grotte" },
  { pattern: /maison|demeure|manoir|résidence/gi, label: "maison" },
  { pattern: /taverne|auberge|bar|café/gi, label: "taverne" },
  { pattern: /prison|cachot|donjon/gi, label: "prison" },
  { pattern: /arène|colisée|stade/gi, label: "arène" },
  { pattern: /bureau|office/gi, label: "bureau" },
  { pattern: /hôpital|infirmerie/gi, label: "hôpital" },
  { pattern: /bibliothèque/gi, label: "bibliothèque" },
  { pattern: /jardin|parc/gi, label: "jardin" },
];

/**
 * P1.10 — Patterns pour les véhicules/grands props (pas des lieux principaux).
 * Ces éléments sont traités comme des sous-contextes ou largeProps, pas des locations.
 */
export const VEHICLE_OR_LARGE_PROP_PATTERNS = [
  { pattern: /navire|bateau|vaisseau|galère/gi, label: "navire", isVehicle: true },
  { pattern: /voiture|véhicule|auto/gi, label: "voiture", isVehicle: true },
  { pattern: /train|locomotive/gi, label: "train", isVehicle: true },
  { pattern: /carrosse|diligence|chariot/gi, label: "carrosse", isVehicle: true },
  { pattern: /avion|aéronef/gi, label: "avion", isVehicle: true },
];

/**
 * P1.10 — Sous-contextes environnementaux (pas des lieux principaux).
 */
export const SUBLOCATION_PATTERNS = [
  { pattern: /bord de (mer|eau|rivière)/gi, label: "bord de mer" },
  { pattern: /pont du navire|pont du bateau/gi, label: "pont du navire" },
  { pattern: /cabine/gi, label: "cabine" },
  { pattern: /cale/gi, label: "cale" },
];

/**
 * Patterns de détection pour les robots/mécha.
 */
export const ROBOT_PATTERNS = [
  { pattern: /robot[s]?|androïde[s]?|automate[s]?/gi, label: "robot" },
  { pattern: /mécha[s]?|mech[s]?/gi, label: "mécha" },
  { pattern: /droïde[s]?/gi, label: "droïde" },
  { pattern: /cyborg[s]?/gi, label: "cyborg" },
  { pattern: /golem[s]?/gi, label: "golem" },
];

/**
 * Patterns de détection pour les hybrides.
 */
export const HYBRID_PATTERNS = [
  { pattern: /hybride[s]?/gi, label: "hybride" },
  { pattern: /mi-humain|demi-/gi, label: "hybride" },
  { pattern: /homme-\w+|femme-\w+/gi, label: "hybride humanoïde" },
  { pattern: /fille-chat|neko/gi, label: "neko" },
  { pattern: /homme-loup|lycanthrope/gi, label: "lycanthrope" },
  { pattern: /sirène[s]?|triton[s]?/gi, label: "sirène" },
  { pattern: /centaure[s]?/gi, label: "centaure" },
];

/**
 * Patterns de détection pour les créatures.
 */
export const CREATURE_PATTERNS = [
  { pattern: /créature[s]?|monstre[s]?|bête[s]?/gi, label: "créature" },
  { pattern: /dragon[s]?/gi, label: "dragon" },
  { pattern: /démon[s]?|diable[s]?/gi, label: "démon" },
  { pattern: /chimère[s]?/gi, label: "chimère" },
  { pattern: /spectre[s]?|fantôme[s]?|esprit[s]?/gi, label: "spectre" },
  { pattern: /ange[s]?|archange[s]?/gi, label: "ange" },
  { pattern: /géant[s]?|titan[s]?/gi, label: "géant" },
  { pattern: /loup[s]?|louve[s]?/gi, label: "loup" },
  { pattern: /serpent[s]?|vipère[s]?/gi, label: "serpent" },
  { pattern: /araignée[s]?/gi, label: "araignée" },
  { pattern: /oiseau[x]?|corbeau[x]?|aigle[s]?/gi, label: "oiseau" },
];

/**
 * Patterns de détection pour les factions.
 */
export const FACTION_PATTERNS = [
  { pattern: /clan[s]?/gi, label: "clan" },
  { pattern: /guilde[s]?/gi, label: "guilde" },
  { pattern: /royaume[s]?|empire[s]?/gi, label: "royaume" },
  { pattern: /organisation[s]?|ordre[s]?/gi, label: "organisation" },
  { pattern: /famille[s]? (?:noble|royale|puissante)/gi, label: "famille" },
  { pattern: /armée[s]?|légion[s]?/gi, label: "armée" },
  { pattern: /secte[s]?|culte[s]?/gi, label: "secte" },
];

/**
 * Props interdits / fantômes à ne jamais inclure comme props visuels.
 * Export pour réutilisation par `visual-world-discovery-pass` (contrat IA).
 */
export const DEFAULT_FORBIDDEN_VISUAL_PROPS = [
  "obstacle",
  "danger",
  "tension",
  "secret",
  "preuve abstraite",
  "indice abstrait",
  "souvenir",
  "engagement",
  "promesse",
  "mystery",
  "unknown",
];

/**
 * Props suspects qui nécessitent une justification textuelle.
 */
export const DEFAULT_SUSPICIOUS_VISUAL_PROPS = [
  "document",
  "evidence",
  "document/evidence",
  "preuve",
];
