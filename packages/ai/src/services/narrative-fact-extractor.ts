/**
 * Extracteur de faits narratifs depuis les beats de production.
 * Transforme l'histoire en informations exploitables par le backend
 * sans configuration manuelle utilisateur.
 *
 * Architecture à 3 couches :
 * 1. Heuristiques synchrones (patterns enrichis) — toujours actif, gratuit
 * 2. Analyse sémantique légère (regex avancées) — toujours actif, gratuit
 * 3. Enrichissement LLM async — optionnel, via enrichNarrativeFactsWithLLM
 */

import type {
  NarrativeFact,
  NarrativeFactType,
  PresenceObligation,
  RequiredProp,
} from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";
import { inferAdditionalFactsFromSemantics } from "./narrative-fact-llm-enricher";

export interface NarrativeExtractionContext {
  projectGenre?: string | null;
  projectTone?: string | null;
  universeType?: string | null;
  characterIds?: string[];
  heroCharacterId?: string | null;
  antagonistIds?: string[];
  antagonistNames?: string[];
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    entities?: {
      objectsGained?: string[];
      objectsLost?: string[];
      locationChange?: string;
    };
  }>;
  characterInventories?: Record<
    string,
    { carried: string[]; equipped: string[] }
  >;
}

export interface ChapterBundleExtractionResult {
  facts: NarrativeFact[];
  storyObjects: string[];
  presenceObligations: PresenceObligation[];
  speakerAnchors: Array<{
    beatId: string;
    speakerCharacterId: string;
    visibilityRequirement: "required_visible" | "offscreen_allowed" | "narration_only";
  }>;
}

// ─── Heuristiques ─────────────────────────────────────────────────────────────
// Stratégie : patterns larges (racines de mots, synonymes, formes passives,
// expressions composées) pour couvrir le vocabulaire naturel des utilisateurs.
// La couche LLM (inferNarrativeFactsWithLLM) complète ce que les patterns ratent.

const ACTION_VERBS = [
  // Formes actives
  "frappe", "frapper", "attaque", "attaquer", "combat", "combattre",
  "bloque", "bloquer", "esquive", "esquiver", "pare", "parer",
  "charge", "charger", "bondit", "bondir", "saute", "sauter",
  "tranche", "trancher", "poignarde", "poignarder",
  "tire", "tirer", "vise", "viser", "lance", "lancer",
  "jette", "jeter", "assène", "assener", "frappe",
  "coup", "coups", "blessure", "blesser", "touche", "toucher",
  "renverse", "renverser", "projette", "projeter",
  // Formes passives / résultats
  "est frappé", "est attaqué", "est blessé", "est touché",
  "reçoit un coup", "subit une attaque", "se fait attaquer",
  // Anglais
  "fights", "attacks", "strikes", "slashes", "shoots", "throws",
  "charges", "leaps", "kicks", "punches", "blocks", "dodges",
  "hits", "wounds", "beats", "smashes", "cuts",
];

const THREAT_VERBS = [
  "menace", "menacer", "pointe", "pointer", "braque", "braquer",
  "vise", "viser", "tient en joue", "dégaine", "dégainer",
  "brandit", "brandir", "agresse", "agresser",
  "piège", "piéger", "traque", "traquer", "poursuit", "poursuivre",
  "encercle", "encercler", "coincé", "coincée", "acculé", "acculée",
  "en danger", "sous la menace", "sous pression",
  "threatens", "aims", "draws", "brandishes", "points",
  "traps", "chases", "pursues", "corners", "surrounded",
];

