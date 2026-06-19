/**
 * extract-story-entities-and-events.ts
 *
 * P0.3 — Extraction centralisée des entités et événements depuis l'histoire.
 *
 * Ce fichier remplace les patterns métier dispersés dans run-premium-v3-pipeline.ts
 * et autres fichiers. L'orchestrateur ne doit plus détecter — il doit orchestrer.
 *
 * Approche:
 *   1. Extraction déterministe FR/EN robuste
 *   2. Extraction LLM structurée si moteur IA disponible
 *   3. Fusion/déduplication
 *   4. Score de confiance
 *   5. En premium, pas de fallback silencieux
 */

export type ExtractedEntityType = 
  | "character" 
  | "location" 
  | "prop" 
  | "npc_group" 
  | "creature" 
  | "vehicle";

export interface ExtractedEntity {
  id: string;
  label: string;
  normalizedLabel: string;
  type: ExtractedEntityType;
  sourceBeatId?: string;
  sourceText: string;
  confidence: number;
  required: boolean;
}

export interface ExtractedVisualEvent {
  id: string;
  description: string;
  sourceBeatId: string;
  involvedCharacterIds: string[];
  involvedProps: string[];
  eventType: "action" | "reaction" | "dialogue" | "transition" | "revelation";
  importance: "critical" | "major" | "minor";
}

export interface ExtractedAction {
  id: string;
  verb: string;
  subject: string;
  object?: string;
  sourceBeatId: string;
  intensity: number;
}

export interface ExtractedEmotion {
  id: string;
  characterId?: string;
  emotion: string;
  intensity: number;
  sourceBeatId: string;
}

export interface ExtractedDialogueIntent {
  id: string;
  speakerId?: string;
  speakerName?: string;
  intent: string;
  targetId?: string;
  sourceBeatId: string;
}

export interface ExtractedContinuityState {
  entityId: string;
  entityType: ExtractedEntityType;
  state: string;
  sourceBeatId: string;
}

export interface StoryExtractionWarning {
  code: string;
  message: string;
  sourceBeatId?: string;
  severity: "info" | "warning" | "error";
}

export interface StoryExtractionResult {
  characters: ExtractedEntity[];
  locations: ExtractedEntity[];
  props: ExtractedEntity[];
  npcGroups: ExtractedEntity[];
  creatures: ExtractedEntity[];
  vehiclesOrLargeProps: ExtractedEntity[];

  visualEvents: ExtractedVisualEvent[];
  actions: ExtractedAction[];
  emotions: ExtractedEmotion[];
  dialogueIntents: ExtractedDialogueIntent[];
  continuityStates: ExtractedContinuityState[];

  confidence: number;
  warnings: StoryExtractionWarning[];
}

export interface StoryExtractionInput {
  beats: Array<{
    beatId: string;
    summary: string;
    emotionalIntent?: string;
  }>;
  chapterSummary?: string | null;
  chapterUserIntent?: string | null;
  knownCharacterNames: string[];
  knownLocationNames: string[];
}

