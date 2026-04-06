import { z } from "zod";

const PAGE_ROLES = [
  "establishing",
  "escalation",
  "confrontation",
  "revelation",
  "aftermath",
  "cliffhanger",
] as const;

export type PageRole = (typeof PAGE_ROLES)[number];

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
        characters: z.array(z.string()).default([]),
      }),
    )
    .min(3)
    .max(10),
});

export type ChapterOutlineResult = z.infer<typeof outlineResultSchema>;

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
  previousSummary: string | null;
  previousCliffhanger: string | null;
  seriesSynopsis?: string | null;
};

function fallbackOutline(ctx: ChapterOutlineContext): ChapterOutlineResult {
  const intent = ctx.userIntent.slice(0, 400);
  const genre = (ctx.primaryGenre ?? "manga").toLowerCase();
  const quickTag = (ctx.quickTag ?? "bold").toLowerCase();
  const castNames = (ctx.cast ?? []).slice(0, 4).map((item) => item.name);
  const cast = castNames.join(", ");
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
    summary: `${previousSummary}. ${previousCliffhanger}. Le chapitre ${ctx.chapterNumber} de « ${ctx.projectTitle} » avance autour de : ${intent}. Cast prioritaire : ${cast || "à préciser"}. Axe narratif ${quickTag}.`,
    cliffhanger:
      quickTag === "shock"
        ? "La dernière case révèle une vérité qui fracture immédiatement la suite."
        : quickTag === "safe"
          ? "La situation semble tenue, mais un nouveau détail compromet l'équilibre."
          : "Au moment de souffler, un retournement rend la suite inévitable.",
    beats: [
      { summary: `${genreBeats[0]} Intent: ${intent.slice(0, 100)}.`, emotionalTone: "tension", pageRole: "establishing" as const, turn: "Le décor est planté, un élément attire l'attention.", emotionalDelta: 1, characters: castNames.slice(0, 2) },
      { summary: `${genreBeats[1]} Le chapitre cherche une variation ${quickTag}.`, emotionalTone: "montée", pageRole: "escalation" as const, turn: "La pression monte, un choix se dessine.", emotionalDelta: 2, characters: castNames.slice(0, 3) },
      { summary: `${genreBeats[2]} Les conséquences deviennent visibles.`, emotionalTone: "pic", pageRole: "revelation" as const, turn: "Une vérité éclate et change la donne.", emotionalDelta: -1, characters: castNames.slice(0, 2) },
      { summary: `${genreBeats[3]} La fin du chapitre prépare une vraie relance.`, emotionalTone: "chute", pageRole: "cliffhanger" as const, turn: "Un retournement final rend la suite inévitable.", emotionalDelta: -2, characters: castNames },
    ],
  };
}

/**
 * Produit un outline structuré (résumé, cliffhanger, beats) pour le lecteur manga / pipeline.
 * Sans `OPENAI_API_KEY`, renvoie un gabarit déterministe basé sur l’intention utilisateur.
 */
export async function generateChapterOutline(ctx: ChapterOutlineContext): Promise<{
  outline: ChapterOutlineResult;
  usedOpenAI: boolean;
  model?: string;
}> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { outline: fallbackOutline(ctx), usedOpenAI: false };
  }

  const model = process.env.OPENAI_OUTLINE_MODEL?.trim() || "gpt-4o-mini";
  const system = `Tu es scénariste manga / webtoon senior pour un outil de production professionnelle.
Réponds UNIQUEMENT en JSON valide, clés : title (optionnel), summary (string), cliffhanger (string), beats (array).
Chaque beat DOIT contenir :
  - summary (string, min 10 chars)
  - emotionalTone (string, optionnel)
  - pageRole (OBLIGATOIRE) : un parmi "establishing", "escalation", "confrontation", "revelation", "aftermath", "cliffhanger"
  - turn (OBLIGATOIRE) : le micro-retournement ou événement clé de cette page (1 phrase)
  - emotionalDelta (OBLIGATOIRE) : nombre entier de -3 à +3, variation émotionnelle par rapport au beat précédent
  - characters (OBLIGATOIRE) : tableau de noms des personnages PRESENTS dans cette page (utiliser les noms exacts du cast fourni)

Langue : français. Les beats sont des étapes narratives courtes (pas de dialogue complet).

RÈGLES DE RYTHME MANGA :
- INTERDIT : 2 beats consécutifs avec le même pageRole.
- OBLIGATOIRE : au moins 1 beat "revelation" et 1 beat "aftermath" par chapitre.
- Le premier beat doit être "establishing" ou "escalation".
- Le dernier beat doit être "cliffhanger".
- Varier les emotionalDelta : alterner montées (+1/+2) et descentes (-1/-2) pour créer un vrai rythme.
- Chaque turn doit être UNIQUE et faire progresser l'intrigue de manière irréversible.
- TOUS les personnages du cast doivent apparaître dans au moins 2 beats chacun.
- Ne pas concentrer l'action sur un seul personnage : varier les combinaisons de personnages par beat.

RÈGLES DE CONTINUITÉ STRICTE :
- Si previousCliffhanger est fourni, le PREMIER beat DOIT répondre directement à ce cliffhanger.
- Le summary global DOIT commencer par "Après que..." ou "Suite à..." en référençant le chapitre précédent.
- Chaque beat DOIT nommer explicitement les personnages du cast par leur nom (PAS de "le protagoniste", "le héros", etc.).
- seriesSynopsis résume TOUTE l'histoire : ne pas la contredire, la continuer logiquement.
- Si un personnage a un statut "blessé", "disparu" ou "mort", cela DOIT se refléter dans les beats.
- Les nouveaux personnages non listés dans le cast doivent être signalés dans le beat (ex: "Un inconnu", "Le tavernier").

RÈGLES ABSOLUES DE CONTINUITÉ :
1. Respecter scrupuleusement le canon : personnages, lieux, statuts, relations et événements passés.
2. Ne jamais ressusciter un personnage mort ni ignorer un statut "blessé" ou "disparu".
3. Chaque beat découle CAUSALEMENT du précédent : lieu → action → conséquence → réaction. Aucun saut non justifié.
4. UTILISER UNIQUEMENT les personnages du cast fourni. NE PAS inventer de nouveaux noms.
5. Le cliffhanger doit être PRÉPARÉ dans les beats précédents, pas surgir de nulle part.
6. Respecter l'intention utilisateur tout en restant cohérent avec l'arc en cours.
7. Si canonStrictness > 80, ne rien modifier qui contredise la bible ou les événements permanents.

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
      return { outline: fallbackOutline(ctx), usedOpenAI: false };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      return { outline: fallbackOutline(ctx), usedOpenAI: false };
    }

    const parsed = JSON.parse(raw) as unknown;
    const outline = outlineResultSchema.safeParse(parsed);
    if (!outline.success) {
      return { outline: fallbackOutline(ctx), usedOpenAI: false };
    }

    return { outline: outline.data, usedOpenAI: true, model };
  } catch (e) {
    console.warn("[generateChapterOutline]", e);
    return { outline: fallbackOutline(ctx), usedOpenAI: false };
  }
}
