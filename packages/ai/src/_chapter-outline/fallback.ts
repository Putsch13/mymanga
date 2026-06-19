/**
 * Outline déterministe utilisé quand OpenAI est indisponible ou
 * que sa sortie est invalide.
 */
import { buildIntentNarrativeContract } from "@manga-ai-studio/core";
import type { ChapterOutlineContext, ChapterOutlineResult } from "./schema";
import { inferStructuredBeatPayload } from "./structured-beat";

// FIX-20 (MAJEUR) — Le fallback générique produisait des beats
// "confrontation"/"alliances" même pour des intentions concrètes
// (mer, temple, école…). On élargit la table de hints + on consomme
// l'`IntentNarrativeContract` pour bâtir des beats réellement liés à
// l'intention si l'IA est indisponible.
const LOCATION_HINTS: ReadonlyArray<readonly [string, string]> = [
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
  ["mer", "horizon marin"],
  ["océan", "océan ouvert sous un ciel changeant"],
  ["ocean", "océan ouvert sous un ciel changeant"],
  ["plage", "plage déserte en lumière rasante"],
  ["port", "port animé"],
  ["bateau", "pont d'un bateau en pleine mer"],
  ["navire", "pont d'un navire en pleine mer"],
  ["jungle", "jungle dense aux clairières inattendues"],
  ["temple", "temple ancien partiellement envahi par la végétation"],
  ["école", "école calme aux couloirs déserts"],
  ["ecole", "école calme aux couloirs déserts"],
  ["lycée", "lycée aux couloirs déserts"],
  ["collège", "collège aux couloirs déserts"],
  ["chambre", "chambre faiblement éclairée"],
  ["grotte", "grotte humide aux échos profonds"],
  ["désert", "étendue désertique sous une lumière dure"],
  ["desert", "étendue désertique sous une lumière dure"],
  ["montagne", "flanc de montagne escarpé"],
  ["village", "village pittoresque aux ruelles étroites"],
];

function inferPrimaryLocation(ctx: ChapterOutlineContext, genre: string): string {
  const text =
    `${ctx.userIntent} ${ctx.previousSummary ?? ""} ${ctx.previousCliffhanger ?? ""}`.toLowerCase();
  for (const [needle, value] of LOCATION_HINTS) {
    if (text.includes(needle)) return value;
  }
  if (genre.includes("cyber") || genre.includes("sci")) return "quartier financier cyberpunk";
  if (genre.includes("romance") || genre.includes("shojo")) return "café calme en soirée";
  if (genre.includes("horror") || genre.includes("horreur")) return "couloir sans fenêtres";
  return "lieu principal non spécifié";
}

function pickGenreBeats(genre: string): readonly [string, string, string, string] {
  if (genre.includes("romance") || genre.includes("shojo")) {
    return [
      "Un geste ambigu trouble l'équilibre relationnel.",
      "Une tension intime contredit les paroles échangées.",
      "Un aveu partiel change la dynamique du duo.",
      "Une interruption brutale relance le manque.",
    ];
  }
  if (genre.includes("horror") || genre.includes("horreur")) {
    return [
      "Un détail inquiétant surgit dans le décor.",
      "La peur force un choix irrationnel.",
      "Une présence cachée déforme la scène.",
      "La révélation finale ouvre une menace plus vaste.",
    ];
  }
  if (genre.includes("cyber") || genre.includes("sci")) {
    return [
      "Une anomalie technique révèle une faille du système.",
      "L'équipe comprend qu'elle a été observée.",
      "Une décision stratégique crée un coût humain.",
      "Une donnée cachée inverse la lecture du conflit.",
    ];
  }
  return [
    "Un nouvel indice déplace l'objectif immédiat.",
    "Une confrontation met les alliances sous pression.",
    "Un choix risqué accélère le conflit.",
    "Une conséquence brutale promet une suite plus dure.",
  ];
}

