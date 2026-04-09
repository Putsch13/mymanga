import OpenAI from "openai";
import type {
  MangaBubble,
  MangaPanelText,
  SceneContinuityPayload,
  StructuredBeatPayload,
  StructuredArcDelta,
  StructuredCharacterDelta,
  StructuredLocationDelta,
  StructuredSceneEvent,
} from "@manga-ai-studio/core";
import type { GenerationOperationalStatus } from "../generation-status";

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
    entityKind?: string | null;
    dialogueMode?: string | null;
    speciesLabel?: string | null;
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
  structuredBeatPayload?: StructuredBeatPayload;
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
  continuityPayload: SceneContinuityPayload;
  degradedStatus: GenerationOperationalStatus;
  usedFallback: boolean;
  fallbackReason?: string;
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

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function normalizeSceneContinuityPayload(input: unknown, fallback: SceneContinuityPayload): SceneContinuityPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const record = input as Record<string, unknown>;
  return {
    source:
      record.source === "generator_structured" || record.source === "heuristic_fallback"
        ? record.source
        : fallback.source,
    confidence:
      typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? Math.max(0, Math.min(1, record.confidence))
        : fallback.confidence,
    sceneEvents: Array.isArray(record.sceneEvents)
      ? record.sceneEvents
          .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object" && !Array.isArray(event))
          .map((event) => ({
            eventType: typeof event.eventType === "string" ? event.eventType : "scene_progression",
            title: typeof event.title === "string" ? event.title : "Événement de scène",
            description: typeof event.description === "string" ? event.description : fallback.sceneEvents[0]?.description ?? "Progression de scène",
            actorNames: normalizeStringArray(event.actorNames),
            location: typeof event.location === "string" ? event.location : null,
            consequences: normalizeStringArray(event.consequences),
            objectsGained: normalizeStringArray(event.objectsGained),
            objectsLost: normalizeStringArray(event.objectsLost),
            injuriesApplied: normalizeStringArray(event.injuriesApplied),
            injuriesResolved: normalizeStringArray(event.injuriesResolved),
            relationshipChanges: normalizeStringArray(event.relationshipChanges),
            continuityFlags: normalizeStringArray(event.continuityFlags),
            irreversible: Boolean(event.irreversible),
            importance:
              event.importance === "critical" || event.importance === "major" || event.importance === "minor"
                ? event.importance
                : "minor",
          }))
      : fallback.sceneEvents,
    characterDeltas: Array.isArray(record.characterDeltas)
      ? record.characterDeltas
          .filter((delta): delta is Record<string, unknown> => Boolean(delta) && typeof delta === "object" && !Array.isArray(delta))
          .map((delta) => ({
            characterName: typeof delta.characterName === "string" ? delta.characterName : "Personnage",
            location: typeof delta.location === "string" ? delta.location : null,
            emotionalState: typeof delta.emotionalState === "string" ? delta.emotionalState : null,
            objective: typeof delta.objective === "string" ? delta.objective : null,
            outfit: typeof delta.outfit === "string" ? delta.outfit : null,
            gainedItems: normalizeStringArray(delta.gainedItems),
            lostItems: normalizeStringArray(delta.lostItems),
            injuriesAdded: normalizeStringArray(delta.injuriesAdded),
            injuriesHealed: normalizeStringArray(delta.injuriesHealed),
            knowledgeGained: normalizeStringArray(delta.knowledgeGained),
            obligationsAdded: normalizeStringArray(delta.obligationsAdded),
            relationshipChanges: Array.isArray(delta.relationshipChanges)
              ? delta.relationshipChanges
                  .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
                  .map((item) => ({
                    targetCharacterName: typeof item.targetCharacterName === "string" ? item.targetCharacterName : "Autre",
                    shift: typeof item.shift === "string" ? item.shift : "shift",
                    intensityDelta: typeof item.intensityDelta === "number" ? item.intensityDelta : undefined,
                    note: typeof item.note === "string" ? item.note : undefined,
                  }))
              : [],
          }))
      : fallback.characterDeltas,
    locationDeltas: Array.isArray(record.locationDeltas)
      ? record.locationDeltas
          .filter((delta): delta is Record<string, unknown> => Boolean(delta) && typeof delta === "object" && !Array.isArray(delta))
          .map((delta) => ({
            locationName: typeof delta.locationName === "string" ? delta.locationName : fallback.locationDeltas[0]?.locationName ?? "Lieu",
            state: typeof delta.state === "string" ? delta.state : null,
            visualAnchorsAdded: normalizeStringArray(delta.visualAnchorsAdded),
            propsAdded: normalizeStringArray(delta.propsAdded),
            propsRemoved: normalizeStringArray(delta.propsRemoved),
            occupantsAdded: normalizeStringArray(delta.occupantsAdded),
            occupantsRemoved: normalizeStringArray(delta.occupantsRemoved),
            tracesAdded: normalizeStringArray(delta.tracesAdded),
            damageAdded: normalizeStringArray(delta.damageAdded),
            surveillanceAdded: normalizeStringArray(delta.surveillanceAdded),
            vegetationAdded: normalizeStringArray(delta.vegetationAdded),
            narrativeFunction: typeof delta.narrativeFunction === "string" ? delta.narrativeFunction : null,
          }))
      : fallback.locationDeltas,
    arcDeltas: Array.isArray(record.arcDeltas)
      ? record.arcDeltas
          .filter((delta): delta is Record<string, unknown> => Boolean(delta) && typeof delta === "object" && !Array.isArray(delta))
          .map((delta) => ({
            arcName: typeof delta.arcName === "string" ? delta.arcName : "Arc actif",
            status: typeof delta.status === "string" ? delta.status : null,
            progression: normalizeStringArray(delta.progression),
            tensionDelta: typeof delta.tensionDelta === "number" ? delta.tensionDelta : undefined,
            openPromisesAdded: normalizeStringArray(delta.openPromisesAdded),
            paidPromisesAdded: normalizeStringArray(delta.paidPromisesAdded),
            blockersAdded: normalizeStringArray(delta.blockersAdded),
            blockersResolved: normalizeStringArray(delta.blockersResolved),
            currentState: typeof delta.currentState === "string" ? delta.currentState : null,
          }))
      : fallback.arcDeltas,
  };
}

