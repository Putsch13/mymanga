import OpenAI from "openai";
import type { MangaBubble, MangaPanelText } from "@manga-ai-studio/core";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DialogueWriterInput {
  sceneId: string;
  sceneSummary: string;
  location?: string;
  tension: number; // 0-10
  emotionalObjective: string;
  characters: Array<{
    name: string;
    speechProfile?: Record<string, unknown>;
    emotionalState?: string;
  }>;
  projectStyle?: string;
  panelCount: number;
  contentIntensityLayer?: string;
}

export interface DialogueWriterResult {
  panels: MangaPanelText[];
  totalBubbles: number;
}

const BUBBLE_TYPE_GUIDE = `
Bubble types:
- speech: normal dialogue
- thought: internal thought (cloud shape)
- whisper: quiet, intimate (small bubble)
- shout: loud, aggressive (jagged border)
- inner_monologue: deep internal narration
- narration_box: rectangular narrator box
- radio: mechanical/radio voice
- demonic_voice: dark, supernatural voice
- sfx: sound effect text (BANG, CRASH, etc.)
`;

export async function writeDialogueForScene(
  input: DialogueWriterInput
): Promise<DialogueWriterResult> {
  const characterList = input.characters
    .map((c) => `- ${c.name} (état: ${c.emotionalState ?? "neutre"})`)
    .join("\n");

  const prompt = `Tu es un scénariste manga professionnel. Génère les dialogues pour une scène manga.

SCÈNE: ${input.sceneSummary}
LIEU: ${input.location ?? "non précisé"}
TENSION: ${input.tension}/10
OBJECTIF ÉMOTIONNEL: ${input.emotionalObjective}
PERSONNAGES:
${characterList}
NOMBRE DE PANELS: ${input.panelCount}
STYLE PROJET: ${input.projectStyle ?? "manga action/drame"}

${BUBBLE_TYPE_GUIDE}

RÈGLES IMPÉRATIVES:
- Maximum 2-3 bulles par panel
- Phrases COURTES (max 8 mots par bulle)
- Une seule intention par bulle
- Punchlines marquantes
- Beaucoup de silences (panels sans dialogue)
- Sous-texte plutôt que sur-texte
- Pas de paragraphes longs
- SFX en MAJUSCULES (BANG, CRACK, WHOOSH...)

Retourne un JSON strict avec ce format:
{
  "panels": [
    {
      "panelId": "panel_1",
      "bubbles": [
        {
          "id": "b1",
          "speaker": "NomPersonnage",
          "text": "Texte court",
          "bubbleType": "speech",
          "emotion": "colère",
          "priority": 1,
          "readingOrder": 1
        }
      ],
      "narration": ["Texte narrateur si besoin"],
      "sfx": ["BANG"],
      "pauseWeight": 0.5
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_DIALOGUE_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { panels?: MangaPanelText[] };
    const panels = parsed.panels ?? generateFallbackPanels(input);

    return {
      panels,
      totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
    };
  } catch {
    const panels = generateFallbackPanels(input);
    return { panels, totalBubbles: panels.reduce((acc, p) => acc + p.bubbles.length, 0) };
  }
}

function generateFallbackPanels(input: DialogueWriterInput): MangaPanelText[] {
  const panels: MangaPanelText[] = [];
  for (let i = 0; i < input.panelCount; i++) {
    const isActionPanel = i % 3 === 1;
    panels.push({
      panelId: `panel_${i + 1}`,
      bubbles: isActionPanel
        ? []
        : [
            {
              id: `b_${i}_1`,
              speaker: input.characters[0]?.name,
              text: i === 0 ? "..." : "Hmm.",
              bubbleType: "speech" as const,
              emotion: "neutre",
              priority: 1,
              readingOrder: 1,
            } as MangaBubble,
          ],
      sfx: isActionPanel ? ["WHOOSH"] : [],
      pauseWeight: isActionPanel ? 0.8 : 0.3,
    });
  }
  return panels;
}
