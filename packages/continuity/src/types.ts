import { z } from "zod";
import type { SceneContinuityPayload } from "@manga-ai-studio/core";

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER CANON STATE
// ─────────────────────────────────────────────────────────────────────────────

export const worldStateSchema = z.object({
  currentDateLabel: z.string().optional().nullable(),
  activeLocations: z.array(z.string()).default([]),
  activeThreats: z.array(z.string()).default([]),
  activeMysteries: z.array(z.string()).default([]),
  factions: z.array(z.string()).default([]),
  zonesOfControl: z.record(z.array(z.string())).default({}),
  structuralProhibitions: z.array(z.string()).default([]),
  globalTone: z.string().optional().nullable(),
  techLevel: z.string().optional().nullable(),
  magicLevel: z.string().optional().nullable(),
  globalFlags: z.record(z.union([z.boolean(), z.string(), z.number()])).default({}),
});

export type WorldState = z.infer<typeof worldStateSchema>;

export const characterStateSchema = z.object({
  characterId: z.string(),
  identity: z.object({
    stableName: z.string().optional().nullable(),
    roleType: z.string().optional().nullable(),
  }).default({}),
  appearanceLocked: z.object({
    hairColor: z.string().optional().nullable(),
    eyeColor: z.string().optional().nullable(),
    silhouette: z.string().optional().nullable(),
    scars: z.array(z.string()).default([]),
    tattoos: z.array(z.string()).default([]),
    fixedAccessories: z.array(z.string()).default([]),
    forbiddenVisualDrift: z.array(z.string()).default([]),
  }).default({}),
  psychologicalCanon: z.object({
    coreTraits: z.array(z.string()).default([]),
    fears: z.array(z.string()).default([]),
    motivations: z.array(z.string()).default([]),
    speechRules: z.array(z.string()).default([]),
  }).default({}),
  physicalCanon: z.object({
    baselineOutfit: z.string().optional().nullable(),
    allowedOutfitVariations: z.array(z.string()).default([]),
    bodyMarkers: z.array(z.string()).default([]),
  }).default({}),
  currentState: z.object({
    location: z.string().optional().nullable(),
    outfit: z.string().optional().nullable(),
    injuries: z.array(z.string()).default([]),
    fatigue: z.number().optional().nullable(),
    emotion: z.string().optional().nullable(),
    objective: z.string().optional().nullable(),
    possessions: z.array(z.string()).default([]),
    knowledge: z.array(z.string()).default([]),
    obligations: z.array(z.string()).default([]),
  }).default({}),
  continuityObligations: z.array(z.string()).default([]),
  relationshipStates: z.array(z.object({
    targetCharacterId: z.string(),
    trust: z.number().optional().nullable(),
    tension: z.number().optional().nullable(),
    affection: z.number().optional().nullable(),
    fear: z.number().optional().nullable(),
    debt: z.number().optional().nullable(),
    dominance: z.number().optional().nullable(),
    note: z.string().optional().nullable(),
  })).default([]),
});

export type CharacterState = z.infer<typeof characterStateSchema>;

export const locationStateSchema = z.object({
  locationId: z.string().optional().nullable(),
  name: z.string(),
  type: z.string().optional().nullable(),
  visualAnchors: z.array(z.string()).default([]),
  state: z.string().optional().nullable(),
  occupants: z.array(z.string()).default([]),
  importantProps: z.array(z.string()).default([]),
  eventTraces: z.array(z.string()).default([]),
  damageMarkers: z.array(z.string()).default([]),
  corruptionMarkers: z.array(z.string()).default([]),
  surveillanceMarkers: z.array(z.string()).default([]),
  vegetationMarkers: z.array(z.string()).default([]),
  narrativeFunction: z.string().optional().nullable(),
});
export type LocationState = z.infer<typeof locationStateSchema>;

export const relationshipGraphEdgeSchema = z.object({
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  relationType: z.string(),
  intensity: z.number().default(50),
  note: z.string().optional().nullable(),
  currentDynamic: z.string().optional().nullable(),
});
export type RelationshipGraphEdge = z.infer<typeof relationshipGraphEdgeSchema>;

export const openThreadSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  introducedAtChapter: z.number(),
});

export type OpenThread = z.infer<typeof openThreadSchema>;

export const resolvedThreadSchema = z.object({
  id: z.string(),
  resolution: z.string(),
  resolvedAtChapter: z.number(),
});

export type ResolvedThread = z.infer<typeof resolvedThreadSchema>;