const DIALOGUE_VERBS = [
  // Verbes de parole directs
  "dit", "dire", "parle", "parler", "crie", "crier",
  "murmure", "murmurer", "répond", "répondre",
  "demande", "demander", "annonce", "annoncer",
  "révèle", "révéler", "confie", "confier",
  "explique", "expliquer", "ordonne", "ordonner",
  "supplie", "supplier", "hurle", "hurler",
  "chuchote", "chuchoter", "avoue", "avouer",
  "avertit", "avertir", "prévient", "prévenir",
  "interroge", "interroger", "questionne", "questionner",
  "accuse", "accuser", "nie", "nier", "confirme", "confirmer",
  "propose", "proposer", "refuse", "refuser", "accepte", "accepter",
  "menace verbalement", "lance un ultimatum", "fait une déclaration",
  // Expressions composées
  "prend la parole", "brise le silence", "rompt le silence",
  "coupe la parole", "interrompt", "répliquer",
  // Anglais
  "says", "speaks", "shouts", "whispers", "replies", "asks",
  "announces", "reveals", "confesses", "explains", "orders",
  "pleads", "yells", "warns", "accuses", "denies", "confirms",
];

const PROP_USAGE_VERBS = [
  // Usage général
  "utilise", "utiliser", "saisit", "saisir", "prend", "prendre",
  "sort", "sortir", "ouvre", "ouvrir", "ferme", "fermer",
  "tape", "taper", "écrit", "écrire", "consulte", "consulter",
  "lit", "lire", "scanne", "scanner", "branche", "brancher",
  "débranche", "débrancher", "injecte", "injecter",
  "soigne", "soigner", "manipule", "manipuler",
  "active", "activer", "désactive", "désactiver",
  "pointe", "pointer", "vise", "viser",
  // Téléphone / communication — formes actives ET passives
  "appelle", "appeler", "téléphone", "téléphoner",
  "reçoit un appel", "reçoit un message", "reçoit une notification",
  "envoie un message", "envoie un texto", "envoie un sms",
  "répond au téléphone", "décroche", "raccrocher",
  "contacte", "contacter", "joint", "joindre",
  "appel entrant", "appel sortant", "coup de fil",
  "calls", "phones", "receives a call", "answers the phone",
  "texts", "messages", "contacts",
  // Hacking / informatique
  "hacks", "hack", "pirate", "pirater", "piraté",
  "s'infiltre", "s'infiltrer", "accède", "accéder",
  "contourne", "contourner", "déchiffre", "déchiffrer",
  "exploite", "exploiter", "compromet", "compromettre",
  "intrusion", "intrusion informatique",
  // Combat avec objet
  "lance", "lancer", "jette", "jeter", "tranche", "trancher",
  "transmet", "transmettre", "brande", "brandir", "wields",
  // Médical
  "opère", "opérer", "ausculte", "ausculter", "examine", "examiner",
  "panse", "panser", "recoud", "recoudre", "transfuse", "transfuser",
  // Anglais
  "uses", "grabs", "takes", "opens", "closes", "types", "writes",
  "consults", "reads", "scans", "plugs", "injects", "heals",
  "throws", "slashes", "transmits", "wields", "activates",
];

const MOVEMENT_VERBS = [
  "court", "courir", "fuit", "fuir", "s'enfuit", "s'enfuir",
  "avance", "avancer", "recule", "reculer", "monte", "monter",
  "descend", "descendre", "traverse", "traverser",
  "entre", "entrer", "sort", "sortir", "arrive", "arriver",
  "part", "partir", "se déplace", "se déplacer", "saute", "sauter",
  "s'échappe", "s'échapper", "pourchasse", "pourchasser",
  "runs", "flees", "advances", "retreats", "climbs", "descends",
  "crosses", "enters", "exits", "arrives", "leaves", "moves", "jumps",
  "escapes", "chases",
];

const REVEAL_SIGNALS = [
  "révèle", "révéler", "découvre", "découvrir",
  "démasque", "démasquer", "dévoile", "dévoiler",
  "montre", "montrer", "apparaît", "apparaître",
  "surgit", "surgir", "émerge", "émerger",
  "se révèle", "se dévoile", "se montre",
  "est révélé", "est découvert", "est démasqué",
  "la vérité éclate", "la vérité sort", "le secret est révélé",
  "reveals", "discovers", "unmasks", "unveils", "shows",
  "appears", "emerges", "is revealed", "truth comes out",
];

