/**
 * normalize-outline.ts — Normalisation unique des outlines.
 *
 * RÈGLE ABSOLUE: Aucune donnée IA/DB ne doit être utilisée directement sans passer par ce module.
 * Ce module transforme n'importe quel outline (IA, DB, ancien format) en structure stable.
 *
 * Il garantit:
 * - Tous les tableaux sont toujours des tableaux (jamais undefined/null)
 * - Les valeurs par défaut sont injectées
 * - Les ambiguïtés de noms de champs sont résolues
 * - La structure est validée
 */

import { z } from "zod";

export interface NormalizedBeat {
  beatId: string;
  beatIndex: number;
  summary: string;
  narrativeFunction: string;
  whyThisBeatExists: string;
  dramaticChange: string;
  involvedCharacters: string[];
  entities: string[];
  props: string[];
  locations: string[];
  environmentContext: string[];
  dialogueIntent: string | null;
  hasDialogue: boolean;
  hasAction: boolean;
  hasCombat: boolean;
  hasEmotion: boolean;
  hasTension: boolean;
  estimatedPanels: number;
  criticality: "low" | "medium" | "high" | "critical";
  sceneContext: string | null;
  opponent: string | null;
  /** Refs personnage non résolues vers le catalogue projet (estimate / studio) */
  unresolvedCharacterRefs: string[];
}

export interface NormalizedOutline {
  source: string;
  chapterGoal: string;
  cliffhanger: string;
  beats: NormalizedBeat[];
  totalEstimatedPanels: number;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((s) => s.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function detectDialogue(beat: Record<string, unknown>): boolean {
  const text = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)} ${asString(beat.dialogueIntent)}`.toLowerCase();
  return /dialogue|parle|dit|speak|talk|conversation|répond|demande|crie|murmure/.test(text);
}

function detectAction(beat: Record<string, unknown>): boolean {
  const text = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)}`.toLowerCase();
  return /action|mouvement|move|run|jump|attack|defend|dodge|esquive|frappe|lance/.test(text);
}

function detectCombat(beat: Record<string, unknown>): boolean {
  const text = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)}`.toLowerCase();
  return /combat|fight|battle|attaque|attack|défend|defend|frappe|hit|sword|épée|magie|magic|sort|spell/.test(text);
}

function detectEmotion(beat: Record<string, unknown>): boolean {
  const text = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)}`.toLowerCase();
  return /émotion|emotion|pleure|cries|cry|rit|laugh|peur|fear|colère|anger|joie|joy|triste|sad|choqué|shocked|surpris|surprised|despair|désespoir/.test(text);
}

function detectTension(beat: Record<string, unknown>): boolean {
  const text = `${asString(beat.summary)} ${asString(beat.whyThisBeatExists)} ${asString(beat.dramaticChange)}`.toLowerCase();
  return /tension|suspense|danger|menace|threat|mystère|mystery|révélation|reveal|secret|conflit|conflict/.test(text);
}

function normalizeCriticality(value: unknown): "low" | "medium" | "high" | "critical" {
  const str = asString(value).toLowerCase();
  if (str === "critical" || str === "critique") return "critical";
  if (str === "high" || str === "haute" || str === "élevée") return "high";
  if (str === "low" || str === "basse" || str === "faible") return "low";
  return "medium";
}

function extractCharacters(beat: Record<string, unknown>): string[] {
  const involvedCharacters = asStringArray(beat.involvedCharacters);
  if (involvedCharacters.length > 0) return involvedCharacters;

  const characters = asStringArray(beat.characters);
  if (characters.length > 0) return characters;

  const characterIds = asStringArray(beat.characterIds);
  if (characterIds.length > 0) return characterIds;

  const actorIds = asStringArray(beat.actorIds);
  if (actorIds.length > 0) return actorIds;

  return [];
}

function extractEntities(beat: Record<string, unknown>): string[] {
  const entities = asStringArray(beat.entities);
  if (entities.length > 0) return entities;

  const requiredEntities = asStringArray(beat.requiredEntities);
  if (requiredEntities.length > 0) return requiredEntities;

  const entityIds = asStringArray(beat.entityIds);
  if (entityIds.length > 0) return entityIds;

  return [];
}

function extractProps(beat: Record<string, unknown>): string[] {
  const props = asStringArray(beat.props);
  const fromObjects = asStringArray(beat.objects);
  const mergedBase = [...new Set([...props, ...fromObjects])];

  const requiredProps = beat.requiredProps;
  if (Array.isArray(requiredProps)) {
    const fromRequired = requiredProps
      .map((p) => (typeof p === "object" && p !== null ? asString((p as Record<string, unknown>).canonicalName) : asString(p)))
      .filter(Boolean);
    const merged = [...new Set([...mergedBase, ...fromRequired])];
    return merged;
  }

  return mergedBase;
}

function extractLocations(beat: Record<string, unknown>): string[] {
  const locations = asStringArray(beat.locations);
  if (locations.length > 0) return locations;

  const location = asString(beat.location);
  if (location) return [location];

  const locationSignals = asStringArray(beat.locationSignals);
  if (locationSignals.length > 0) return locationSignals;

  const environmentContext = asStringArray(beat.environmentContext);
  if (environmentContext.length > 0) return environmentContext;

  return [];
}