export function fallbackOutline(ctx: ChapterOutlineContext): ChapterOutlineResult {
  const intent = ctx.userIntent.slice(0, 400);
  const genre = (ctx.primaryGenre ?? "manga").toLowerCase();
  const quickTag = (ctx.quickTag ?? "bold").toLowerCase();
  const creativityHint = ctx.creativityControls
    ? ` Contrôles moteur: novelty ${ctx.creativityControls.noveltyLevel ?? 50}, canon ${ctx.creativityControls.worldStrictness ?? 80}, PNJ ${ctx.creativityControls.npcVariety ?? 55}, décor ${ctx.creativityControls.environmentRichness ?? 70}.`
    : "";
  const castNames = (ctx.cast ?? []).slice(0, 4).map((item) => item.name);
  const cast = castNames.join(", ");
  const primaryLocation = inferPrimaryLocation(ctx, genre);
  const previousSummary = ctx.previousSummary
    ? `Après ${ctx.previousSummary.slice(0, 140)}`
    : "Sans récapitulatif récent";
  const previousCliffhanger = ctx.previousCliffhanger
    ? `Le précédent cliffhanger était : ${ctx.previousCliffhanger.slice(0, 120)}`
    : "Aucun cliffhanger exploitable n'est remonté";
  const genreBeats = pickGenreBeats(genre);

  // FIX-20 (MAJEUR) — Quand l'intention utilisateur est suffisamment
  // riche, on dérive un IntentNarrativeContract pour ancrer le fallback
  // sur les events / personnages / lieux RÉELS de l'histoire au lieu
  // de coller des beats génériques.
  const intentContract = (() => {
    if (!ctx.userIntent || ctx.userIntent.length < 12) return null;
    try {
      return buildIntentNarrativeContract({
        chapterId: `fallback_ch${ctx.chapterNumber}`,
        userIntent: ctx.userIntent,
        knownCharacters: (ctx.cast ?? []).map((c) => ({
          id: c.name,
          name: c.name,
          roleType: c.roleType ?? null,
        })),
        knownLocationNames: (ctx.knownLocations ?? []).map((l) => l.name),
      });
    } catch {
      return null;
    }
  })();
  const intentEvents = intentContract?.requiredEvents ?? [];
  const intentLocations = intentContract?.requiredLocations ?? [];
  const intentChars = intentContract?.requiredCharacters ?? [];
  const charactersForBeats = intentChars.length > 0 ? intentChars : castNames;

  const intentDrivenBeats: Array<{
    summary: string;
    emotionalTone: string;
    pageRole: "establishing" | "escalation" | "revelation" | "cliffhanger";
    turn: string;
    emotionalDelta: number;
    characters: string[];
    location: string;
  }> | null = intentEvents.length >= 3
    ? intentEvents.slice(0, 4).map((event, idx) => {
        const role: "establishing" | "escalation" | "revelation" | "cliffhanger" =
          idx === 0
            ? "establishing"
            : idx === 1
              ? "escalation"
              : idx === 2
                ? "revelation"
                : "cliffhanger";
        const fallbackLocation =
          intentLocations[idx % Math.max(1, intentLocations.length)] ?? primaryLocation;
        return {
          summary: event.label,
          emotionalTone: idx === 0 ? "introduction" : idx === 3 ? "chute" : "montée",
          pageRole: role,
          turn: `Cet événement fait progresser l'intention : ${event.label.slice(0, 80)}.`,
          emotionalDelta: idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? -1 : -2,
          characters: charactersForBeats.slice(0, 3),
          location: fallbackLocation,
        };
      })
    : null;

  const beatTemplates: ReadonlyArray<{
    summary: string;
    emotionalTone: string;
    pageRole: "establishing" | "escalation" | "revelation" | "cliffhanger";
    turn: string;
    emotionalDelta: number;
    characters: string[];
    location?: string;
  }> = intentDrivenBeats ?? [
    {
      summary: `${genreBeats[0]} Intent: ${intent.slice(0, 200)}.`,
      emotionalTone: "tension",
      pageRole: "establishing",
      turn: "Le décor est planté, un élément attire l'attention.",
      emotionalDelta: 1,
      characters: castNames.slice(0, 2),
    },
    {
      summary: `${genreBeats[1]} Le chapitre cherche une variation ${quickTag}.`,
      emotionalTone: "montée",
      pageRole: "escalation",
      turn: "La pression monte, un choix se dessine.",
      emotionalDelta: 2,
      characters: castNames.slice(0, 3),
    },
    {
      summary: `${genreBeats[2]} Les conséquences deviennent visibles.`,
      emotionalTone: "pic",
      pageRole: "revelation",
      turn: "Une vérité éclate et change la donne.",
      emotionalDelta: -1,
      characters: castNames.slice(0, 2),
    },
    {
      summary: `${genreBeats[3]} La fin du chapitre prépare une vraie relance.`,
      emotionalTone: "chute",
      pageRole: "cliffhanger",
      turn: "Un retournement final rend la suite inévitable.",
      emotionalDelta: -2,
      characters: castNames,
    },
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
    beats: beatTemplates.map((tpl, index) => {
      const location = tpl.location ?? primaryLocation;
      return {
        summary: tpl.summary,
        emotionalTone: tpl.emotionalTone,
        pageRole: tpl.pageRole,
        turn: tpl.turn,
        emotionalDelta: tpl.emotionalDelta,
        location,
        characters: tpl.characters,
        structuredBeat: inferStructuredBeatPayload(
          ctx,
          {
            summary: tpl.summary,
            turn: tpl.turn,
            location,
            characters: tpl.characters,
            pageRole: tpl.pageRole,
          },
          index,
          beatTemplates.length,
        ),
      };
    }),
  };
}
