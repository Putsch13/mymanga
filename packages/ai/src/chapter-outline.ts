import { z } from "zod";
import type {
  BeatNarrativeContract,
  StructuredBeatPayload,
} from "@manga-ai-studio/core";
import { beatContractFromLegacyRole } from "@manga-ai-studio/core";
import type { GenerationOperationalStatus } from "./generation-status";
import { inferGenreMode, buildGenreDirectorPromptHints, getGenreDirectorConfig } from "./services/genre-director";

const PAGE_ROLES = [
  "establishing",
  "escalation",
  "confrontation",
  "revelation",
  "aftermath",
  "cliffhanger",
] as const;

export type PageRole = (typeof PAGE_ROLES)[number];

const outlineArcPromiseSchema = z.object({
  arcName: z.string().min(1),
  promise: z.string().min(3),
  stage: z.enum(["setup", "progression", "payoff", "twist"]),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  payoffTarget: z.string().nullable().optional(),
});

const outlineWorldConsequenceSchema = z.object({
  consequenceType: z.string().min(1),
  description: z.string().min(3),
  scope: z.enum(["local", "chapter", "world"]).default("local"),
  persistence: z.enum(["temporary", "lasting", "permanent"]).default("lasting"),
  affectedLocations: z.array(z.string()).default([]),
  affectedCharacters: z.array(z.string()).default([]),
});

const outlineSetupPayoffHookSchema = z.object({
  hookId: z.string().min(1),
  label: z.string().min(3),
  kind: z.enum(["setup", "foreshadowing", "echo", "payoff"]),
  targetBeatHint: z.string().nullable().optional(),
  resolved: z.boolean().optional().default(false),
});

const structuredBeatPayloadSchema = z.object({
  source: z.enum(["generator_structured", "heuristic_fallback"]).default("heuristic_fallback"),
  confidence: z.number().min(0).max(1).default(0.45),
  arcPromises: z.array(outlineArcPromiseSchema).default([]),
  worldConsequences: z.array(outlineWorldConsequenceSchema).default([]),
  setupPayoffHooks: z.array(outlineSetupPayoffHookSchema).default([]),
});

const STORY_FUNCTIONS = [
  "setup",
  "discovery",
  "dialogue_tension",
  "investigation",
  "movement",
  "revelation",
  "aftermath",
  "decision",
  "transition",
] as const;
const ACTION_ENVELOPES = [
  "none",
  "micro",
  "physical_nonviolent",
  "combat_light",
  "combat_full",
] as const;
const VISUAL_ESCALATION_POLICIES = [
  "forbid_invented_action",
  "allow_literal_only",
  "allow_stylized_intensification",
] as const;

const beatNarrativeContractSchema = z.object({
  beatId: z.string().min(1),
  summary: z.string().min(1),
  storyFunction: z.enum(STORY_FUNCTIONS),
  actionEnvelope: z.enum(ACTION_ENVELOPES),
  visualEscalationPolicy: z.enum(VISUAL_ESCALATION_POLICIES),
  causalInputs: z.array(z.string()).default([]),
  causalOutputs: z.array(z.string()).default([]),
  forbiddenVisualEvents: z.array(z.string()).default([]),
  requiredVisualEvents: z.array(z.string()).default([]),
});

const outlineResultSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(20),
  cliffhanger: z.string().min(5),
  beats: z
    .array(
      z.object({
        summary: z.string().min(10),
        emotionalTone: z.string().optional(),
        pageRole: z.enum(PAGE_ROLES).default("escalation"),
        turn: z.string().default(""),
        emotionalDelta: z.number().min(-3).max(3).default(0),
        location: z.string().default(""),
        characters: z.array(z.string()).default([]),
        structuredBeat: structuredBeatPayloadSchema.default({
          source: "heuristic_fallback",
          confidence: 0.45,
          arcPromises: [],
          worldConsequences: [],
          setupPayoffHooks: [],
        }),
        // Phase 1: optional structured narrative contract. When absent, the
        // normalizer derives a conservative default from pageRole via
        // beatContractFromLegacyRole (which will NOT silently escalate to
        // combat). When present, it overrides the legacy-derived fallback.
        beatNarrativeContract: beatNarrativeContractSchema.optional(),
      }),
    )
    .min(3)
    .max(10),
});