function normalizeBeat(rawBeat: unknown, index: number): NormalizedBeat {
  const beat = (typeof rawBeat === "object" && rawBeat !== null ? rawBeat : {}) as Record<string, unknown>;

  const beatId = asString(beat.beatId) || asString(beat.id) || `beat_${index + 1}`;
  const summary = asString(beat.summary) || asString(beat.description) || asString(beat.content) || "";
  const narrativeFunction = asString(beat.narrativeFunction) || asString(beat.pageRole) || asString(beat.function) || "progression";
  const whyThisBeatExists = asString(beat.whyThisBeatExists) || asString(beat.reason) || summary;
  const dramaticChange = asString(beat.dramaticChange) || asString(beat.turn) || asString(beat.change) || "";

  const involvedCharacters = extractCharacters(beat);
  const unresolvedCharacterRefs = asStringArray(beat.unresolvedCharacterRefs);
  const entities = extractEntities(beat);
  const props = extractProps(beat);
  const locations = extractLocations(beat);
  const environmentContext = asStringArray(beat.environmentContext).concat(locations);

  const dialogueIntent = asString(beat.dialogueIntent) || null;
  const sceneContext = asString(beat.sceneContext) || null;
  const opponent = asString(beat.opponent) || asString(beat.enemy) || asString(beat.antagonist) || null;

  const estimatedPanels = asNumber(beat.estimatedPanels, 4);
  const criticality = normalizeCriticality(beat.criticality);

  return {
    beatId,
    beatIndex: index,
    summary,
    narrativeFunction,
    whyThisBeatExists,
    dramaticChange,
    involvedCharacters,
    unresolvedCharacterRefs,
    entities,
    props,
    locations,
    environmentContext: [...new Set(environmentContext)],
    dialogueIntent,
    hasDialogue: detectDialogue(beat) || dialogueIntent !== null,
    hasAction: detectAction(beat),
    hasCombat: detectCombat(beat),
    hasEmotion: detectEmotion(beat),
    hasTension: detectTension(beat),
    estimatedPanels,
    criticality,
    sceneContext,
    opponent,
  };
}

export function normalizeOutline(rawOutline: unknown): NormalizedOutline {
  const outline = (typeof rawOutline === "object" && rawOutline !== null ? rawOutline : {}) as Record<string, unknown>;

  const source = asString(outline.source) || "unknown";
  const chapterGoal = asString(outline.chapterGoal) || asString(outline.summary) || asString(outline.goal) || "";
  const cliffhanger = asString(outline.cliffhanger) || "";

  const rawBeats = Array.isArray(outline.beats) ? outline.beats : [];
  const beats = rawBeats.map((beat, index) => normalizeBeat(beat, index));

  const totalEstimatedPanels = beats.reduce((sum, b) => sum + b.estimatedPanels, 0);

  return {
    source,
    chapterGoal,
    cliffhanger,
    beats,
    totalEstimatedPanels,
  };
}

export const normalizedBeatSchema = z.object({
  beatId: z.string(),
  beatIndex: z.number().int().min(0),
  summary: z.string(),
  narrativeFunction: z.string(),
  whyThisBeatExists: z.string(),
  dramaticChange: z.string(),
  involvedCharacters: z.array(z.string()),
  entities: z.array(z.string()),
  props: z.array(z.string()),
  locations: z.array(z.string()),
  environmentContext: z.array(z.string()),
  dialogueIntent: z.string().nullable(),
  hasDialogue: z.boolean(),
  hasAction: z.boolean(),
  hasCombat: z.boolean(),
  hasEmotion: z.boolean(),
  hasTension: z.boolean(),
  estimatedPanels: z.number().int().min(1),
  criticality: z.enum(["low", "medium", "high", "critical"]),
  sceneContext: z.string().nullable(),
  opponent: z.string().nullable(),
  unresolvedCharacterRefs: z.array(z.string()).default([]),
});

export const normalizedOutlineSchema = z.object({
  source: z.string(),
  chapterGoal: z.string(),
  cliffhanger: z.string(),
  beats: z.array(normalizedBeatSchema),
  totalEstimatedPanels: z.number().int().min(0),
});

export function validateNormalizedOutline(outline: unknown): NormalizedOutline {
  return normalizedOutlineSchema.parse(outline);
}

export function safeNormalizeOutline(rawOutline: unknown): NormalizedOutline {
  if (rawOutline === undefined || rawOutline === null) {
    return {
      source: "fallback",
      chapterGoal: "",
      cliffhanger: "",
      beats: [],
      totalEstimatedPanels: 0,
    };
  }
  try {
    const normalized = normalizeOutline(rawOutline);
    return validateNormalizedOutline(normalized);
  } catch (error) {
    console.warn("[normalize-outline] Validation failed, returning minimal structure:", error);
    return {
      source: "fallback",
      chapterGoal: "",
      cliffhanger: "",
      beats: [],
      totalEstimatedPanels: 0,
    };
  }
}
