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
  primaryGenre: string | null;
  chapterNumber: number;
  chapterTitle: string | null;
  userIntent: string;
  quickTag: string | null;
  previousSummary: string | null;
  previousCliffhanger: string | null;
};

function fallbackOutline(ctx: ChapterOutlineContext): ChapterOutlineResult {
  const intent = ctx.userIntent.slice(0, 400);
  return {
    title: ctx.chapterTitle ?? `Chapitre ${ctx.chapterNumber}`,
    summary: `Dans ce chapitre, l’intrigue avance à partir de l’intention suivante : ${intent}. Les enjeux du projet « ${ctx.projectTitle} » restent au centre du récit.`,
    cliffhanger: "Un revers inattendu bouleverse la situation — la suite révélera les conséquences.",
    beats: [
      { summary: "Mise en place : le contexte émotionnel et les personnages réagissent à la fin du chapitre précédent.", emotionalTone: "tension" },
      { summary: "Développement : confrontation ou révélation alignée sur l’intention du lecteur.", emotionalTone: "montée" },
      { summary: "Climax partiel : choix difficile ou action marquante.", emotionalTone: "pic" },
      { summary: "Résolution du beat principal tout en ouvrant une faille narrative.", emotionalTone: "chute" },
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
  const system = `Tu es scénariste manga / webtoon pour un outil de production. Réponds uniquement en JSON valide, clés : title (optionnel), summary (string), cliffhanger (string), beats (array de { summary, emotionalTone? }). Langue : français. Les beats sont des étapes narratives courtes (pas de dialogue complet).`;

  const userPayload = {
    projectTitle: ctx.projectTitle,
    pitch: ctx.pitch,
    genre: ctx.primaryGenre,
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
