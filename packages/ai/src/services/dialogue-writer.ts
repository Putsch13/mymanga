import OpenAI from "openai";
import type { MangaBubble, MangaPanelText } from "@manga-ai-studio/core";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface DialogueWriterInput {
  sceneId: string;
  sceneSummary: string;
  location?: string;
  tension: number; // 0-10
  emotionalObjective: string;
  chapterGoal?: string;
  characters: Array<{
    name: string;
    roleType?: string | null;
    objective?: string | null;
    fear?: string | null;
    biography?: string | null;
    traits?: string[];
    flaws?: string[];
    speechProfile?: Record<string, unknown>;
    emotionalState?: string;
  }>;
  projectStyle?: string;
  panelCount: number;
  contentIntensityLayer?: string;
  continuityContext?: string[];
  panelBlueprints?: Array<{
    panelId: string;
    action: string;
    mood?: string;
    characters?: string[];
  }>;
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
    .map((c) => {
      const voice = c.speechProfile ? JSON.stringify(c.speechProfile).slice(0, 350) : "voix non précisée";
      return `- ${c.name} | rôle: ${c.roleType ?? "inconnu"} | état: ${c.emotionalState ?? "neutre"} | objectif: ${c.objective ?? "non précisé"} | peur: ${c.fear ?? "non précisée"} | traits: ${(c.traits ?? []).join(", ") || "aucun"} | défauts: ${(c.flaws ?? []).join(", ") || "aucun"} | bio: ${(c.biography ?? "n/a").slice(0, 200)} | voix: ${voice}`;
    })
    .join("\n");
  const continuityContext = (input.continuityContext ?? []).filter(Boolean).slice(0, 6).join("\n- ");
  const panelBlueprints = (input.panelBlueprints ?? [])
    .map(
      (panel, index) =>
        `- panel_${index + 1} | action: ${panel.action} | mood: ${panel.mood ?? "n/a"} | personnages visibles: ${(panel.characters ?? []).join(", ") || "aucun"}`,
    )
    .join("\n");

  const prompt = `Tu es un scénariste manga professionnel. Génère les dialogues pour une scène manga.

SCÈNE: ${input.sceneSummary}
LIEU: ${input.location ?? "non précisé"}
TENSION: ${input.tension}/10
OBJECTIF ÉMOTIONNEL: ${input.emotionalObjective}
OBJECTIF DU CHAPITRE: ${input.chapterGoal ?? "non précisé"}
PERSONNAGES:
${characterList}
NOMBRE DE PANELS: ${input.panelCount}
STYLE PROJET: ${input.projectStyle ?? "manga action/drame"}
CONTINUITÉ / RAG:
- ${continuityContext || "Aucun rappel utile"}
PANELS À SERVIR:
${panelBlueprints || "- panel_1 | action: progression simple"}

${BUBBLE_TYPE_GUIDE}

RÈGLES IMPÉRATIVES:
- Chaque personnage a une VOIX UNIQUE dictée par son rôle, ses traits, ses défauts, sa peur et son état émotionnel.
- Un personnage courageux parle différemment d'un lâche. Un noble ne s'exprime pas comme un voyou.
- Les répliques doivent répondre à l'action spécifique de chaque panel, pas seulement à la scène globale.
- Dans chaque panel, seuls les personnages listés dans "personnages visibles" peuvent parler. Si "aucun", narration/SFX seulement.
- Si un panel n'a qu'un seul personnage, UNE réplique max ou silence. Pas de ping-pong artificiel.
- Si un panel est contemplatif, laisse-le respirer avec silence, narration courte ou SFX léger.
- Respecte STRICTEMENT les personnages fournis et la continuité récente.
- Évite les répliques génériques ("Hmm", "...", "On y va") sauf si le silence est dramatiquement justifié.
- Varie le registre selon le genre, le ton et la tension : pas le même vocabulaire à tension 2 et tension 9.
- Maximum 2-3 bulles par panel, phrases concises mais expressives (max 15 mots par bulle), UNE intention par bulle.
- Punchlines marquantes, beaucoup de silences, sous-texte plutôt que sur-texte.
- SFX en MAJUSCULES (BANG, CRACK, WHOOSH...).

GESTION DES PNJ / PERSONNAGES NON-NOMMÉS:
- Si un personnage visible n'est PAS dans la liste "PERSONNAGES" (c'est un PNJ), donne-lui un speaker générique descriptif : "Aubergiste", "Garde", "Passant", "Vieillard", etc.
- Les PNJ parlent en 1 bulle max, registre simple, pas de profondeur psychologique.
- Si la scène implique une foule (taverne, marché, arène), des bruits de fond ou des voix lointaines sont bienvenus en narration_box.

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
      messages: [
        {
          role: "system",
          content:
            "Tu écris des dialogues manga cohérents, denses, visuels et canoniques. Tu ne dois ni inventer des personnages absents, ni casser la logique émotionnelle entre panels.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.65,
      max_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { panels?: MangaPanelText[] };
    const panels = parsed.panels ?? generateFallbackPanels(input);

    return {
      panels,
      totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dialogue-writer] sceneId=${input.sceneId} error=${msg}`);
    const panels = generateFallbackPanels(input);
    return { panels, totalBubbles: panels.reduce((acc, p) => acc + p.bubbles.length, 0) };
  }
}

function generateFallbackPanels(input: DialogueWriterInput): MangaPanelText[] {
  const panels: MangaPanelText[] = [];
  const firstCharacter = input.characters[0];
  const secondCharacter = input.characters[1];
  const fallbackLines = [
    `${firstCharacter?.objective ?? "On avance"}!`,
    secondCharacter?.fear ? `Tu sens ${secondCharacter.fear.toLowerCase()}?` : "Quelque chose cloche.",
    `${input.emotionalObjective.slice(0, 24)}${input.emotionalObjective.length > 24 ? "…" : ""}`,
    firstCharacter?.traits?.[0] ? `Reste ${firstCharacter.traits[0]}.` : "Reste concentré.",
    secondCharacter?.flaws?.[0] ? `Ton ${secondCharacter.flaws[0]} va nous tuer.` : "Ne casse pas le rythme.",
    "On n'a plus le choix.",
  ];

  for (let i = 0; i < input.panelCount; i++) {
    const isActionPanel = i % 4 === 1;
    panels.push({
      panelId: `panel_${i + 1}`,
      bubbles: isActionPanel
        ? []
        : [
            {
              id: `b_${i}_1`,
              speaker: input.characters[i % Math.max(input.characters.length, 1)]?.name,
              text: i === 0
                ? (input.emotionalObjective?.slice(0, 60) ?? input.sceneSummary?.slice(0, 60) ?? input.characters[0]?.emotionalState ?? "L'action se déroule.")
                : fallbackLines[i % fallbackLines.length] ?? "On continue.",
              bubbleType: "speech" as const,
              emotion: input.characters[i % Math.max(input.characters.length, 1)]?.emotionalState ?? "neutre",
              priority: 1,
              readingOrder: 1,
            } as MangaBubble,
          ],
      sfx: isActionPanel ? [i % 2 === 0 ? "WHOOSH" : "KRAK"] : [],
      pauseWeight: isActionPanel ? 0.8 : 0.3,
    });
  }
  return panels;
}