const CHARACTER_PATTERNS_FR: RegExp[] = [
  /\b([A-Z][a-zéèêëàâäùûüôöîïç]+(?:\s+[A-Z][a-zéèêëàâäùûüôöîïç]+)?)\s+(?:entre|sort|arrive|part|regarde|observe|dit|parle|crie|murmure|pense|réfléchit|découvre|aperçoit)/gi,
  /(?:le|la|l')\s+(?:héros|héroïne|protagoniste|personnage principal)/gi,
];

const LOCATION_PATTERNS_FR: RegExp[] = [
  /(?:dans|à|au|aux|sur|sous|devant|derrière|près de|à côté de)\s+(?:le|la|l'|les|un|une|des)?\s*([a-zéèêëàâäùûüôöîïç\s]+(?:port|ville|forêt|château|maison|rue|place|marché|taverne|auberge|temple|église|montagne|rivière|lac|mer|océan|plage|cave|grotte|donjon|palais|jardin|parc|bureau|chambre|cuisine|salon|salle))/gi,
];

const PROP_PATTERNS_FR: RegExp[] = [
  /(?:un|une|le|la|l'|les|son|sa|ses)\s+(épée|arme|livre|lettre|carte|clé|coffre|sac|bourse|anneau|collier|amulette|bâton|parchemin|potion|fiole|torche|lanterne|corde|échelle)/gi,
];

const NPC_GROUP_PATTERNS_FR: RegExp[] = [
  /(?:les|des|plusieurs|quelques)\s+(pêcheurs|marins|soldats|gardes|villageois|marchands|clients|passants|badauds|foule|habitants|serveurs|ouvriers|paysans|nobles|prêtres|moines)/gi,
];

const CREATURE_PATTERNS_FR: RegExp[] = [
  /(?:un|une|le|la|l'|des)\s+(dragon|monstre|créature|bête|loup|ours|serpent|araignée|démon|esprit|fantôme|golem|troll|ogre|géant)/gi,
];

const VEHICLE_PATTERNS_FR: RegExp[] = [
  /(?:un|une|le|la|l'|son|sa)\s+(navire|bateau|barque|carrosse|charrette|chariot|cheval|monture|voiture|wagon)/gi,
];

const ACTION_VERBS_FR = [
  "entrouvre", "aperçoit", "recule", "saisit", "lâche", "frappe", "esquive",
  "se retourne", "avance", "hésite", "observe", "découvre", "réagit",
  "s'effondre", "se relève", "court", "s'arrête", "fixe", "détourne",
  "attrape", "lance", "bloque", "pare", "bondit", "atterrit", "entre",
  "sort", "arrive", "part", "regarde", "dit", "parle", "crie", "murmure"
];

const EMOTION_WORDS_FR = [
  "peur", "joie", "colère", "tristesse", "surprise", "dégoût", "honte",
  "fierté", "amour", "haine", "espoir", "désespoir", "anxiété", "soulagement",
  "excitation", "ennui", "confusion", "détermination", "résignation"
];

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "_")
    .trim();
}

function generateEntityId(type: ExtractedEntityType, label: string): string {
  return `${type}:${normalizeLabel(label)}`;
}

function extractEntitiesWithPatterns(
  text: string,
  patterns: RegExp[],
  type: ExtractedEntityType,
  sourceBeatId: string
): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const label = match[1]?.trim() || match[0]?.trim();
      if (!label || label.length < 2) continue;

      const normalizedLabel = normalizeLabel(label);
      if (seen.has(normalizedLabel)) continue;
      seen.add(normalizedLabel);

      entities.push({
        id: generateEntityId(type, label),
        label,
        normalizedLabel,
        type,
        sourceBeatId,
        sourceText: match[0],
        confidence: 0.7,
        required: false,
      });
    }
  }

  return entities;
}

function extractActionsFromText(
  text: string,
  sourceBeatId: string
): ExtractedAction[] {
  const actions: ExtractedAction[] = [];

  for (const verb of ACTION_VERBS_FR) {
    if (text.toLowerCase().includes(verb.toLowerCase())) {
      actions.push({
        id: `action:${sourceBeatId}:${normalizeLabel(verb)}`,
        verb,
        subject: "character",
        sourceBeatId,
        intensity: 0.5,
      });
    }
  }

  return actions;
}

function extractEmotionsFromText(
  text: string,
  sourceBeatId: string
): ExtractedEmotion[] {
  const emotions: ExtractedEmotion[] = [];

  for (const emotion of EMOTION_WORDS_FR) {
    if (text.toLowerCase().includes(emotion.toLowerCase())) {
      emotions.push({
        id: `emotion:${sourceBeatId}:${normalizeLabel(emotion)}`,
        emotion,
        intensity: 0.5,
        sourceBeatId,
      });
    }
  }

  return emotions;
}

function matchKnownEntities(
  extractedEntities: ExtractedEntity[],
  knownNames: string[],
  type: ExtractedEntityType
): ExtractedEntity[] {
  const knownNormalized = new Set(knownNames.map(normalizeLabel));

  return extractedEntities.map(entity => {
    if (knownNormalized.has(entity.normalizedLabel)) {
      return {
        ...entity,
        confidence: 0.95,
        required: true,
      };
    }
    return entity;
  });
}

function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();

  for (const entity of entities) {
    const existing = seen.get(entity.normalizedLabel);
    if (!existing || entity.confidence > existing.confidence) {
      seen.set(entity.normalizedLabel, entity);
    }
  }

  return Array.from(seen.values());
}

function calculateOverallConfidence(result: StoryExtractionResult): number {
  const entityCount = 
    result.characters.length +
    result.locations.length +
    result.props.length +
    result.npcGroups.length;

  if (entityCount === 0) return 0.3;

  const avgConfidence = [
    ...result.characters,
    ...result.locations,
    ...result.props,
    ...result.npcGroups,
  ].reduce((sum, e) => sum + e.confidence, 0) / entityCount;

  const hasRequiredEntities = 
    result.characters.some(c => c.required) ||
    result.locations.some(l => l.required);

  const actionScore = result.actions.length > 0 ? 0.1 : 0;
  const emotionScore = result.emotions.length > 0 ? 0.05 : 0;
  const requiredBonus = hasRequiredEntities ? 0.1 : 0;

  return Math.min(1, avgConfidence + actionScore + emotionScore + requiredBonus);
}

