import { z } from "zod";

const outlineResultSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(20),
  cliffhanger: z.string().min(5),
  beats: z
    .array(
      z.object({
        summary: z.string().min(10),
        emotionalTone: z.string().optional(),
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
  cast?: Array<{ name: string; roleType?: string | null; objective?: string | null; status?: string | null }>;
  bibleSummary?: string | null;
  themes?: string[];
  continuitySnippets?: string[];
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
};

function fallbackOutline(ctx: ChapterOutlineContext): ChapterOutlineResult {
  const intent = ctx.userIntent.slice(0, 400);
  const genre = (ctx.primaryGenre ?? "manga").toLowerCase();
  const quickTag = (ctx.quickTag ?? "bold").toLowerCase();
  const cast = (ctx.cast ?? []).slice(0, 3).map((item) => item.name).join(", ");
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
      { summary: `${genreBeats[0]} Intent: ${intent.slice(0, 100)}.`, emotionalTone: "tension" },
      { summary: `${genreBeats[1]} Le chapitre cherche une variation ${quickTag}.`, emotionalTone: "montée" },
      { summary: `${genreBeats[2]} Les conséquences deviennent visibles.`, emotionalTone: "pic" },
      { summary: `${genreBeats[3]} La fin du chapitre prépare une vraie relance.`, emotionalTone: "chute" },
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
  const system = `Tu es scénariste manga / webtoon pour un outil de production. Réponds uniquement en JSON valide, clés : title (optionnel), summary (string), cliffhanger (string), beats (array de { summary, emotionalTone? }). Langue : français. Les beats sont des étapes narratives courtes (pas de dialogue complet). Règles: 1) rester cohérent avec le canon, les personnages, la bible et la mémoire récente; 2) ne jamais ignorer l'intention utilisateur; 3) chaque beat doit pousser logiquement le suivant; 4) éviter les ruptures arbitraires de lieu ou d'objectif; 5) réutiliser les personnages réellement fournis.`;

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