export type ChapterOutlineResult = z.infer<typeof outlineResultSchema>;

import type { CreativityControls } from "@manga-ai-studio/world";

export type ChapterOutlineContext = {
  projectTitle: string;
  pitch: string | null;
  description?: string | null;
  primaryGenre: string | null;
  subGenres?: string[];
  tone?: string | null;
  visualStyle?: string | null;
  styleGuide?: string | null;
  cast?: Array<{
    name: string;
    roleType?: string | null;
    objective?: string | null;
    status?: string | null;
    fear?: string | null;
    traits?: string[];
    appearance?: string | null;
  }>;
  intentEntities?: Array<{
    name: string;
    entityKind?: string | null;
    dialogueMode?: string | null;
    recurrencePolicy?: string | null;
    roleHint?: string | null;
    speciesLabel?: string | null;
  }>;
  knownLocations?: Array<{ name: string; type?: string | null; description?: string | null; aliases?: string[] }>;
  relationships?: Array<{ source: string; target: string; type: string }>;
  arcs?: Array<{ name: string; summary: string | null; status: string }>;
  allRecentChapters?: Array<{ chapterNumber: number; title: string | null; summary: string | null; cliffhanger: string | null }>;
  bibleSummary?: string | null;
  themes?: string[];
  continuitySnippets?: string[];
  recentContinuityEvents?: Array<{ eventType: string; summary: string | null; permanent: boolean; importance: number }>;
  retrievedContext?: string[];
  settings?: {
    dialogueDensity?: number | null;
    darknessLevel?: number | null;
    mysteryLevel?: number | null;
    violenceLevel?: number | null;
    romanceLevel?: number | null;
    sensualityLevel?: number | null;
    canonStrictness?: number | null;
  } | null;
  chapterNumber: number;
  chapterTitle: string | null;
  userIntent: string;
  quickTag: string | null;
  creativityControls?: Partial<CreativityControls> | null;
  previousSummary: string | null;
  previousCliffhanger: string | null;
  seriesSynopsis?: string | null;
  targetBeats?: number;
};

export type ChapterOutlineGenerationResult = {
  outline: ChapterOutlineResult;
  usedOpenAI: boolean;
  model?: string;
  degradedStatus: GenerationOperationalStatus;
  fallbackReason?: string;
};

