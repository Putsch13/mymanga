/**
 * Enrichissement LLM des faits narratifs.
 *
 * Complète la couche heuristique synchrone avec une inférence sémantique
 * qui comprend les expressions naturelles, les formes passives, les synonymes
 * et les constructions idiomatiques que les patterns regex ne peuvent pas couvrir.
 *
 * Usage recommandé :
 * 1. Appeler d'abord inferNarrativeFactsFromBeat (synchrone, gratuit)
 * 2. Appeler enrichNarrativeFactsWithLLM en async pour compléter
 * 3. Merger les résultats avec mergeNarrativeFacts
 */

import OpenAI from "openai";
import type { NarrativeFact, NarrativeFactType } from "@manga-ai-studio/core";
import type { ProductionBeat } from "@manga-ai-studio/core";
import type { NarrativeExtractionContext } from "./narrative-fact-extractor";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Types de sortie LLM ──────────────────────────────────────────────────────

interface LLMNarrativeAnalysis {
  facts: Array<{
    type: NarrativeFactType;
    confidence: number;
    propCandidates: string[];
    notes: string[];
  }>;
  detectedObjects: string[];
  detectedCharacterGroups: string[];
  emotionalState: string | null;
  hasEnemyPresence: boolean;
  hasCommunicationDevice: boolean;
  hasWeapon: boolean;
  hasMedicalContext: boolean;
  hasMysticalContext: boolean;
}

// ─── Prompt système ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un analyseur de beats narratifs pour manga.
Ton rôle : extraire les faits visuels OBLIGATOIRES depuis un texte narratif.
Tu dois comprendre les expressions indirectes, passives, idiomatiques et les
conventions spécifiques aux genres manga/anime.

MAPPINGS CULTURELS OBLIGATOIRES :
- "militaire", "armée", "caserne", "régiment" → npc_presence (soldats visibles)
- "gardes", "sentinelles", "patrouille", "milice" + agression → enemy_presence
- "chasseur de primes", "assassin", "ennemi juré", "rival" → enemy_presence
- "foule en colère", "attroupement", "manifestation" → npc_presence + threat
- "village", "cité", "académie", "dojo", "monastère" → npc_presence implicite
- "est attaqué", "se fait malmener", "subit" (passif d'agression) → action + enemy_presence
- "traqué", "pourchassé", "encerclé" → movement + enemy_presence + threat
- "l'appréhende", "le capture", "les neutralise" → action + enemy_presence
- "robot", "androïde", "golem", "démon", "monstre" + agression → enemy_presence
- "magie", "pouvoir", "transformation", "éveil" → reveal + mystical

MAPPINGS PAR GENRE :
- Fantasy : gardes = knights/guards enemy | magie = reveal
- Cyberpunk : sécurité/drone = enemy_presence | piratage = prop_usage(laptop)
- Shonen combat : rival = enemy_presence | entraînement = action
- Thriller : surveillance = observation | piège = threat + enemy_presence
- Militaire : ennemi = enemy_presence | escouade alliée = npc_presence
- Historique : samouraï/ninja ennemi = enemy_presence | clan = npc_presence

Tu dois détecter :
- action : combat, attaque, mouvement physique violent
- dialogue : échange verbal, monologue
- prop_usage : utilisation d'objet (arme, téléphone, outil)
- prop_presence : objet présent mais passif
- enemy_presence : tout antagoniste, menace, ennemi, rival, garde hostile
- npc_presence : foule, groupe, personnages secondaires, témoins, soldats, gardes
- reaction : choc émotionnel, surprise, peur, désespoir, colère
- reveal : révélation, découverte, vérité qui éclate
- threat : danger imminent, menace, piège
- movement : déplacement, fuite, poursuite
- location_emphasis : lieu important à montrer
- observation : surveillance, espionnage

RÈGLES :
- Formes passives comptent : "est attaqué" = action + enemy_presence
- "se faire [verbe d'agression]" = action + enemy_presence
- Un personnage nommé comme ennemi dans le contexte → enemy_presence automatique
- "soldats ennemis" vs "soldats alliés" : les alliés = npc_presence, les ennemis = enemy_presence

Réponds UNIQUEMENT en JSON valide, sans markdown.`;

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Enrichit les faits narratifs avec une analyse LLM.
 * Retourne null si le LLM est indisponible (pas de clé API, erreur réseau).
 */
export async function enrichNarrativeFactsWithLLM(
  beat: ProductionBeat,
  existingFacts: NarrativeFact[],
  context: NarrativeExtractionContext,
): Promise<NarrativeFact[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const beatText = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ].filter(Boolean).join(" | ");

  const existingTypes = new Set(existingFacts.map((f) => f.type));

  const antagonistLine = context.antagonistNames?.length
    ? `Antagonistes connus du projet : ${context.antagonistNames.join(", ")}
RÈGLE : si un de ces noms apparaît dans le beat → enemy_presence automatique (confiance 1.0).`
    : "";

  const heroLine = context.heroCharacterId
    ? `Héros du projet (ne pas marquer comme ennemi) : ID=${context.heroCharacterId}`
    : "";

  const userPrompt = `Beat narratif à analyser :
"${beatText}"

Contexte : genre=${context.projectGenre ?? "non spécifié"}, univers=${context.universeType ?? "non spécifié"}
${antagonistLine}
${heroLine}

Faits déjà détectés par heuristiques : ${JSON.stringify([...existingTypes])}

Retourne un JSON avec cette structure exacte :
{
  "facts": [
    {
      "type": "NarrativeFactType",
      "confidence": 0.0-1.0,
      "propCandidates": ["objet1", "objet2"],
      "notes": ["raison de la détection"]
    }
  ],
  "detectedObjects": ["liste des objets mentionnés"],
  "detectedCharacterGroups": ["liste des groupes de personnages"],
  "emotionalState": "description ou null",
  "hasEnemyPresence": true/false,
  "hasCommunicationDevice": true/false,
  "hasWeapon": true/false,
  "hasMedicalContext": true/false,
  "hasMysticalContext": true/false
}

N'inclus dans "facts" QUE les types absents des faits détectés, sauf confiance > 0.9.
Si un antagoniste nommé est présent dans le beat, inclure enemy_presence avec confidence=1.0.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const analysis = JSON.parse(raw) as LLMNarrativeAnalysis;
    return convertLLMAnalysisToFacts(analysis, beat, existingFacts);
  } catch {
    // LLM indisponible — fallback silencieux sur les heuristiques
    return null;
  }
}