export const canonEventTypeSchema = z.enum([
  "appearance_change",
  "injury",
  "death",
  "relationship_shift",
  "reveal",
  "power_unlock",
  "location_change",
  "costume_change",
]);

export type CanonEventType = z.infer<typeof canonEventTypeSchema>;

export const canonEventSchema = z.object({
  type: canonEventTypeSchema,
  subjectId: z.string().optional().nullable(),
  description: z.string(),
  irreversible: z.boolean().default(false),
});

export type CanonEvent = z.infer<typeof canonEventSchema>;

export const eventLedgerEntrySchema = z.object({
  eventId: z.string(),
  chapterId: z.string().optional().nullable(),
  sceneId: z.string().optional().nullable(),
  chapterNumber: z.number().default(0),
  sceneNumber: z.number().optional().nullable(),
  eventType: z.string(),
  title: z.string(),
  description: z.string(),
  actorIds: z.array(z.string()).default([]),
  location: z.string().optional().nullable(),
  consequences: z.array(z.string()).default([]),
  objectsGained: z.array(z.string()).default([]),
  objectsLost: z.array(z.string()).default([]),
  injuriesApplied: z.array(z.string()).default([]),
  injuriesResolved: z.array(z.string()).default([]),
  relationshipChanges: z.array(z.string()).default([]),
  continuityFlags: z.array(z.string()).default([]),
  irreversible: z.boolean().default(false),
  importance: z.enum(["minor", "major", "critical"]).default("minor"),
});
export type EventLedgerEntry = z.infer<typeof eventLedgerEntrySchema>;

export const arcRegistryEntrySchema = z.object({
  arcId: z.string(),
  name: z.string(),
  status: z.string(),
  setup: z.array(z.string()).default([]),
  progression: z.array(z.string()).default([]),
  tension: z.number().default(0),
  openPromises: z.array(z.string()).default([]),
  paidPromises: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  currentState: z.string().optional().nullable(),
});
export type ArcRegistryEntry = z.infer<typeof arcRegistryEntrySchema>;

export const storyBibleKernelSchema = z.object({
  summary: z.string().optional().nullable(),
  themes: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  loreFacts: z.array(z.string()).default([]),
  lockedCanonFacts: z.array(z.string()).default([]),
  globalTone: z.string().optional().nullable(),
});
export type StoryBibleKernel = z.infer<typeof storyBibleKernelSchema>;

export const chapterCanonStateDataSchema = z.object({
  worldState: worldStateSchema.default({}),
  characterStates: z.array(characterStateSchema).default([]),
  openThreads: z.array(openThreadSchema).default([]),
  resolvedThreads: z.array(resolvedThreadSchema).default([]),
  canonEvents: z.array(canonEventSchema).default([]),
  narrativeSummary: z.string().optional().nullable(),
  continuityWarnings: z.array(z.string()).default([]),
  registryVersion: z.number().default(1),
});

export type ChapterCanonStateData = z.infer<typeof chapterCanonStateDataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// SCENE STATE
// ─────────────────────────────────────────────────────────────────────────────

export const characterOverrideSchema = z.object({
  characterId: z.string(),
  outfit: z.string().optional().nullable(),
  visibleInjuries: z.array(z.string()).default([]),
  emotionalState: z.string().optional().nullable(),
  props: z.array(z.string()).default([]),
  poseRestrictions: z.array(z.string()).default([]),
});

export type CharacterOverride = z.infer<typeof characterOverrideSchema>;

export const sceneStateDataSchema = z.object({
  location: z.string(),
  timeOfDay: z.string().optional().nullable(),
  mood: z.string().optional().nullable(),
  dramaticGoal: z.string().optional().nullable(),
  conflictAxis: z.string().optional().nullable(),
  presentCharacterIds: z.array(z.string()).default([]),
  characterOverrides: z.array(characterOverrideSchema).default([]),
  continuityAnchors: z.array(z.string()).default([]),
  imageReferenceIds: z.array(z.string()).default([]),
  textConstraints: z.array(z.string()).default([]),
  sceneSnapshot: z.unknown().optional(),
});

export type SceneStateData = z.infer<typeof sceneStateDataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CONTINUITY REPORT
// ─────────────────────────────────────────────────────────────────────────────

export const continuityIssueSeveritySchema = z.enum(["minor", "major", "critical"]);
export type ContinuityIssueSeverity = z.infer<typeof continuityIssueSeveritySchema>;