function inferSceneContinuityPayload(input: DialogueWriterInput): SceneContinuityPayload {
  const summary = `${input.sceneSummary} ${input.emotionalObjective}`.toLowerCase();
  const location = input.location ?? null;
  const mainArcName =
    input.structuredBeatPayload?.arcPromises[0]?.arcName
    ?? input.continuityContext?.find((line) => /arc/i.test(line))?.slice(0, 80)
    ?? "Arc actif";
  const sceneEvents: StructuredSceneEvent[] = [{
    eventType: "scene_progression",
    title: input.sceneSummary.slice(0, 60),
    description: input.sceneSummary,
    actorNames: input.characters.map((character) => character.name),
    location,
    consequences: [input.emotionalObjective],
    objectsGained: [],
    objectsLost: [],
    injuriesApplied: [],
    injuriesResolved: [],
    relationshipChanges: [],
    continuityFlags: ["scene_progression"],
    irreversible: false,
    importance: input.tension >= 8 ? "major" : "minor",
  }];
  const characterDeltas: StructuredCharacterDelta[] = input.characters.map((character) => ({
    characterName: character.name,
    location,
    emotionalState: character.emotionalState ?? (input.tension >= 7 ? "tension" : "focus"),
    objective: character.objective ?? input.emotionalObjective,
    outfit: null,
    gainedItems:
      /(gagne|obtient|ramasse|trouve|retrouve|récupère|recupere)/i.test(summary) ? ["objet_à_confirmer"] : [],
    lostItems:
      /(perd|laisse tomber|abandonne|sacrifie)/i.test(summary) ? ["objet_perdu_à_confirmer"] : [],
    injuriesAdded:
      /(blesse|touché|touche|entaille|fracture|saigne)/i.test(summary) ? ["blessure_à_confirmer"] : [],
    injuriesHealed:
      /(soigne|guérit|guerit|bandage|repos)/i.test(summary) ? ["blessure_résolue_à_confirmer"] : [],
    knowledgeGained:
      /(découvre|comprend|réalise|apprend|devine|révélation|revelation)/i.test(summary)
        ? [`${character.name} apprend un fait clé`]
        : [],
    obligationsAdded: [],
    relationshipChanges: [],
  }));
  const locationDeltas: StructuredLocationDelta[] = [{
    locationName: input.location ?? "Lieu de scène",
    state: /(ruine|cassé|détruit|effondré|sang|feu|fumée)/i.test(summary) ? "altéré" : null,
    visualAnchorsAdded: uniq([
      input.location,
      /(pluie|rain)/i.test(summary) ? "pluie visible" : null,
      /(laboratoire|lab)/i.test(summary) ? "signalétique technique" : null,
      /(jardin|flowers|fleur)/i.test(summary) ? "motifs floraux" : null,
    ]),
    propsAdded: [],
    propsRemoved: [],
    occupantsAdded: input.characters.map((character) => character.name),
    occupantsRemoved: [],
    tracesAdded:
      /(explosion|combat|poursuite|panique|fuite)/i.test(summary)
        ? ["trace d’événement récent"]
        : [],
    damageAdded:
      /(explosion|cassé|détruit|effondré)/i.test(summary)
        ? ["dommages visibles"]
        : [],
    surveillanceAdded:
      /(caméra|camera|garde|surveillance|alarme)/i.test(summary)
        ? ["surveillance active"]
        : [],
    vegetationAdded: [],
    narrativeFunction: input.emotionalObjective,
  }];
  const relationshipChanges = /(pardonne|trahit|avoue|confie|alliance|promet|protège|protege)/i.test(summary)
    ? input.characters.slice(0, 2)
        .map((character, index, arr) => {
          const other = arr[(index + 1) % arr.length];
          return other
            ? ({
                targetCharacterName: other.name,
                shift: input.sceneSummary.slice(0, 80),
                note: "Évolution relationnelle implicite dans la scène",
              })
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  if (relationshipChanges.length > 0) {
    characterDeltas[0] = {
      ...characterDeltas[0],
      relationshipChanges,
    };
    sceneEvents[0].relationshipChanges = relationshipChanges.map(
      (change) => `${characterDeltas[0]?.characterName} -> ${change.targetCharacterName}: ${change.shift}`,
    );
  }
  const arcDeltas: StructuredArcDelta[] = [{
    arcName: mainArcName,
    status: "open",
    progression: [input.sceneSummary.slice(0, 120)],
    tensionDelta: Math.max(1, Math.round(input.tension / 2)),
    openPromisesAdded:
      input.structuredBeatPayload?.arcPromises
        .filter((promise) => promise.stage === "setup" || promise.stage === "progression")
        .map((promise) => promise.promise)
        .slice(0, 3)
      ?? (
        /(promet|mystère|mystere|question|secret|attend|cherche encore)/i.test(summary)
          ? [input.sceneSummary.slice(0, 120)]
          : []
      ),
    paidPromisesAdded:
      input.structuredBeatPayload?.arcPromises
        .filter((promise) => promise.stage === "payoff" || promise.stage === "twist")
        .map((promise) => promise.promise)
        .slice(0, 3)
      ?? (
        /(révèle|reveal|comprend enfin|découvre enfin|obtient la réponse)/i.test(summary)
          ? [input.sceneSummary.slice(0, 120)]
          : []
      ),
    blockersAdded:
      /(bloqué|bloque|empêche|empeche|menace|impossible)/i.test(summary)
        ? [input.emotionalObjective]
        : [],
    blockersResolved:
      /(résout|resout|surmonte|franchit|réussit|reussit)/i.test(summary)
        ? [input.emotionalObjective]
        : [],
    currentState: input.emotionalObjective,
  }];
  return {
    source: "heuristic_fallback",
    confidence: 0.56,
    sceneEvents,
    characterDeltas,
    locationDeltas,
    arcDeltas,
  };
}

export async function writeDialogueForScene(
  input: DialogueWriterInput
): Promise<DialogueWriterResult> {
  const characterList = input.characters
    .map((c) => {
      const voice = c.speechProfile ? JSON.stringify(c.speechProfile).slice(0, 350) : "voix non précisée";
      return `- ${c.name} | type: ${c.entityKind ?? "human"} | dialogue: ${c.dialogueMode ?? "spoken"} | espèce: ${c.speciesLabel ?? "n/a"} | rôle: ${c.roleType ?? "inconnu"} | état: ${c.emotionalState ?? "neutre"} | objectif: ${c.objective ?? "non précisé"} | peur: ${c.fear ?? "non précisée"} | traits: ${(c.traits ?? []).join(", ") || "aucun"} | défauts: ${(c.flaws ?? []).join(", ") || "aucun"} | bio: ${(c.biography ?? "n/a").slice(0, 200)} | voix: ${voice}`;
    })
    .join("\n");
  const continuityContext = (input.continuityContext ?? []).filter(Boolean).slice(0, 6).join("\n- ");
  const structuredBeatContext = input.structuredBeatPayload
    ? JSON.stringify(input.structuredBeatPayload, null, 2)
    : "null";
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

  const buildFallbackResult = (fallbackReason: string): DialogueWriterResult => {
    console.warn(
      `[dialogue-writer] sceneId=${input.sceneId} degraded_status=DEGRADED_DIALOGUE_FALLBACK reason=${fallbackReason}`,
    );
    const panels = generateFallbackPanels(input);
    const continuityPayload = inferSceneContinuityPayload(input);
    return {
      panels,
      totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
      continuityPayload,
      degradedStatus: "DEGRADED_DIALOGUE_FALLBACK",
      usedFallback: true,
      fallbackReason,
    };
  };

  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackResult("OPENAI_API_KEY missing");
  }

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
    const parsed = JSON.parse(raw) as { panels?: MangaPanelText[]; continuityPayload?: SceneContinuityPayload };
    if (!parsed.panels?.length) {
      return buildFallbackResult("Dialogue JSON returned without panels");
    }
    const panels = parsed.panels;
    const continuityPayload = normalizeSceneContinuityPayload(
      parsed.continuityPayload,
      {
        ...inferSceneContinuityPayload(input),
        source: "generator_structured",
        confidence: 0.74,
      },
    );

    return {
      panels,
      totalBubbles: panels.reduce((acc, p) => acc + (p.bubbles?.length ?? 0), 0),
      continuityPayload,
      degradedStatus: "FULLY_OPERATIONAL",
      usedFallback: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[dialogue-writer] sceneId=${input.sceneId} error=${msg}`);
    return buildFallbackResult(msg);
  }
}

function generateFallbackPanels(input: DialogueWriterInput): MangaPanelText[] {
  const panels: MangaPanelText[] = [];
  const firstCharacter = input.characters[0];
  const secondCharacter = input.characters[1];
  const locationHint = input.location ? `dans ${input.location}` : "sur place";
  const visibleByPanel = new Map(
    (input.panelBlueprints ?? []).map((panel, index) => [
      `panel_${index + 1}`,
      (panel.characters ?? []).filter(Boolean),
    ]),
  );
  const fallbackLines = [
    `${firstCharacter?.objective ?? "On tient"} ${locationHint}.`,
    secondCharacter?.fear ? `Je sens ${secondCharacter.fear.toLowerCase()} ici.` : "Le décor annonce un problème.",
    `${input.emotionalObjective.slice(0, 32)}${input.emotionalObjective.length > 32 ? "…" : ""}`,
    firstCharacter?.traits?.[0] ? `Reste ${firstCharacter.traits[0]} maintenant.` : "Reste lucide maintenant.",
    secondCharacter?.flaws?.[0] ? `Ton ${secondCharacter.flaws[0]} nous expose.` : "Le moindre faux pas nous expose.",
    "Ce lieu réagit à nos choix.",
  ];

  for (let i = 0; i < input.panelCount; i++) {
    const isActionPanel = i % 4 === 1;
    const panelId = `panel_${i + 1}`;
    const visibleCharacters = visibleByPanel.get(panelId) ?? [];
    const speakerName =
      visibleCharacters[0]
      ?? input.characters[i % Math.max(input.characters.length, 1)]?.name
      ?? firstCharacter?.name
      ?? "Narrateur";
    const actionHint =
      input.panelBlueprints?.[i]?.action?.slice(0, 70)
      ?? input.sceneSummary.slice(0, 70)
      ?? input.emotionalObjective.slice(0, 70);
    panels.push({
      panelId,
      bubbles: isActionPanel
        ? []
        : [
            {
              id: `b_${i}_1`,
              speaker: speakerName,
              text: i === 0
                ? `${actionHint}${actionHint.length >= 70 ? "…" : ""}`
                : fallbackLines[i % fallbackLines.length] ?? "On continue.",
              bubbleType: "speech" as const,
              emotion: input.characters.find((character) => character.name === speakerName)?.emotionalState ?? "neutre",
              priority: 1,
              readingOrder: 1,
            } as MangaBubble,
          ],
      narration: isActionPanel ? [`Le lieu impose sa pression : ${locationHint}.`] : undefined,
      sfx: isActionPanel ? [i % 2 === 0 ? "WHOOSH" : "KRAK"] : [],
      pauseWeight: isActionPanel ? 0.8 : 0.3,
    });
  }
  return panels;
}