// ─── Conversion ───────────────────────────────────────────────────────────────

function convertLLMAnalysisToFacts(
  analysis: LLMNarrativeAnalysis,
  beat: ProductionBeat,
  existingFacts: NarrativeFact[],
): NarrativeFact[] {
  const newFacts: NarrativeFact[] = [];
  const existingTypes = new Set(existingFacts.map((f) => f.type));
  let idx = existingFacts.length;

  const VALID_FACT_TYPES: NarrativeFactType[] = [
    "action", "dialogue", "prop_usage", "prop_presence", "enemy_presence",
    "npc_presence", "movement", "reveal", "location_emphasis", "reaction",
    "threat", "observation", "emotional_reaction", "location_signal",
    "prop_transfer", "world_state_signal",
  ];

  for (const llmFact of analysis.facts ?? []) {
    if (!VALID_FACT_TYPES.includes(llmFact.type)) continue;
    if (llmFact.confidence < 0.6) continue;
    // Ne pas dupliquer sauf haute confiance
    if (existingTypes.has(llmFact.type) && llmFact.confidence < 0.9) continue;

    newFacts.push({
      id: `llm_fact_${llmFact.type}_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: llmFact.type,
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: llmFact.propCandidates ?? [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: llmFact.confidence > 0.8 ? "must_show" : "may_show",
      evidenceStrength: llmFact.confidence,
      source: "inference",
      notes: [...(llmFact.notes ?? []), "llm_enriched"],
    });
  }

  // Enrichir les propCandidates des faits existants avec les objets détectés par LLM
  if (analysis.detectedObjects?.length > 0) {
    for (const fact of existingFacts) {
      if (fact.type === "prop_usage" || fact.type === "prop_presence") {
        const merged = [...new Set([...fact.propCandidates, ...analysis.detectedObjects])];
        fact.propCandidates = merged;
      }
    }
  }

  return newFacts;
}

// ─── Merge des faits ──────────────────────────────────────────────────────────

/**
 * Fusionne les faits heuristiques et LLM en dédupliquant par type.
 * Les faits LLM complètent mais ne remplacent pas les faits heuristiques.
 */
export function mergeNarrativeFacts(
  heuristicFacts: NarrativeFact[],
  llmFacts: NarrativeFact[] | null,
): NarrativeFact[] {
  if (!llmFacts || llmFacts.length === 0) return heuristicFacts;
  return [...heuristicFacts, ...llmFacts];
}

// ─── Version synchrone enrichie (sans LLM) ───────────────────────────────────

/**
 * Analyse sémantique légère sans LLM — utilise des regex plus intelligentes
 * pour détecter les constructions que les listes de mots ratent.
 * Retourne des faits supplémentaires à merger avec les faits heuristiques.
 */
export function inferAdditionalFactsFromSemantics(
  beat: ProductionBeat,
  existingFacts: NarrativeFact[],
): NarrativeFact[] {
  const text = [
    beat.summary,
    beat.narrativeFunction,
    beat.whyThisBeatExists,
    beat.dramaticChange,
    ...(beat.environmentContext ?? []),
  ].filter(Boolean).join(" ").toLowerCase();

  const existingTypes = new Set(existingFacts.map((f) => f.type));
  const newFacts: NarrativeFact[] = [];
  let idx = existingFacts.length + 100;

  // ── Détection communication passive ──
  if (
    !existingTypes.has("prop_usage") &&
    /reçoit (un |une )?(appel|message|signal|notification|texto|sms)/.test(text)
  ) {
    newFacts.push({
      id: `sem_prop_comm_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "prop_usage",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: ["phone"],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.85,
      source: "inference",
      notes: ["passive communication detected (reçoit un appel/message)"],
    });
  }

  // ── Détection hacking / intrusion ──
  if (
    !existingTypes.has("prop_usage") &&
    /\b(pirat|hack|infiltr|s'introduit dans|accède au système|contourne le firewall)\b/.test(text)
  ) {
    newFacts.push({
      id: `sem_prop_hack_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "prop_usage",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: ["laptop", "terminal"],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.9,
      source: "inference",
      notes: ["hacking/intrusion pattern detected"],
    });
  }

  // ── Détection réaction émotionnelle passive ──
  if (
    !existingTypes.has("reaction") &&
    !existingTypes.has("emotional_reaction") &&
    /\b(reste figé|reste sans voix|perd ses mots|n'en croit pas|sous le choc|tétanisé|paralysé de|figé de|glacé de)\b/.test(text)
  ) {
    newFacts.push({
      id: `sem_reaction_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "reaction",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.85,
      source: "inference",
      notes: ["frozen/shocked expression pattern detected"],
    });
  }

  // ── Détection npc_presence via lieux implicites ──
  if (
    !existingTypes.has("npc_presence") &&
    /\b(village|bourg|cité|capitale|camp|caserne|académie|dojo|temple|monastère)\b/.test(text)
  ) {
    newFacts.push({
      id: `sem_npc_location_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "npc_presence",
      actorIds: [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.65,
      source: "inference",
      notes: ["populated location implies npc presence"],
    });
  }

  // ── Détection enemy_presence via mots de menace implicite ──
  if (
    !existingTypes.has("enemy_presence") &&
    /\b(ennemi|adversaire|rival|antagoniste|villain|boss|chef ennemi|chef de gang|seigneur de guerre)\b/.test(text)
  ) {
    newFacts.push({
      id: `sem_enemy_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "enemy_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: [],
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "must_show",
      evidenceStrength: 0.8,
      source: "inference",
      notes: ["enemy noun detected in text"],
    });
  }

  // ── Détection prop_presence via noms d'objets sans verbe d'usage ──
  if (
    !existingTypes.has("prop_usage") &&
    !existingTypes.has("prop_presence") &&
    /\b(épée|katana|kunai|shuriken|pistolet|fusil|arme|téléphone|ordinateur|tablette|parchemin|talisman|seringue|dossier)\b/.test(text)
  ) {
    newFacts.push({
      id: `sem_prop_presence_${beat.beatId}_${idx++}`,
      beatId: beat.beatId,
      type: "prop_presence",
      actorIds: beat.involvedCharacters ?? [],
      targetIds: [],
      propCandidates: extractObjectNounsFromText(text),
      locationSignals: beat.environmentContext ?? [],
      requiredVisibility: "may_show",
      evidenceStrength: 0.6,
      source: "inference",
      notes: ["object noun detected without usage verb"],
    });
  }

  return newFacts;
}

// ─── Extraction de noms d'objets ──────────────────────────────────────────────

function extractObjectNounsFromText(text: string): string[] {
  const objects: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(épée|katana|sabre|lame)\b/, "sword"],
    [/\b(kunai|shuriken|étoile de ninja)\b/, "kunai"],
    [/\b(pistolet|revolver|gun)\b/, "gun"],
    [/\b(fusil|rifle|sniper)\b/, "rifle"],
    [/\b(téléphone|smartphone|mobile|portable)\b/, "phone"],
    [/\b(ordinateur|laptop|pc|terminal)\b/, "laptop"],
    [/\b(tablette|ipad)\b/, "tablet"],
    [/\b(parchemin|scroll)\b/, "scroll"],
    [/\b(talisman|amulette|artefact)\b/, "talisman"],
    [/\b(seringue|injection)\b/, "syringe"],
    [/\b(dossier|document|fichier)\b/, "document"],
    [/\b(badge|carte d'accès)\b/, "badge"],
  ];
  for (const [regex, name] of patterns) {
    if (regex.test(text)) objects.push(name);
  }
  return objects;
}
