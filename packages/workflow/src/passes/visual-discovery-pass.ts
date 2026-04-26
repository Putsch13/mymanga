/**
 * P1.4 — VisualDiscoveryPass : détection automatique des entités visuelles.
 *
 * Ce pass analyse le texte narratif (beats, résumé, dialogues) pour détecter
 * automatiquement les personnages, lieux, PNJ, robots, hybrides, créatures,
 * factions et props.
 *
 * L'objectif est de permettre à l'utilisateur d'écrire naturellement sans
 * devoir encoder manuellement chaque entité.
 *
 * @module visual-discovery-pass
 */

import type { ProductionOutline } from "@manga-ai-studio/core";

/**
 * Type d'entité visuelle découverte.
 */
export type DiscoveredEntityKind =
  | "character"
  | "npc_group"
  | "location"
  | "species"
  | "robot"
  | "hybrid"
  | "creature"
  | "faction"
  | "prop"
  | "mystery_entity";

/**
 * Source de la découverte.
 */
export type DiscoverySource =
  | "existing_user_entity"
  | "story_text"
  | "dialogue"
  | "project_style"
  | "temporary_inference";

/**
 * Niveau de canonicité de l'entité.
 */
export type CanonLevel = "user_canon" | "chapter_temporary" | "mystery";

/**
 * Entité visuelle découverte.
 */
export interface DiscoveredVisualEntity {
  id?: string;
  label: string;
  kind: DiscoveredEntityKind;
  source: DiscoverySource;
  confidence: number;
  requiredBeats: string[];
  optionalBeats: string[];
  visualDescription: string;
  canonLevel: CanonLevel;
  detectedIn: string[];
}

/**
 * Liaison beat → entités visuelles.
 */
export interface BeatVisualBinding {
  beatId: string;
  characters: string[];
  locations: string[];
  npcGroups: string[];
  props: string[];
}

/**
 * Contrat de découverte visuelle pour un chapitre.
 */
export interface ChapterVisualDiscoveryContract {
  chapterId: string;
  characters: DiscoveredVisualEntity[];
  npcGroups: DiscoveredVisualEntity[];
  locations: DiscoveredVisualEntity[];
  species: DiscoveredVisualEntity[];
  robots: DiscoveredVisualEntity[];
  hybrids: DiscoveredVisualEntity[];
  creatures: DiscoveredVisualEntity[];
  factions: DiscoveredVisualEntity[];
  props: DiscoveredVisualEntity[];
  forbiddenProps: string[];
  beatBindings: BeatVisualBinding[];
}

/**
 * Patterns de détection pour les groupes PNJ.
 */
