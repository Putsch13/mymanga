import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER CANON STATE
// ─────────────────────────────────────────────────────────────────────────────

export const worldStateSchema = z.object({
  currentDateLabel: z.string().optional().nullable(),
  activeLocations: z.array(z.string()).default([]),
  activeThreats: z.array(z.string()).default([]),
  activeMysteries: z.array(z.string()).default([]),
  globalFlags: z.record(z.union([z.boolean(), z.string(), z.number()])).default({}),
});

export type WorldState = z.infer<typeof worldStateSchema>;

export const characterStateSchema = z.object({
  characterId: z.string(),
  appearanceLocked: z.object({
    hairColor: z.string().optional().nullable(),
    eyeColor: z.string().optional().nullable(),
    silhouette: z.string().optional().nullable(),
    scars: z.array(z.string()).default([]),
    tattoos: z.array(z.string()).default([]),
    fixedAccessories: z.array(z.string()).default([]),
    forbiddenVisualDrift: z.array(z.string()).default([]),
  }).default({}),
  currentState: z.object({
    location: z.string().optional().nullable(),
    outfit: z.string().optional().nullable(),
    injuries: z.array(z.string()).default([]),
    fatigue: z.number().optional().nullable(),
    emotion: z.string().optional().nullable(),
    objective: z.string().optional().nullable(),
    possessions: z.array(z.string()).default([]),
  }).default({}),
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

export const chapterCanonStateDataSchema = z.object({
  worldState: worldStateSchema.default({}),
  characterStates: z.array(characterStateSchema).default([]),
  openThreads: z.array(openThreadSchema).default([]),
  resolvedThreads: z.array(resolvedThreadSchema).default([]),
  canonEvents: z.array(canonEventSchema).default([]),
  narrativeSummary: z.string().optional().nullable(),
  continuityWarnings: z.array(z.string()).default([]),
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