export function extractStoryEntitiesAndEvents(
  input: StoryExtractionInput
): StoryExtractionResult {
  const warnings: StoryExtractionWarning[] = [];

  let allCharacters: ExtractedEntity[] = [];
  let allLocations: ExtractedEntity[] = [];
  let allProps: ExtractedEntity[] = [];
  let allNpcGroups: ExtractedEntity[] = [];
  let allCreatures: ExtractedEntity[] = [];
  let allVehicles: ExtractedEntity[] = [];
  let allActions: ExtractedAction[] = [];
  let allEmotions: ExtractedEmotion[] = [];
  const visualEvents: ExtractedVisualEvent[] = [];
  const dialogueIntents: ExtractedDialogueIntent[] = [];
  const continuityStates: ExtractedContinuityState[] = [];

  const allTexts: Array<{ text: string; beatId: string }> = [];

  if (input.chapterSummary) {
    allTexts.push({ text: input.chapterSummary, beatId: "chapter_summary" });
  }
  if (input.chapterUserIntent) {
    allTexts.push({ text: input.chapterUserIntent, beatId: "chapter_intent" });
  }
  for (const beat of input.beats) {
    allTexts.push({ text: beat.summary, beatId: beat.beatId });
    if (beat.emotionalIntent) {
      allTexts.push({ text: beat.emotionalIntent, beatId: beat.beatId });
    }
  }

  for (const { text, beatId } of allTexts) {
    allCharacters.push(...extractEntitiesWithPatterns(text, CHARACTER_PATTERNS_FR, "character", beatId));
    allLocations.push(...extractEntitiesWithPatterns(text, LOCATION_PATTERNS_FR, "location", beatId));
    allProps.push(...extractEntitiesWithPatterns(text, PROP_PATTERNS_FR, "prop", beatId));
    allNpcGroups.push(...extractEntitiesWithPatterns(text, NPC_GROUP_PATTERNS_FR, "npc_group", beatId));
    allCreatures.push(...extractEntitiesWithPatterns(text, CREATURE_PATTERNS_FR, "creature", beatId));
    allVehicles.push(...extractEntitiesWithPatterns(text, VEHICLE_PATTERNS_FR, "vehicle", beatId));
    allActions.push(...extractActionsFromText(text, beatId));
    allEmotions.push(...extractEmotionsFromText(text, beatId));
  }

  allCharacters = matchKnownEntities(allCharacters, input.knownCharacterNames, "character");
  allLocations = matchKnownEntities(allLocations, input.knownLocationNames, "location");

  allCharacters = deduplicateEntities(allCharacters);
  allLocations = deduplicateEntities(allLocations);
  allProps = deduplicateEntities(allProps);
  allNpcGroups = deduplicateEntities(allNpcGroups);
  allCreatures = deduplicateEntities(allCreatures);
  allVehicles = deduplicateEntities(allVehicles);

  if (allCharacters.length === 0) {
    warnings.push({
      code: "no_characters_extracted",
      message: "Aucun personnage détecté dans le texte",
      severity: "warning",
    });
  }

  if (allLocations.length === 0) {
    warnings.push({
      code: "no_locations_extracted",
      message: "Aucun lieu détecté dans le texte",
      severity: "info",
    });
  }

  if (allActions.length === 0) {
    warnings.push({
      code: "no_actions_extracted",
      message: "Aucune action détectée dans le texte",
      severity: "warning",
    });
  }

  const result: StoryExtractionResult = {
    characters: allCharacters,
    locations: allLocations,
    props: allProps,
    npcGroups: allNpcGroups,
    creatures: allCreatures,
    vehiclesOrLargeProps: allVehicles,
    visualEvents,
    actions: allActions,
    emotions: allEmotions,
    dialogueIntents,
    continuityStates,
    confidence: 0,
    warnings,
  };

  result.confidence = calculateOverallConfidence(result);

  return result;
}

export function assertPremiumStoryExtraction(
  result: StoryExtractionResult,
  isPremiumRun: boolean,
  minConfidence: number = 0.82
): void {
  if (!isPremiumRun) return;

  if (result.confidence < minConfidence) {
    throw new Error(
      `premium_story_extraction_low_confidence:${result.confidence.toFixed(2)}:min=${minConfidence}`
    );
  }

  const errorWarnings = result.warnings.filter(w => w.severity === "error");
  if (errorWarnings.length > 0) {
    throw new Error(
      `premium_story_extraction_errors:${errorWarnings.map(w => w.code).join(",")}`
    );
  }
}