function buildBeatHookId(chapterNumber: number, index: number, label: string) {
  return `ch${chapterNumber}-beat${index + 1}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferStructuredBeatPayload(
  ctx: ChapterOutlineContext,
  beat: {
    summary: string;
    turn?: string;
    location?: string;
    characters?: string[];
    pageRole?: PageRole;
  },
  index: number,
  total: number,
): StructuredBeatPayload {
  const stage: StructuredBeatPayload["arcPromises"][number]["stage"] =
    beat.pageRole === "establishing"
      ? "setup"
      : beat.pageRole === "revelation"
        ? "twist"
        : beat.pageRole === "cliffhanger" || index === total - 1
          ? "payoff"
          : "progression";
  const priority =
    beat.pageRole === "cliffhanger" || beat.pageRole === "revelation"
      ? "high"
      : beat.pageRole === "confrontation" || beat.pageRole === "aftermath"
        ? "medium"
        : "low";
  const primaryArc = ctx.arcs?.find((arc) => arc.status !== "closed") ?? ctx.arcs?.[0];
  const primaryLocation = beat.location?.trim() || ctx.knownLocations?.[0]?.name || "lieu principal";
  const characters = (beat.characters ?? []).filter(Boolean);
  const payoffTarget =
    stage === "setup" || stage === "progression"
      ? `Beat ${Math.min(total, index + (stage === "setup" ? 3 : 2))}`
      : null;

  return {
    source: "heuristic_fallback",
    confidence: 0.46,
    arcPromises: [
      {
        arcName: primaryArc?.name ?? "Arc principal",
        promise: beat.turn?.trim() || beat.summary.slice(0, 140),
        stage,
        priority,
        payoffTarget,
      },
    ],
    worldConsequences: [
      {
        consequenceType:
          beat.pageRole === "cliffhanger"
            ? "cliffhanger_pressure"
            : beat.pageRole === "revelation"
              ? "new_information"
              : beat.pageRole === "confrontation"
                ? "conflict_shift"
                : "scene_progression",
        description: `Conséquence active autour de ${primaryLocation}: ${beat.turn?.trim() || beat.summary.slice(0, 120)}`,
        scope: beat.pageRole === "cliffhanger" ? "chapter" : "local",
        persistence: beat.pageRole === "aftermath" || beat.pageRole === "cliffhanger" ? "lasting" : "temporary",
        affectedLocations: [primaryLocation],
        affectedCharacters: characters,
      },
    ],
    setupPayoffHooks: [
      {
        hookId: buildBeatHookId(ctx.chapterNumber, index, stage),
        label:
          stage === "payoff"
            ? `Payoff de ${beat.turn?.trim() || beat.summary.slice(0, 80)}`
            : `Setup à surveiller: ${beat.turn?.trim() || beat.summary.slice(0, 80)}`,
        kind:
          stage === "payoff"
            ? "payoff"
            : beat.pageRole === "revelation"
              ? "foreshadowing"
              : beat.pageRole === "aftermath"
                ? "echo"
                : "setup",
        targetBeatHint: payoffTarget,
        resolved: stage === "payoff",
      },
    ],
  };
}

function mergeStructuredBeatPayload(
  fallback: StructuredBeatPayload,
  payload: StructuredBeatPayload | undefined,
): StructuredBeatPayload {
  if (!payload) return fallback;
  return {
    source: payload.source,
    confidence:
      payload.arcPromises.length + payload.worldConsequences.length + payload.setupPayoffHooks.length === 0
        ? Math.max(payload.confidence, fallback.confidence)
        : payload.confidence,
    arcPromises: payload.arcPromises.length > 0 ? payload.arcPromises : fallback.arcPromises,
    worldConsequences:
      payload.worldConsequences.length > 0 ? payload.worldConsequences : fallback.worldConsequences,
    setupPayoffHooks:
      payload.setupPayoffHooks.length > 0 ? payload.setupPayoffHooks : fallback.setupPayoffHooks,
  };
}

function normalizeOutlineResult(
  ctx: ChapterOutlineContext,
  outline: ChapterOutlineResult,
): ChapterOutlineResult {
  return {
    ...outline,
    beats: outline.beats.map((beat, index) => ({
      ...beat,
      structuredBeat: mergeStructuredBeatPayload(
        inferStructuredBeatPayload(ctx, beat, index, outline.beats.length),
        beat.structuredBeat,
      ),
      beatNarrativeContract:
        beat.beatNarrativeContract ??
        deriveBeatNarrativeContractFromOutlineBeat({
          chapterNumber: ctx.chapterNumber,
          index,
          summary: beat.summary,
          pageRole: beat.pageRole,
        }),
    })),
  };
}

/**
 * Derives a BeatNarrativeContract from a legacy outline beat. Conservative by
 * design: only the literal pageRole="action" promotes to combat_full. Every
 * other legacy role resolves to its non-combat storyFunction default. Callers
 * that want combat must emit a structured contract explicitly.
 */
export function deriveBeatNarrativeContractFromOutlineBeat(input: {
  chapterNumber: number;
  index: number;
  summary: string;
  /** Accept any string so callers upstream of the Zod parse can still use it. */
  pageRole?: string;
}): BeatNarrativeContract {
  const beatId = `ch${input.chapterNumber}-beat${input.index + 1}`;
  const legacyPageRole = input.pageRole ?? "escalation";
  return beatContractFromLegacyRole({
    beatId,
    summary: input.summary,
    legacyPageRole,
    explicitCombat: legacyPageRole === "action",
  });
}

function fallbackOutline(ctx: ChapterOutlineContext): ChapterOutlineResult {
  const inferPrimaryLocation = () => {
    const text = `${ctx.userIntent} ${ctx.previousSummary ?? ""} ${ctx.previousCliffhanger ?? ""}`.toLowerCase();
    const matches = [
      ["banque", "banque centrale sous haute sécurité"],
      ["café", "café néon du centre-ville"],
      ["cafe", "café néon du centre-ville"],
      ["taverne", "taverne enfumée aux lumières basses"],
      ["rue", "rue néon sous la pluie"],
      ["ruelle", "ruelle néon sous la pluie"],
      ["ville", "centre-ville cyberpunk"],
      ["toit", "toit d'immeuble au-dessus de la ville"],
      ["forêt", "forêt telle que décrite dans le scénario"],
      ["foret", "forêt telle que décrite dans le scénario"],
      ["falaise", "hauteur vertigineuse cohérente avec le récit"],
      ["palais", "palais ou grande salle cohérente avec le récit"],
      ["trône", "palais ou grande salle cohérente avec le récit"],
    ] as const;
    for (const [needle, value] of matches) {
      if (text.includes(needle)) return value;
    }
    if (genre.includes("cyber") || genre.includes("sci")) return "quartier financier cyberpunk";
    if (genre.includes("romance") || genre.includes("shojo")) return "café calme en soirée";
    if (genre.includes("horror") || genre.includes("horreur")) return "couloir sans fenêtres";
    return "lieu principal non spécifié";
  };

  const intent = ctx.userIntent.slice(0, 400);
  const genre = (ctx.primaryGenre ?? "manga").toLowerCase();
  const quickTag = (ctx.quickTag ?? "bold").toLowerCase();
  const creativityHint = ctx.creativityControls
    ? ` Contrôles moteur: novelty ${ctx.creativityControls.noveltyLevel ?? 50}, canon ${ctx.creativityControls.worldStrictness ?? 80}, PNJ ${ctx.creativityControls.npcVariety ?? 55}, décor ${ctx.creativityControls.environmentRichness ?? 70}.`
    : "";
  const castNames = (ctx.cast ?? []).slice(0, 4).map((item) => item.name);
  const cast = castNames.join(", ");
  const primaryLocation = inferPrimaryLocation();
  const previousSummary = ctx.previousSummary ? `Après ${ctx.previousSummary.slice(0, 140)}` : "Sans récapitulatif récent";
  const previousCliffhanger = ctx.previousCliffhanger
    ? `Le précédent cliffhanger était : ${ctx.previousCliffhanger.slice(0, 120)}`
    : "Aucun cliffhanger exploitable n'est remonté";
  const genreBeats =
    genre.includes("romance") || genre.includes("shojo")
      ? [
          "Un geste ambigu trouble l'équilibre relationnel.",
          "Une tension intime contredit les paroles échangées.",
          "Un aveu partiel change la dynamique du duo.",
          "Une interruption brutale relance le manque.",
        ]
      : genre.includes("horror") || genre.includes("horreur")
        ? [
            "Un détail inquiétant surgit dans le décor.",
            "La peur force un choix irrationnel.",
            "Une présence cachée déforme la scène.",
            "La révélation finale ouvre une menace plus vaste.",
          ]
        : genre.includes("cyber") || genre.includes("sci")
          ? [
              "Une anomalie technique révèle une faille du système.",
              "L'équipe comprend qu'elle a été observée.",
              "Une décision stratégique crée un coût humain.",
              "Une donnée cachée inverse la lecture du conflit.",
            ]
          : [
              "Un nouvel indice déplace l'objectif immédiat.",
              "Une confrontation met les alliances sous pression.",
              "Un choix risqué accélère le conflit.",
              "Une conséquence brutale promet une suite plus dure.",
            ];

  return {
    title: ctx.chapterTitle ?? `Chapitre ${ctx.chapterNumber}`,
    summary: `${previousSummary}. ${previousCliffhanger}. Le chapitre ${ctx.chapterNumber} de « ${ctx.projectTitle} » avance autour de : ${intent}. Cast prioritaire : ${cast || "à préciser"}. Axe narratif ${quickTag}.${creativityHint}`,
    cliffhanger:
      quickTag === "shock"
        ? "La dernière case révèle une vérité qui fracture immédiatement la suite."
        : quickTag === "safe"
          ? "La situation semble tenue, mais un nouveau détail compromet l'équilibre."
          : "Au moment de souffler, un retournement rend la suite inévitable.",
    beats: [
      {
        summary: `${genreBeats[0]} Intent: ${intent.slice(0, 100)}.`,
        emotionalTone: "tension",
        pageRole: "establishing" as const,
        turn: "Le décor est planté, un élément attire l'attention.",
        emotionalDelta: 1,
        location: primaryLocation,
        characters: castNames.slice(0, 2),
        structuredBeat: inferStructuredBeatPayload(
          ctx,
          {
            summary: `${genreBeats[0]} Intent: ${intent.slice(0, 100)}.`,
            turn: "Le décor est planté, un élément attire l'attention.",
            location: primaryLocation,
            characters: castNames.slice(0, 2),
            pageRole: "establishing",
          },
          0,
          4,
        ),
      },
      {
        summary: `${genreBeats[1]} Le chapitre cherche une variation ${quickTag}.`,
        emotionalTone: "montée",
        pageRole: "escalation" as const,
        turn: "La pression monte, un choix se dessine.",
        emotionalDelta: 2,
        location: primaryLocation,
        characters: castNames.slice(0, 3),
        structuredBeat: inferStructuredBeatPayload(
          ctx,
          {
            summary: `${genreBeats[1]} Le chapitre cherche une variation ${quickTag}.`,
            turn: "La pression monte, un choix se dessine.",
            location: primaryLocation,
            characters: castNames.slice(0, 3),
            pageRole: "escalation",
          },
          1,
          4,
        ),
      },
      {
        summary: `${genreBeats[2]} Les conséquences deviennent visibles.`,
        emotionalTone: "pic",
        pageRole: "revelation" as const,
        turn: "Une vérité éclate et change la donne.",
        emotionalDelta: -1,
        location: primaryLocation,
        characters: castNames.slice(0, 2),
        structuredBeat: inferStructuredBeatPayload(
          ctx,
          {
            summary: `${genreBeats[2]} Les conséquences deviennent visibles.`,
            turn: "Une vérité éclate et change la donne.",
            location: primaryLocation,
            characters: castNames.slice(0, 2),
            pageRole: "revelation",
          },
          2,
          4,
        ),
      },
      {
        summary: `${genreBeats[3]} La fin du chapitre prépare une vraie relance.`,
        emotionalTone: "chute",
        pageRole: "cliffhanger" as const,
        turn: "Un retournement final rend la suite inévitable.",
        emotionalDelta: -2,
        location: primaryLocation,
        characters: castNames,
        structuredBeat: inferStructuredBeatPayload(
          ctx,
          {
            summary: `${genreBeats[3]} La fin du chapitre prépare une vraie relance.`,
            turn: "Un retournement final rend la suite inévitable.",
            location: primaryLocation,
            characters: castNames,
            pageRole: "cliffhanger",
          },
          3,
          4,
        ),
      },
    ],
  };
}

/**
 * Produit un outline structuré (résumé, cliffhanger, beats) pour le lecteur manga / pipeline.
 * Sans `OPENAI_API_KEY`, renvoie un gabarit déterministe basé sur l’intention utilisateur.
 */
function buildOutlineFallbackResult(
  ctx: ChapterOutlineContext,
  fallbackReason: string,
): ChapterOutlineGenerationResult {
  console.warn(
    `[generateChapterOutline] degraded_status=DEGRADED_OUTLINE_FALLBACK chapter=${ctx.chapterNumber} reason=${fallbackReason}`,
  );
  return {
    outline: fallbackOutline(ctx),
    usedOpenAI: false,
    degradedStatus: "DEGRADED_OUTLINE_FALLBACK",
    fallbackReason,
  };
}

export async function generateChapterOutline(
  ctx: ChapterOutlineContext,
): Promise<ChapterOutlineGenerationResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return buildOutlineFallbackResult(ctx, "OPENAI_API_KEY missing");
  }

  // Inférer le mode genre et construire les hints directeur
  const genreMode = inferGenreMode(ctx.creativityControls ?? {}, ctx.quickTag);
  const genreConfig = getGenreDirectorConfig(genreMode);
  const genreHints = buildGenreDirectorPromptHints(genreConfig);
  const genreDirectorBlock = `\nDIRECTEUR DE GENRE (mode: ${genreMode}) :\n${genreHints.map((h) => `- ${h}`).join("\n")}\n`;

  const model = process.env.OPENAI_OUTLINE_MODEL?.trim() || "gpt-4o-mini";
  const system = `Tu es scénariste manga / webtoon senior pour un outil de production professionnelle.
Réponds UNIQUEMENT en JSON valide, clés : title (optionnel), summary (string), cliffhanger (string), beats (array).
Chaque beat DOIT contenir :
  - summary (string, min 10 chars)
  - emotionalTone (string, optionnel)
  - pageRole (OBLIGATOIRE) : un parmi "establishing", "escalation", "confrontation", "revelation", "aftermath", "cliffhanger"
  - turn (OBLIGATOIRE) : le micro-retournement ou événement clé de cette page (1 phrase)
  - emotionalDelta (OBLIGATOIRE) : nombre entier de -3 à +3, variation émotionnelle par rapport au beat précédent
  - location (OBLIGATOIRE) : lieu principal de cette page, cohérent avec l'intention utilisateur et les pages voisines
  - characters (OBLIGATOIRE) : tableau de noms des personnages PRESENTS dans cette page (utiliser les noms exacts du cast fourni)
  - structuredBeat (OBLIGATOIRE) :
      - source = "generator_structured"
      - confidence = nombre 0..1
      - arcPromises = tableau de { arcName, promise, stage: "setup"|"progression"|"payoff"|"twist", priority: "low"|"medium"|"high", payoffTarget? }
      - worldConsequences = tableau de { consequenceType, description, scope: "local"|"chapter"|"world", persistence: "temporary"|"lasting"|"permanent", affectedLocations?: string[], affectedCharacters?: string[] }
      - setupPayoffHooks = tableau de { hookId, label, kind: "setup"|"foreshadowing"|"echo"|"payoff", targetBeatHint?, resolved? }

Langue : français. Les beats sont des étapes narratives courtes (pas de dialogue complet).
Nombre de beats : tu DOIS produire exactement ${ctx.targetBeats ?? 10} story beats, chacun avec un summary et un turn nettement distincts des autres — aucun doublon ni paraphrase paresseuse.
Chaque beat DOIT être visuellement actionnable et dépeindre un moment concret.
INTERDIT d'utiliser des beats abstraits de remplissage tels que "la tension monte", "les enjeux augmentent", ou "la pression s'intensifie" à moins qu'ils ne soient liés à une action visible spécifique.
Chaque beat DOIT inclure :
- participants (qui agit)
- action visible (ce qu'ils font concrètement)
- tonalité émotionnelle
- contexte spatial (où ça se passe)
- ce qui change à la fin du beat
INTERDIT d'utiliser des summaries « placeholders » génériques qui ne font que nommer une phase (ex. titres vides du type « Montée en pression », « Escalade », « Point de basculement », « Réaction en chaîne », « Nouvelle donne », « Tension maximale » sans événement concret lié au cast et aux lieux fournis). Chaque summary doit décrire une action ou une information spécifique à CE chapitre.
${genreDirectorBlock}
RÈGLES DE RYTHME MANGA :
- INTERDIT : 2 beats consécutifs avec le même pageRole.
- OBLIGATOIRE : au moins 1 beat "revelation" et 1 beat "aftermath" par chapitre.
- Le premier beat doit être "establishing" ou "escalation".
- Le dernier beat doit être "cliffhanger".
- Varier les emotionalDelta : alterner montées (+1/+2) et descentes (-1/-2) pour créer un vrai rythme.
- Chaque turn doit être UNIQUE et faire progresser l'intrigue de manière irréversible.
- TOUS les personnages du cast doivent apparaître dans au moins 2 beats chacun.
- Ne pas concentrer l'action sur un seul personnage : varier les combinaisons de personnages par beat.
- Ne pas changer de décor sans raison narrative claire. Si l'intention utilisateur se déroule surtout dans un même lieu, la majorité des beats doivent rester dans ce lieu.

RÈGLES ANTI-RÉPÉTITION (CRITIQUE) :
- ABSOLUMENT INTERDIT de répéter ou paraphraser une situation déjà décrite dans un beat précédent.
- Chaque beat doit introduire UN élément NOUVEAU : une information, une action, une conséquence ou une émotion inédite.
- Les beats 4-6 doivent constituer une montée en tension DISTINCTE des beats 1-3 (jamais un miroir ou une reprise).
- Les beats 7+ doivent représenter une ESCALADE ou un RENVERSEMENT de situation — jamais une répétition des beats 1-3.
- Si un beat N ressemble (même lieu + mêmes personnages + même type d'action) au beat N-3 ou N-6, réécris-le entièrement avec une nouvelle information ou un nouveau déplacement narratif.
- Test obligatoire : pour chaque beat, vérifie "Ce beat n'a PAS encore été dit ni montré dans les beats précédents" — si faux, réécris.

RÈGLES DE CONTINUITÉ STRICTE :
- Si previousCliffhanger est fourni, le PREMIER beat DOIT répondre directement à ce cliffhanger.
- Le summary global DOIT commencer par "Après que..." ou "Suite à..." en référençant le chapitre précédent.
- Chaque beat DOIT nommer explicitement les personnages du cast par leur nom (PAS de "le protagoniste", "le héros", etc.).
- seriesSynopsis résume TOUTE l'histoire : ne pas la contredire, la continuer logiquement.
- Si un personnage a un statut "blessé", "disparu" ou "mort", cela DOIT se refléter dans les beats.
- Si l'utilisateur nomme explicitement un nouveau personnage dans son intention (ex: "Suko"), tu peux utiliser ce nom comme nouveau PNJ récurrent, même s'il n'est pas encore dans le cast.
- Si knownLocations contient un lieu compatible avec l'intention, utilise ce lieu en priorité.
- Si l'intention se déroule dans un seul lieu principal (ex: banque, café, taverne), garde ce lieu sur la majorité des beats.

RÈGLES ABSOLUES DE CONTINUITÉ :
1. Respecter scrupuleusement le canon : personnages, lieux, statuts, relations et événements passés.
2. Ne jamais ressusciter un personnage mort ni ignorer un statut "blessé" ou "disparu".
3. Chaque beat découle CAUSALEMENT du précédent : lieu → action → conséquence → réaction. Aucun saut non justifié.
4. UTILISER EN PRIORITÉ les personnages du cast fourni. N'invente de nouveaux noms QUE s'ils sont explicitement écrits dans l'intention utilisateur.
5. Le cliffhanger doit être PRÉPARÉ dans les beats précédents, pas surgir de nulle part.
6. Respecter l'intention utilisateur tout en restant cohérent avec l'arc en cours.
7. Si canonStrictness > 80, ne rien modifier qui contredise la bible ou les événements permanents.
8. Les entités explicitement nommées dans intentEntities doivent apparaître dans l'histoire si elles sont pertinentes.
9. Chaque beat doit porter au moins un arcPromise, une worldConsequence et un setupPayoffHook utiles à la suite.
10. Les hooks des premiers beats doivent préparer explicitement les payoffs des derniers beats.
11. Les conséquences monde doivent être concrètes et persistables, jamais vagues.

TRADUCTION STRICTE DE L'INTENTION UTILISATEUR :
- L'intention utilisateur n'est pas un thème vague : c'est une CONTRAINTE DE MISE EN SCÈNE.
- Décomposer l'intention en chaîne causale explicite : déclencheur -> réaction -> décision -> conséquence -> nouvelle situation.
- Si l'intention décrit un mécanisme psychologique ou imaginaire (stress, fuite mentale, monde imaginaire, créature confidente, etc.), montrer visiblement ces étapes dans plusieurs beats.
- Si l'intention mentionne une entité, une créature, un PNJ ou un confident, cette présence doit être utile à l'intrigue, au dialogue et au visuel — pas juste décorative.
- Les dialogues doivent servir l'intention : confession, question, conflit, soulagement, révélation ou promesse.
- Le chapitre doit pouvoir être résumé comme une exécution fidèle de l'intention utilisateur, pas comme une intrigue générique du même genre.

RÈGLES DE COHÉRENCE INTER-CHAPITRES :
8. Lire attentivement allRecentChapters : chaque chapitre DOIT continuer là où le précédent s'est arrêté.
9. Le résumé (summary) doit EXPLICITEMENT référencer le contexte précédent ("Après que X...", "Suite à...").
10. Les relations entre personnages (relationships) doivent influencer les interactions dans les beats.
11. Les arcs narratifs (arcs) en cours doivent progresser ; ne pas les ignorer.
12. Les traits et peurs des personnages (cast.fear, cast.traits) doivent influencer leurs réactions.
13. L'apparence physique du cast (cast.appearance) doit être respectée si mentionnée dans un beat.`;

  const userPayload = {
    projectTitle: ctx.projectTitle,
    pitch: ctx.pitch,
    description: ctx.description,
    genre: ctx.primaryGenre,
    subGenres: ctx.subGenres,
    tone: ctx.tone,
    visualStyle: ctx.visualStyle,
    styleGuide: ctx.styleGuide,
    cast: ctx.cast,
    intentEntities: (ctx.intentEntities ?? []).slice(0, 8),
    knownLocations: (ctx.knownLocations ?? []).slice(0, 12),
    relationships: ctx.relationships?.slice(0, 8),
    arcs: ctx.arcs?.slice(0, 4),
    allRecentChapters: ctx.allRecentChapters?.slice(0, 3),
    bibleSummary: ctx.bibleSummary,
    themes: ctx.themes,
    continuitySnippets: ctx.continuitySnippets,
    retrievedContext: ctx.retrievedContext,
    settings: ctx.settings,
    chapterNumber: ctx.chapterNumber,
    currentTitle: ctx.chapterTitle,
    userIntent: ctx.userIntent,
    quickTag: ctx.quickTag,
    creativityControls: ctx.creativityControls ?? null,
    genreDirectorMode: genreMode,
    previousChapterSummary: ctx.previousSummary,
    previousCliffhanger: ctx.previousCliffhanger,
    seriesSynopsis: ctx.seriesSynopsis ?? null,
    recentContinuityEvents: (ctx.recentContinuityEvents ?? []).slice(0, 10),
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.75,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Produit l'outline du chapitre à partir de ce contexte JSON :\n${JSON.stringify(userPayload, null, 2)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[generateChapterOutline] OpenAI error", res.status, errText);
      return buildOutlineFallbackResult(ctx, `OpenAI HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      return buildOutlineFallbackResult(ctx, "OpenAI returned empty content");
    }

    const parsed = JSON.parse(raw) as unknown;
    const outline = outlineResultSchema.safeParse(parsed);
    if (!outline.success) {
      return buildOutlineFallbackResult(ctx, "Outline JSON validation failed");
    }

    return {
      outline: normalizeOutlineResult(ctx, outline.data),
      usedOpenAI: true,
      model,
      degradedStatus: "FULLY_OPERATIONAL",
    };
  } catch (e) {
    console.warn("[generateChapterOutline]", e);
    return buildOutlineFallbackResult(
      ctx,
      e instanceof Error ? e.message : "Unknown outline exception",
    );
  }
}
