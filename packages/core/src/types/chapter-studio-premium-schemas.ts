/**
 * chapter-studio-premium-schemas.ts
 *
 * Schémas Zod premium (NarrativeFact, RequiredProp, PresenceObligation,
 * ChapterObjectState, ChapterFocusBudget, PanelBlueprintPremium).
 *
 * Extrait de `chapter-studio.ts` (audit-v9, < 500 lignes/fichier).
 */

import { z } from "zod";

export const narrativeFactSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  type: z.string(),
  actorIds: z.array(z.string()).default([]),
  targetIds: z.array(z.string()).default([]),
  propCandidates: z.array(z.string()).default([]),
  locationSignals: z.array(z.string()).default([]),
  requiredVisibility: z.string().default("may_show"),
  evidenceStrength: z.number().default(0.5),
  source: z.string().default("inference"),
  notes: z.array(z.string()).optional(),
});

export const requiredPropSchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()).default([]),
  category: z.string().default("other"),
  narrativeRole: z.string().default("worldbuilding"),
  requiredForBeatIds: z.array(z.string()).default([]),
  visibilityMode: z.string().default("in_hand"),
  mustBeVisible: z.boolean().default(false),
  confidence: z.number().default(0.5),
  source: z.string().default("story_inference"),
});

export const presenceObligationSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  entityType: z.string().default("hero"),
  entityIdOrLabel: z.string(),
  requirement: z.string().default("should_show"),
  reason: z.string(),
});

export const chapterObjectStateSchema = z.object({
  objectId: z.string(),
  canonicalName: z.string().optional().default(""),
  label: z.string().optional(),
  ownerCharacterId: z.string().optional().nullable(),
  sceneId: z.string().optional().nullable(),
  state: z.string().default("carried"),
  beatId: z.string().optional().default(""),
  visibility: z.string().optional(),
});

export const chapterFocusBudgetSchema = z.object({
  totalPanels: z.number().int().min(0).default(0),
  heroCenterRatio: z.number().min(0).max(1).default(1),
  heroFocusPanels: z.number().int().min(0).default(0),
  enemyFocusPanels: z.number().int().min(0).default(0),
  environmentPanels: z.number().int().min(0).default(0),
  propInsertPanels: z.number().int().min(0).default(0),
  reactionPanels: z.number().int().min(0).default(0),
  speakerPanels: z.number().int().min(0).default(0),
  groupPanels: z.number().int().min(0).default(0),
  cutawayPanels: z.number().int().min(0).default(0),
  cutawayCount: z.number().int().min(0).default(0),
  cutawayRatio: z.number().min(0).max(1).default(0),
  npcPanels: z.number().int().min(0).default(0),
  focusDistribution: z.record(z.string(), z.number()).default({}),
  shotDistribution: z.record(z.string(), z.number()).default({}),
  violations: z
    .array(
      z.object({
        type: z.string(),
        message: z.string(),
        severity: z.enum(["warning", "blocking"]),
      }),
    )
    .default([]),
});

export const panelBlueprintPremiumSchema = z.object({
  panelId: z.string(),
  beatId: z.string(),
  panelIndex: z.number().int().min(0).optional(),
  pageNumber: z.number().int().optional().nullable(),
  panelNumber: z.number().int().min(1).default(1),
  purpose: z.string(),
  shotType: z.string(),
  cameraAngle: z.string(),
  subjectFocus: z.string(),
  secondaryFocus: z.string().optional().nullable(),
  requiredCharacters: z.array(z.string()).optional(),
  requiredCharacterIds: z.array(z.string()).optional(),
  mustShowCharacterIds: z.array(z.string()).optional(),
  mayShowCharacterIds: z.array(z.string()).optional(),
  mustShowEnemy: z.boolean().default(false),
  requiredNpcCount: z.number().int().min(0).default(0),
  requiredProps: z.array(requiredPropSchema).default([]),
  optionalProps: z.array(requiredPropSchema).optional(),
  presenceObligations: z.array(presenceObligationSchema).optional(),
  requiredLocationSignals: z.array(z.string()).default([]),
  speakerAnchorCharacterId: z.string().optional().nullable(),
  speakerAnchorCharacterName: z.string().optional().nullable(),
  dialogueCarrier: z.enum(["speaker_visible", "offscreen_allowed", "narration"]).optional().nullable(),
  dialogueLinesAnchored: z.number().int().min(0).optional(),
  cutawayType: z.string().default("none"),
  heroCenterAllowed: z.boolean().default(true),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  contractualCritical: z.boolean().optional(),
  notes: z.array(z.string()).optional(),
  provenance: z
    .object({
      origin: z.enum([
        "canonical_projection",
        "author_raw_merged",
        "rhythm_padding_clone",
        "rhythm_padding_canonical_fallback",
        "retrofit_inferred",
      ]),
      canonicalPanelId: z.string(),
      canonicalBeatId: z.string(),
      narrativeMemoryDigest: z.string().optional(),
      appliedRules: z.array(z.string()).default([]),
    })
    .optional(),
});