const NPC_GROUP_PATTERNS = [
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
 * Patterns de détection pour les lieux.
 */
const LOCATION_PATTERNS = [
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
  { pattern: /navire|bateau|vaisseau/gi, label: "navire" },
  { pattern: /bureau|office/gi, label: "bureau" },
  { pattern: /hôpital|infirmerie/gi, label: "hôpital" },
  { pattern: /bibliothèque/gi, label: "bibliothèque" },
  { pattern: /jardin|parc/gi, label: "jardin" },
];

/**
 * Patterns de détection pour les robots/mécha.
 */
const ROBOT_PATTERNS = [
  { pattern: /robot[s]?|androïde[s]?|automate[s]?/gi, label: "robot" },
  { pattern: /mécha[s]?|mech[s]?/gi, label: "mécha" },
  { pattern: /droïde[s]?/gi, label: "droïde" },
  { pattern: /cyborg[s]?/gi, label: "cyborg" },
  { pattern: /golem[s]?/gi, label: "golem" },
];

/**
 * Patterns de détection pour les hybrides.
 */
const HYBRID_PATTERNS = [
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
const CREATURE_PATTERNS = [
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
const FACTION_PATTERNS = [
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
 */
const FORBIDDEN_PROPS = [
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
const SUSPICIOUS_PROPS = [
  "document",
  "evidence",
  "document/evidence",
  "preuve",
];

/**
 * Input pour le VisualDiscoveryPass.
 */
export interface VisualDiscoveryPassInput {
  chapterId: string;
  /** Texte narratif des beats. */
  beats: Array<{
    beatId: string;
    summary?: string | null;
    whyThisBeatExists?: string | null;
    dramaticChange?: string | null;
    characters?: string[];
    emotionKeywords?: string[];
  }>;
  /** Résumé du chapitre. */
  chapterSummary?: string | null;
  /** Intent utilisateur. */
  userIntent?: string | null;
  /** Dialogues existants. */
  dialogues?: Array<{ panelId: string; speaker: string; text: string }>;
  /** Personnages connus de l'utilisateur. */
  knownCharacters?: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    description?: string | null;
  }>;
  /** Lieux connus de l'utilisateur. */
  knownLocations?: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
  /** Production outline si disponible. */
  productionOutline?: ProductionOutline | null;
}

/**
 * Résultat du VisualDiscoveryPass.
 */
export interface VisualDiscoveryPassResult {
  contract: ChapterVisualDiscoveryContract;
  warnings: string[];
  stats: {
    charactersFound: number;
    locationsFound: number;
    npcGroupsFound: number;
    robotsFound: number;
    hybridsFound: number;
    creaturesFound: number;
    factionsFound: number;
    propsFound: number;
    forbiddenPropsStripped: number;
  };
}

function extractTextFromBeats(
  beats: VisualDiscoveryPassInput["beats"],
): { beatId: string; text: string }[] {
  return beats.map((b) => ({
    beatId: b.beatId,
    text: [b.summary, b.whyThisBeatExists, b.dramaticChange]
      .filter((x): x is string => typeof x === "string")
      .join(" "),
  }));
}

function detectEntitiesFromText(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string; kind?: string }>,
): Map<string, { label: string; kind?: string; count: number }> {
  const found = new Map<string, { label: string; kind?: string; count: number }>();
  for (const p of patterns) {
    const matches = text.match(p.pattern);
    if (matches && matches.length > 0) {
      const existing = found.get(p.label);
      found.set(p.label, {
        label: p.label,
        kind: p.kind,
        count: (existing?.count ?? 0) + matches.length,
      });
    }
  }
  return found;
}

function createDiscoveredEntity(
  label: string,
  kind: DiscoveredEntityKind,
  source: DiscoverySource,
  beatIds: string[],
  confidence: number,
  visualDescription?: string,
  canonLevel: CanonLevel = "chapter_temporary",
): DiscoveredVisualEntity {
  return {
    label,
    kind,
    source,
    confidence,
    requiredBeats: beatIds,
    optionalBeats: [],
    visualDescription: visualDescription ?? `${kind}: ${label}`,
    canonLevel,
    detectedIn: beatIds,
  };
}

/**
 * Exécute le VisualDiscoveryPass.
 */
export function runVisualDiscoveryPass(
  input: VisualDiscoveryPassInput,
): VisualDiscoveryPassResult {
  const warnings: string[] = [];

  const characters: DiscoveredVisualEntity[] = [];
  const npcGroups: DiscoveredVisualEntity[] = [];
  const locations: DiscoveredVisualEntity[] = [];
  const robots: DiscoveredVisualEntity[] = [];
  const hybrids: DiscoveredVisualEntity[] = [];
  const creatures: DiscoveredVisualEntity[] = [];
  const factions: DiscoveredVisualEntity[] = [];
  const props: DiscoveredVisualEntity[] = [];
  const species: DiscoveredVisualEntity[] = [];
  const beatBindings: BeatVisualBinding[] = [];

  // 1. Ajouter les personnages connus
  for (const c of input.knownCharacters ?? []) {
    characters.push({
      id: c.id,
      label: c.name,
      kind: "character",
      source: "existing_user_entity",
      confidence: 1.0,
      requiredBeats: [],
      optionalBeats: [],
      visualDescription: c.description ?? c.name,
      canonLevel: "user_canon",
      detectedIn: [],
    });
  }

  // 2. Ajouter les lieux connus
  for (const loc of input.knownLocations ?? []) {
    locations.push({
      id: loc.id,
      label: loc.name,
      kind: "location",
      source: "existing_user_entity",
      confidence: 1.0,
      requiredBeats: [],
      optionalBeats: [],
      visualDescription: loc.description ?? loc.name,
      canonLevel: "user_canon",
      detectedIn: [],
    });
  }

  // 3. Analyser chaque beat
  const beatTexts = extractTextFromBeats(input.beats);
  const allText =
    beatTexts.map((b) => b.text).join(" ") +
    " " +
    (input.chapterSummary ?? "") +
    " " +
    (input.userIntent ?? "");

  // Détecter les entités globalement
  const detectedNpcGroups = detectEntitiesFromText(allText, NPC_GROUP_PATTERNS);
  const detectedLocations = detectEntitiesFromText(allText, LOCATION_PATTERNS);
  const detectedRobots = detectEntitiesFromText(allText, ROBOT_PATTERNS);
  const detectedHybrids = detectEntitiesFromText(allText, HYBRID_PATTERNS);
  const detectedCreatures = detectEntitiesFromText(allText, CREATURE_PATTERNS);
  const detectedFactions = detectEntitiesFromText(allText, FACTION_PATTERNS);

  // Trouver dans quels beats chaque entité apparaît
  for (const [label, data] of detectedNpcGroups) {
    const beatsWithEntity = beatTexts
      .filter((bt) => NPC_GROUP_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)))
      .map((bt) => bt.beatId);
    npcGroups.push(
      createDiscoveredEntity(
        label,
        data.kind === "crowd" ? "npc_group" : "npc_group",
        "story_text",
        beatsWithEntity,
        0.8,
        `Groupe de ${label}`,
      ),
    );
  }

  // Lieux détectés (seulement si pas déjà connus)
  const knownLocationLabels = new Set(
    (input.knownLocations ?? []).map((l) => l.name.toLowerCase()),
  );
  for (const [label] of detectedLocations) {
    if (knownLocationLabels.has(label.toLowerCase())) continue;
    const beatsWithEntity = beatTexts
      .filter((bt) => LOCATION_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)))
      .map((bt) => bt.beatId);
    locations.push(
      createDiscoveredEntity(label, "location", "story_text", beatsWithEntity, 0.7),
    );
  }

  // Robots
  for (const [label] of detectedRobots) {
    robots.push(
      createDiscoveredEntity(label, "robot", "story_text", [], 0.75),
    );
  }

  // Hybrides
  for (const [label] of detectedHybrids) {
    hybrids.push(
      createDiscoveredEntity(label, "hybrid", "story_text", [], 0.75),
    );
  }

  // Créatures
  for (const [label] of detectedCreatures) {
    creatures.push(
      createDiscoveredEntity(label, "creature", "story_text", [], 0.75),
    );
  }

  // Factions
  for (const [label] of detectedFactions) {
    factions.push(
      createDiscoveredEntity(label, "faction", "story_text", [], 0.7),
    );
  }

  // 4. Construire les bindings beat → entités
  for (const bt of beatTexts) {
    const beatChars = characters
      .filter((c) => bt.text.toLowerCase().includes(c.label.toLowerCase()))
      .map((c) => c.label);
    const beatLocs = locations
      .filter((l) => bt.text.toLowerCase().includes(l.label.toLowerCase()))
      .map((l) => l.label);
    const beatNpcs = npcGroups
      .filter((n) => n.detectedIn.includes(bt.beatId))
      .map((n) => n.label);

    beatBindings.push({
      beatId: bt.beatId,
      characters: beatChars,
      locations: beatLocs,
      npcGroups: beatNpcs,
      props: [],
    });
  }

  // 5. Vérifications et warnings
  if (locations.length === 0) {
    warnings.push("no_location_detected — le texte ne mentionne aucun lieu clair");
  }
  if (npcGroups.length === 0 && allText.length > 200) {
    const hasGroupMention = /groupe|gens|personnes|foule/i.test(allText);
    if (hasGroupMention) {
      warnings.push("potential_npc_group_missed — le texte mentionne des groupes mais aucun PNJ détecté");
    }
  }

  // 6. Props interdits
  let forbiddenPropsStripped = 0;
  const foundForbiddenProps: string[] = [];
  for (const fp of FORBIDDEN_PROPS) {
    if (allText.toLowerCase().includes(fp.toLowerCase())) {
      foundForbiddenProps.push(fp);
      forbiddenPropsStripped++;
    }
  }

  // 7. Construire le contrat
  const contract: ChapterVisualDiscoveryContract = {
    chapterId: input.chapterId,
    characters,
    npcGroups,
    locations,
    species,
    robots,
    hybrids,
    creatures,
    factions,
    props,
    forbiddenProps: [...FORBIDDEN_PROPS, ...SUSPICIOUS_PROPS],
    beatBindings,
  };

  const stats = {
    charactersFound: characters.length,
    locationsFound: locations.length,
    npcGroupsFound: npcGroups.length,
    robotsFound: robots.length,
    hybridsFound: hybrids.length,
    creaturesFound: creatures.length,
    factionsFound: factions.length,
    propsFound: props.length,
    forbiddenPropsStripped,
  };

  console.info(
    `[visual-discovery] characters=${stats.charactersFound} locations=${stats.locationsFound} ` +
      `npcGroups=${stats.npcGroupsFound} robots=${stats.robotsFound} hybrids=${stats.hybridsFound} ` +
      `creatures=${stats.creaturesFound} props=${stats.propsFound}`,
  );

  return { contract, warnings, stats };
}

/**
 * Formate le log du VisualDiscoveryPass.
 */
export function formatVisualDiscoveryLog(result: VisualDiscoveryPassResult): string {
  const s = result.stats;
  return (
    `[visual-discovery] characters=${s.charactersFound} locations=${s.locationsFound} ` +
    `npcGroups=${s.npcGroupsFound} robots=${s.robotsFound} hybrids=${s.hybridsFound} ` +
    `creatures=${s.creaturesFound}` +
    (result.warnings.length > 0 ? ` warnings=${result.warnings.join(",")}` : "")
  );
}