// Signaux de réaction émotionnelle — formes nominales ET verbales ET adjectivales
const REACTION_SIGNALS = [
  // Noms d'état émotionnel
  "choc", "choqué", "choquée", "sous le choc",
  "humiliation", "humilié", "humiliée",
  "peur", "apeuré", "apeurée", "effrayé", "effrayée",
  "surprise", "surpris", "surprise", "stupéfait", "stupéfaite",
  "honte", "honteux", "honteuse",
  "panique", "paniqué", "paniquée", "en panique",
  "désespoir", "désespéré", "désespérée",
  "colère", "furieux", "furieuse", "en colère",
  "douleur", "souffrance", "souffre", "souffrir",
  "tristesse", "triste", "abattu", "abattue",
  "terreur", "terrorisé", "terrorisée",
  "stupeur", "abasourdi", "abasourdie",
  "soulagement", "soulagé", "soulagée",
  // Expressions composées
  "reste figé", "reste figée", "reste sans voix",
  "perd ses mots", "n'en croit pas ses yeux",
  "s'effondre", "s'effondrer", "s'écroule", "s'écrouler",
  "tremble", "trembler", "vacille", "vaciller",
  "recule d'horreur", "recule de peur",
  "est sous le choc", "est abasourdi", "est tétanisé",
  "ne peut pas y croire", "n'en revient pas",
  // Anglais
  "shocked", "humiliated", "fear", "scared", "frightened",
  "surprised", "stunned", "ashamed", "panic", "panics",
  "horrified", "desperate", "broken", "devastated",
  "shattered", "paralyzed", "freezes", "collapses", "trembles",
  "speechless", "in disbelief", "overwhelmed",
];

const CONFRONTATION_SIGNALS = [
  "affronte", "affronter", "duel", "combat", "face à face",
  "confronte", "confronter", "s'oppose", "s'opposer",
  "se bat contre", "se batte contre",
  "faces", "duels", "fights", "confronts", "opposes", "standoff",
  "showdown", "clash", "face-off",
  "arrête", "arrêtent", "arrêter", "interpelle", "interpellent", "interpeller",
  "malmène", "malmènent", "malmener", "maltraite", "maltraitent",
  "agresse", "agressent", "agresser",
  "appréhende", "appréhendent", "appréhender",
  "capture", "capturent", "capturer",
  "attrape", "attrapent", "attraper de force",
  "pourchasse", "pourchassent", "pourchasser",
  "traque", "traquent", "traquer",
  "encercle", "encerclent", "encercler",
  "menace directement", "menacent directement",
  "brutalise", "brutalisent", "brutaliser",
  "frappe", "frappent",
  "immobilise", "immobilisent",
  "détient", "détiennent", "détenir de force",
  "empoigne", "empoignent",
  "saisit de force", "saisissent de force",
  "arrests", "apprehends", "captures", "chases", "pursues",
  "surrounds", "blocks passage", "attacks", "grabs", "detains",
  "restrains", "manhandles", "brutalizes", "intercepts", "ambushes",
];

const CROWD_SIGNALS = [
  // Lieux publics
  "foule", "marché", "rue", "arène", "station", "école", "lycée",
  "campus", "place publique", "esplanade", "quartier",
  "crowd", "market", "street", "arena", "station", "school",
  "campus", "plaza", "square", "district",
  // Groupes de personnes
  "public", "spectateurs", "spectators", "passants", "bystanders",
  "villageois", "villagers", "habitants", "inhabitants",
  "gardes", "guards", "soldats", "soldiers",
  "témoins", "witnesses", "badauds", "onlookers",
  "clients", "customers", "civils", "civilians",
  "élèves", "students", "professeurs", "teachers",
  "travailleurs", "workers", "citoyens", "citizens",
  "foule en colère", "attroupement", "rassemblement",
  "manifestants", "protesters", "réfugiés", "refugees",
  "paysans", "peasants", "marchands", "merchants",
  "moines", "monks", "guerriers", "warriors",
  "ninjas", "samouraïs", "samurai",
];

