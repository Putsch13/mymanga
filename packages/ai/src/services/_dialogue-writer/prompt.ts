/**
 * Construction du prompt LLM pour dialogue-writer.
 *
 * Le `BUBBLE_TYPE_GUIDE` est partagé avec d'autres modules qui formattent des
 * panels manga ; gardé public via le ré-export depuis le module principal.
 */
import type { DialogueWriterInput } from "./types";

export const BUBBLE_TYPE_GUIDE = `
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

export function buildDialoguePrompt(input: DialogueWriterInput): string {
  const characterList = input.characters
    .map((c) => {
      const voice = c.speechProfile
        ? JSON.stringify(c.speechProfile).slice(0, 350)
        : "voix non précisée";
      return `- ${c.name} | type: ${c.entityKind ?? "human"} | dialogue: ${c.dialogueMode ?? "spoken"} | espèce: ${c.speciesLabel ?? "n/a"} | rôle: ${c.roleType ?? "inconnu"} | état: ${c.emotionalState ?? "neutre"} | objectif: ${c.objective ?? "non précisé"} | peur: ${c.fear ?? "non précisée"} | traits: ${(c.traits ?? []).join(", ") || "aucun"} | défauts: ${(c.flaws ?? []).join(", ") || "aucun"} | bio: ${(c.biography ?? "n/a").slice(0, 200)} | voix: ${voice}`;
    })
    .join("\n");
  const continuityContext = (input.continuityContext ?? [])
    .filter(Boolean)
    .slice(0, 6)
    .join("\n- ");
  const structuredBeatContext = input.structuredBeatPayload
    ? JSON.stringify(input.structuredBeatPayload, null, 2)
    : "null";
  const panelBlueprints = (input.panelBlueprints ?? [])
    .map(
      (panel, index) =>
        `- panel_${index + 1} | action: ${panel.action} | mood: ${panel.mood ?? "n/a"} | personnages visibles: ${(panel.characters ?? []).join(", ") || "aucun"}`,
    )
    .join("\n");

  return `Tu es un scénariste manga professionnel. Génère les dialogues pour une scène manga.

SCÈNE: ${input.sceneSummary}
LIEU: ${input.location ?? "non précisé"}
TENSION: ${input.tension}/10
OBJECTIF ÉMOTIONNEL: ${input.emotionalObjective}
OBJECTIF DU CHAPITRE: ${input.chapterGoal ?? "non précisé"}
PERSONNAGES:
${characterList}
NOMBRE DE PANELS: ${input.panelCount}
STYLE PROJET: ${input.projectStyle ?? "manga action/drame"}
BEAT STRUCTURÉ:
${structuredBeatContext}
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
- Le beat structuré est une contrainte amont : les dialogues et la continuityPayload doivent le servir, jamais le contredire.
- Si le beat structuré contient des hooks de setup/payoff, ils doivent apparaître dans les répliques, les silences, la narration ou les événements.
- Évite les répliques génériques ("Hmm", "...", "On y va") sauf si le silence est dramatiquement justifié.
- Varie le registre selon le genre, le ton et la tension : pas le même vocabulaire à tension 2 et tension 9.
- Maximum 2-3 bulles par panel, phrases concises mais expressives (max 15 mots par bulle), UNE intention par bulle.
- Punchlines marquantes, beaucoup de silences, sous-texte plutôt que sur-texte.
- SFX en MAJUSCULES (BANG, CRACK, WHOOSH...).
- Si un personnage a dialogueMode = mute ou sfx_only, il ne parle pas : utilise narration, SFX ou réactions visuelles à la place.
- Si un personnage est un animal / monstre / créature, son mode d'expression doit respecter son type (grognement, sifflement, télépathie, silence, etc.).

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
  ],
  "continuityPayload": {
    "source": "generator_structured",
    "confidence": 0.9,
    "sceneEvents": [
      {
        "eventType": "scene_progression",
        "title": "Titre court",
        "description": "Ce qui se produit réellement dans la scène",
        "actorNames": ["NomPersonnage"],
        "location": "Lieu",
        "consequences": ["Conséquence active"],
        "objectsGained": [],
        "objectsLost": [],
        "injuriesApplied": [],
        "injuriesResolved": [],
        "relationshipChanges": [],
        "continuityFlags": ["scene_progression"],
        "irreversible": false,
        "importance": "major"
      }
    ],
    "characterDeltas": [
      {
        "characterName": "NomPersonnage",
        "location": "Lieu",
        "emotionalState": "état actuel",
        "objective": "objectif actuel",
        "outfit": null,
        "gainedItems": [],
        "lostItems": [],
        "injuriesAdded": [],
        "injuriesHealed": [],
        "knowledgeGained": [],
        "obligationsAdded": [],
        "relationshipChanges": []
      }
    ],
    "locationDeltas": [
      {
        "locationName": "Lieu",
        "state": null,
        "visualAnchorsAdded": [],
        "propsAdded": [],
        "propsRemoved": [],
        "occupantsAdded": ["NomPersonnage"],
        "occupantsRemoved": [],
        "tracesAdded": [],
        "damageAdded": [],
        "surveillanceAdded": [],
        "vegetationAdded": [],
        "narrativeFunction": "fonction du lieu"
      }
    ],
    "arcDeltas": [
      {
        "arcName": "Arc principal impacté",
        "status": "open",
        "progression": ["Ce qui avance réellement"],
        "tensionDelta": 2,
        "openPromisesAdded": [],
        "paidPromisesAdded": [],
        "blockersAdded": [],
        "blockersResolved": [],
        "currentState": "état actuel de l'arc"
      }
    ]
  }
}

IMPORTANT:
- La continuityPayload doit répercuter les arcPromises du beat dans arcDeltas.
- La continuityPayload doit répercuter les worldConsequences dans sceneEvents et/ou locationDeltas.
- Les setupPayoffHooks doivent être visibles comme promesses ouvertes, échos ou payoffs explicites.`;
}