export const continuityIssueTypeSchema = z.enum([
  "visual_drift",
  "dialogue_drift",
  "injury_loss",
  "outfit_drift",
  "relationship_drift",
  "lore_violation",
  "timeline_violation",
  "thread_drop",
  "causality_break",
]);
export type ContinuityIssueType = z.infer<typeof continuityIssueTypeSchema>;

export const continuityIssueSchema = z.object({
  severity: continuityIssueSeveritySchema,
  type: continuityIssueTypeSchema,
  message: z.string(),
  subjectId: z.string().optional().nullable(),
  sceneId: z.string().optional().nullable(),
  autoRepairable: z.boolean().default(false),
});

export type ContinuityIssue = z.infer<typeof continuityIssueSchema>;

export const continuityReportSchema = z.object({
  score: z.number().min(0).max(1),
  issues: z.array(continuityIssueSchema).default([]),
  suggestedRepairs: z.array(z.string()).default([]),
});

export type ContinuityReport = z.infer<typeof continuityReportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CONTINUATION CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export const continuationContextSchema = z.object({
  previousSummary: z.string(),
  activeThreads: z.array(z.string()).default([]),
  lockedFacts: z.array(z.string()).default([]),
  currentCharacterGoals: z.array(z.object({
    characterId: z.string(),
    goal: z.string().optional().nullable(),
  })).default([]),
  currentCharacterEmotions: z.array(z.object({
    characterId: z.string(),
    emotion: z.string().optional().nullable(),
  })).default([]),
  unresolvedConflicts: z.array(z.string()).default([]),
  recentCanonEvents: z.array(z.string()).default([]),
  visualAnchors: z.array(z.string()).default([]),
});

export type ContinuationContext = z.infer<typeof continuationContextSchema>;

export const sceneSnapshotSchema = z.object({
  chapterId: z.string(),
  sceneId: z.string(),
  chapterNumber: z.number(),
  sceneNumber: z.number(),
  title: z.string().optional().nullable(),
  summary: z.string(),
  dramaticGoal: z.string().optional().nullable(),
  location: locationStateSchema,
  characters: z.array(characterStateSchema).default([]),
  relationshipGraph: z.array(relationshipGraphEdgeSchema).default([]),
  recentEvents: z.array(eventLedgerEntrySchema).default([]),
  activeArc: arcRegistryEntrySchema.optional().nullable(),
  structuredContinuity: z.custom<SceneContinuityPayload | null>().optional().nullable(),
  continuityAnchors: z.array(z.string()).default([]),
  textConstraints: z.array(z.string()).default([]),
  sceneBlueprintHints: z.object({
    visualAnchors: z.array(z.string()).default([]),
    worldRules: z.array(z.string()).default([]),
    narrativeConstraints: z.array(z.string()).default([]),
  }).default({}),
});
export type SceneSnapshot = z.infer<typeof sceneSnapshotSchema>;

export const chapterSnapshotSchema = z.object({
  chapterId: z.string(),
  chapterNumber: z.number(),
  title: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  storyBible: storyBibleKernelSchema,
  worldState: worldStateSchema,
  characterStates: z.array(characterStateSchema).default([]),
  locationStates: z.array(locationStateSchema).default([]),
  relationshipGraph: z.array(relationshipGraphEdgeSchema).default([]),
  eventLog: z.array(eventLedgerEntrySchema).default([]),
  arcRegistry: z.array(arcRegistryEntrySchema).default([]),
  sceneSnapshots: z.array(sceneSnapshotSchema).default([]),
  continuityWarnings: z.array(z.string()).default([]),
});
export type ChapterSnapshot = z.infer<typeof chapterSnapshotSchema>;

export const continuityKernelSchema = z.object({
  storyBible: storyBibleKernelSchema,
  worldState: worldStateSchema,
  characterStates: z.array(characterStateSchema).default([]),
  locationStates: z.array(locationStateSchema).default([]),
  relationshipGraph: z.array(relationshipGraphEdgeSchema).default([]),
  eventLog: z.array(eventLedgerEntrySchema).default([]),
  arcRegistry: z.array(arcRegistryEntrySchema).default([]),
  chapterSnapshot: chapterSnapshotSchema.optional().nullable(),
});
export type ContinuityKernel = z.infer<typeof continuityKernelSchema>;

export const continuityValidationResultSchema = z.object({
  accepted: z.boolean(),
  issues: z.array(continuityIssueSchema).default([]),
  warnings: z.array(z.string()).default([]),
  proposedEvents: z.array(eventLedgerEntrySchema).default([]),
});
export type ContinuityValidationResult = z.infer<typeof continuityValidationResultSchema>;