// ─── Matching sémantique enrichi ──────────────────────────────────────────────

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Détecte les patterns de communication (appel, message, contact)
 * même sous forme passive ou nominale.
 */
function hasCommunicationSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(appel|appelle|téléphone|message|texto|sms|coup de fil|communication)\b/.test(lower) ||
    /\b(call|phone|text|message|contact|reach out)\b/.test(lower) ||
    /reçoit (un |une )?(appel|message|notification|signal)/.test(lower) ||
    /envoie (un |une )?(message|texto|signal)/.test(lower)
  );
}

/**
 * Détecte les patterns de hacking / intrusion informatique.
 */
function hasHackingSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(hack|pirat|infiltr|intrusion|exploit|compromet|déchiffr|contourne)\b/.test(lower) ||
    /\b(terminal|serveur|système|réseau|firewall|accès non autorisé)\b/.test(lower) ||
    /\b(hacking|cracking|bypass|breach|infiltrate)\b/.test(lower)
  );
}

/**
 * Détecte les patterns médicaux.
 */
function hasMedicalSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(soign|bless|opér|médic|chirurg|infirm|hôpital|clinique|urgence)\b/.test(lower) ||
    /\b(seringue|perfusion|bandage|pansement|bistouri|scalpel)\b/.test(lower) ||
    /\b(médecin|docteur|infirmier|chirurgien|patient)\b/.test(lower) ||
    /\b(heal|wound|treat|operate|medical|doctor|nurse|hospital)\b/.test(lower)
  );
}

/**
 * Détecte les patterns mystiques / rituels.
 */
function hasMysticalSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(ritual|rituel|sceau|talisman|parchemin|grimoire|magie|sort|invocation)\b/.test(lower) ||
    /\b(autel|temple|sanctuaire|artefact|rune|symbole sacré)\b/.test(lower) ||
    /\b(spell|magic|ritual|seal|talisman|scroll|altar|sacred)\b/.test(lower)
  );
}

function generateId(prefix: string, beatId: string, index: number): string {
  return `${prefix}_${beatId}_${index}`;
}

// ─── Inférence par beat ────────────────────────────────────────────────────────

export function inferNarrativeFactsFromBeat(
  beat: ProductionBeat,
  context: NarrativeExtractionContext,
): NarrativeFact[] {
  const facts: NarrativeFact[] = [];
  const text = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ]
    .filter(Boolean)
    .join(" ");

  let idx = 0;

  // Action / combat
  if (matchesAny(text, ACTION_VERBS)) {
    facts.push({
      id: generateId("fact_action", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "action",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.85,
      source: "inference",
      notes: ["action verbs detected in beat summary"],
    });
  }

  // Menace / threat
  if (matchesAny(text, THREAT_VERBS)) {
    facts.push({
      id: generateId("fact_threat", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "threat",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["threat verbs detected"],
    });
  }

  // Dialogue
  if (matchesAny(text, DIALOGUE_VERBS)) {
    facts.push({
      id: generateId("fact_dialogue", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "dialogue",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["dialogue verbs detected"],
    });
  }

  // Usage d'objet — patterns + helpers sémantiques
  const hasPropUsage = matchesAny(text, PROP_USAGE_VERBS)
    || hasCommunicationSignal(text)
    || hasHackingSignal(text)
    || hasMedicalSignal(text)
    || hasMysticalSignal(text);

  if (hasPropUsage) {
    const propCandidates = extractPropCandidatesFromText(text, context);
    // Enrichir les candidats selon le type détecté
    if (hasCommunicationSignal(text) && !propCandidates.includes("phone")) {
      propCandidates.push("phone");
    }
    if (hasHackingSignal(text) && !propCandidates.includes("laptop")) {
      propCandidates.push("laptop");
    }
    facts.push({
      id: generateId("fact_prop_usage", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "prop_usage",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates,
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.75,
      source: "inference",
      notes: [
        "prop usage detected",
        ...(hasCommunicationSignal(text) ? ["communication signal"] : []),
        ...(hasHackingSignal(text) ? ["hacking signal"] : []),
        ...(hasMedicalSignal(text) ? ["medical signal"] : []),
        ...(hasMysticalSignal(text) ? ["mystical signal"] : []),
      ],
    });
  }

  // Déplacement
  if (matchesAny(text, MOVEMENT_VERBS)) {
    facts.push({
      id: generateId("fact_movement", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "movement",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.7,
      source: "inference",
    });
  }

  // Révélation
  if (matchesAny(text, REVEAL_SIGNALS)) {
    facts.push({
      id: generateId("fact_reveal", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "reveal",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: extractPropCandidatesFromText(text, context),
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["reveal signal detected"],
    });
    // Réaction émotionnelle associée
    facts.push({
      id: generateId("fact_reaction", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "emotional_reaction",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
    });
  }

  // Réaction émotionnelle indépendante (choc, peur, honte, panique...)
  if (matchesAny(text, REACTION_SIGNALS)) {
    facts.push({
      id: generateId("fact_reaction_emo", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "reaction",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["emotional reaction signal detected"],
    });
  }

  // Confrontation / ennemi
  if (matchesAny(text, CONFRONTATION_SIGNALS)) {
    facts.push({
      id: generateId("fact_enemy", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "enemy_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.95,
      source: "inference",
      notes: ["confrontation signal detected"],
    });
  }

  // Foule / scène publique
  if (matchesAny(text, CROWD_SIGNALS)) {
    facts.push({
      id: generateId("fact_npc", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "npc_presence",
      actorIds: [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["crowd/public scene detected"],
    });
  }

  const guardNouns =
    /(gardes?|guards?|soldats?|soldiers?|milice|militia|police|gendarmes?|sécurité)/i;
  const hostileContext = matchesAny(text, CONFRONTATION_SIGNALS);
  const hasHostileGuard = guardNouns.test(text) && hostileContext;

  if (hasHostileGuard && !facts.some((f) => f.type === "enemy_presence")) {
    facts.push({
      id: generateId("fact_hostile_guard", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "enemy_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["hostile guard context: guard noun + confrontation signal"],
    });
  }

  // Signal de lieu
  if ((beat.environmentContext?.length ?? 0) > 0) {
    facts.push({
      id: generateId("fact_location", beat.beatId, idx++),
      beatId: beat.beatId,
      type: "location_signal",
      actorIds: [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.7,
      source: "outline",
    });
  }

  // Réinjection depuis la continuité
  if (context.recentContinuityEvents) {
    for (const event of context.recentContinuityEvents) {
      const gained = event.entities?.objectsGained ?? [];
      const lost = event.entities?.objectsLost ?? [];
      if (gained.length > 0 || lost.length > 0) {
        facts.push({
          id: generateId("fact_continuity_prop", beat.beatId, idx++),
          beatId: beat.beatId,
          type: "prop_transfer",
          actorIds: beat.involvedCharacters ?? [],
          targetIds: [],
          propCandidates: [...gained, ...lost],
          locationSignals: [],
          requiredVisibility: "may_show",
          evidenceStrength: 0.85,
          source: "continuity",
          notes: [
            ...(gained.length > 0 ? [`objects gained: ${gained.join(", ")}`] : []),
            ...(lost.length > 0 ? [`objects lost: ${lost.join(", ")}`] : []),
          ],
        });
      }
    }
  }

  // Couche 2 : analyse sémantique légère — détecte ce que les patterns ratent
  // (formes passives, expressions idiomatiques, noms d'objets sans verbe d'usage)
  const semanticFacts = inferAdditionalFactsFromSemantics(beat, facts);
  facts.push(...semanticFacts);

  return facts;
}

// ─── Extraction de candidats props depuis le texte ────────────────────────────

function extractPropCandidatesFromText(
  text: string,
  context: NarrativeExtractionContext,
): string[] {
  const lower = text.toLowerCase();
  const candidates: string[] = [];

  // Armes ninja
  if (/(kunai|shuriken|lame|épée|katana|tanto|ninjato|kunai)/.test(lower)) {
    candidates.push(...["kunai", "shuriken", "lame courte"].filter((p) => lower.includes(p)));
  }
  // Armes génériques
  if (/(arme|pistolet|fusil|revolver|gun|rifle|pistol|sword|blade)/.test(lower)) {
    candidates.push("weapon");
  }
  // Tech / communication
  if (/(téléphone|phone|mobile|smartphone)/.test(lower)) candidates.push("phone");
  if (/(ordinateur|laptop|computer|pc|terminal)/.test(lower)) candidates.push("laptop");
  if (/(tablette|tablet)/.test(lower)) candidates.push("tablet");
  if (/(écouteur|oreillette|earpiece|headset)/.test(lower)) candidates.push("earpiece");
  if (/(badge|carte d'accès|access card|keycard)/.test(lower)) candidates.push("badge");
  // Médical
  if (/(bandage|pansement|bandage|dressing)/.test(lower)) candidates.push("bandage");
  if (/(seringue|syringe|injection)/.test(lower)) candidates.push("syringe");
  // Mystique
  if (/(talisman|amulette|amulet|grimoire|artefact|artifact|sceau|seal)/.test(lower)) {
    candidates.push("mystical artifact");
  }
  // Preuve / document
  if (/(dossier|document|preuve|evidence|photo|fichier|file|folder)/.test(lower)) {
    candidates.push("document/evidence");
  }
  // Inventaire personnage
  if (context.characterInventories) {
    for (const inv of Object.values(context.characterInventories)) {
      candidates.push(...inv.carried, ...inv.equipped);
    }
  }

  return [...new Set(candidates)];
}

// ─── Extraction depuis un chapitre complet ────────────────────────────────────

export function extractNarrativeFactsFromChapterBundle(
  beats: ProductionBeat[],
  context: NarrativeExtractionContext,
): ChapterBundleExtractionResult {
  const allFacts: NarrativeFact[] = [];
  const storyObjectsSet = new Set<string>();
  const presenceObligations: PresenceObligation[] = [];
  const speakerAnchors: ChapterBundleExtractionResult["speakerAnchors"] = [];

  for (const beat of beats) {
    const beatFacts = inferNarrativeFactsFromBeat(beat, context);
    allFacts.push(...beatFacts);

    // Collecter les objets narratifs
    for (const fact of beatFacts) {
      for (const prop of fact.propCandidates) {
        storyObjectsSet.add(prop);
      }
    }

    // Générer les obligations de présence
    const hasEnemy = beatFacts.some((f) => f.type === "enemy_presence" || f.type === "threat");
    const hasCrowd = beatFacts.some((f) => f.type === "npc_presence");
    const hasDialogue = beatFacts.some((f) => f.type === "dialogue");

    if (hasEnemy) {
      presenceObligations.push({
        id: `obligation_enemy_${beat.beatId}`,
        beatId: beat.beatId,
        entityType: "enemy",
        entityIdOrLabel: "enemy_actor",
        requirement: "must_show",
        minVisualSalience: "high",
        reason: "beat involves threat or confrontation",
      });
    }

    if (hasCrowd) {
      presenceObligations.push({
        id: `obligation_crowd_${beat.beatId}`,
        beatId: beat.beatId,
        entityType: "crowd",
        entityIdOrLabel: "crowd_group",
        requirement: "should_show",
        minVisualSalience: "low",
        reason: "public/crowd scene detected",
      });
    }

    // Speaker anchors pour les beats dialogue
    if (hasDialogue && beat.involvedCharacters && beat.involvedCharacters.length > 0) {
      speakerAnchors.push({
        beatId: beat.beatId,
        speakerCharacterId: beat.involvedCharacters[0],
        visibilityRequirement: "required_visible",
      });
    }
  }

  return {
    facts: allFacts,
    storyObjects: [...storyObjectsSet],
    presenceObligations,
    speakerAnchors,
  };
}
