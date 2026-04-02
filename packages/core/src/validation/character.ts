import { z } from "zod";

// ─── Sous-schémas structurés ────────────────────────────────────────────────

export const VisualProfileSchema = z.object({
  faceShape: z.string().optional(),
  skinTone: z.string().optional(),
  eyeShape: z.string().optional(),
  eyeColor: z.string().optional(),
  eyeSize: z.string().optional(),
  eyebrowStyle: z.string().optional(),
  hairStyle: z.string().optional(),
  hairLength: z.string().optional(),
  hairTexture: z.string().optional(),
  hairColor: z.string().optional(),
  noseStyle: z.string().optional(),
  mouthStyle: z.string().optional(),
  jawline: z.string().optional(),
  scars: z.string().optional(),
  tattoos: z.string().optional(),
  accessories: z.string().optional(),
  perceivedAge: z.string().optional(),
  silhouetteType: z.string().optional(),
}).default({});

export const BodyStateSchema = z.object({
  leftArmPresent: z.boolean().default(true),
  rightArmPresent: z.boolean().default(true),
  leftLegPresent: z.boolean().default(true),
  rightLegPresent: z.boolean().default(true),
  leftEyePresent: z.boolean().default(true),
  rightEyePresent: z.boolean().default(true),
  scarsCurrent: z.array(z.string()).default([]),
  burns: z.array(z.string()).default([]),
  prosthetics: z.array(z.string()).default([]),
  missingTeeth: z.boolean().default(false),
  bandages: z.array(z.string()).default([]),
  currentInjuries: z.array(z.string()).default([]),
  permanentAlterations: z.array(z.string()).default([]),
  temporaryAlterations: z.array(z.string()).default([]),
  height: z.string().optional(),
  build: z.string().optional(),
  shoulderWidth: z.string().optional(),
  hipWidth: z.string().optional(),
  chestSize: z.enum(["flat", "small", "medium", "full", "voluptuous"]).optional(),
  buttSize: z.enum(["low", "medium", "full"]).optional(),
  waistSize: z.string().optional(),
  musculature: z.string().optional(),
  silhouette: z.string().optional(),
  posture: z.string().optional(),
  perceivedAllure: z.string().optional(),
}).default({});

export const WardrobeProfileSchema = z.object({
  defaultOutfit: z.string().optional(),
  alternateOutfits: z.array(z.string()).default([]),
  combatOutfit: z.string().optional(),
  casualOutfit: z.string().optional(),
  formalOutfit: z.string().optional(),
  sleepwear: z.string().optional(),
  armor: z.string().optional(),
  accessoriesFixed: z.array(z.string()).default([]),
  colorPalette: z.array(z.string()).default([]),
  fabricStyle: z.string().optional(),
  exposureLevel: z.enum(["covered", "fitted", "revealing", "provocative_adult"]).default("covered"),
  silhouetteIntent: z.string().optional(),
}).default({});

export const SpeechProfileSchema = z.object({
  politenessLevel: z.number().min(0).max(10).default(5),
  sentenceLength: z.enum(["very_short", "short", "medium", "long"]).default("medium"),
  vocabularyStyle: z.string().optional(),
  emotionalLeak: z.number().min(0).max(10).default(5),
  sarcasmLevel: z.number().min(0).max(10).default(0),
  aggressionLevel: z.number().min(0).max(10).default(0),
  seductionStyle: z.string().optional(),
  favoriteExpressions: z.array(z.string()).default([]),
  silenceFrequency: z.number().min(0).max(10).default(3),
  innerMonologueStyle: z.string().optional(),
  threatenStyle: z.string().optional(),
  lieStyle: z.string().optional(),
}).default({});

export const ContinuityProfileSchema = z.object({
  lockedVisualTraits: z.array(z.string()).default([]),
  lockedBodyTraits: z.array(z.string()).default([]),
  lockedWardrobeTraits: z.array(z.string()).default([]),
  storyCriticalTraits: z.array(z.string()).default([]),
  forbiddenDrift: z.array(z.string()).default([]),
  continuityWarnings: z.array(z.string()).default([]),
}).default({});

export const AdultContentProfileSchema = z.object({
  isAdultCharacter: z.boolean().default(false),
  sensualPresentationAllowed: z.boolean().default(false),
  partialNudityAllowed: z.boolean().default(false),
  suggestiveOutfitsAllowed: z.boolean().default(false),
  providerRestrictions: z.array(z.string()).default([]),
  moderationFlags: z.array(z.string()).default([]),
}).default({});

// ─── Validation règles métier ────────────────────────────────────────────────

function validateAdultConsistency(data: {
  age?: number | null;
  adultVerified?: boolean;
  adultContentProfile?: { isAdultCharacter?: boolean; sensualPresentationAllowed?: boolean };
}) {
  const profile = data.adultContentProfile ?? {};
  if (profile.sensualPresentationAllowed || profile.isAdultCharacter) {
    if (!data.age || data.age < 18) {
      return "Un personnage avec contenu adulte doit avoir 18 ans ou plus.";
    }
    if (!data.adultVerified) {
      return "adultVerified doit être true pour un personnage adulte.";
    }
  }
  return null;
}

// ─── Schéma principal Create ─────────────────────────────────────────────────

export const CreateCharacterSchema = z
  .object({
    name: z.string().min(1).max(100),
    roleType: z.string().optional().nullable(),
    age: z.number().int().min(0).max(9999).optional().nullable(),
    adultVerified: z.boolean().default(false),
    pronouns: z.string().optional().nullable(),
    biography: z.string().optional().nullable(),
    objective: z.string().optional().nullable(),
    fear: z.string().optional().nullable(),
    trauma: z.string().optional().nullable(),
    personality: z.record(z.unknown()).optional(),
    traits: z.array(z.string()).optional(),
    flaws: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    appearance: z.string().optional().nullable(),
    hairColor: z.string().optional().nullable(),
    eyeColor: z.string().optional().nullable(),
    outfitDefault: z.string().optional().nullable(),
    visualProfile: VisualProfileSchema.optional(),
    bodyState: BodyStateSchema.optional(),
    wardrobeProfile: WardrobeProfileSchema.optional(),
    speechProfile: SpeechProfileSchema.optional(),
    continuityProfile: ContinuityProfileSchema.optional(),
    adultContentProfile: AdultContentProfileSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const error = validateAdultConsistency(data);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["adultContentProfile"] });
    }
  });

// ─── Schéma principal Patch ──────────────────────────────────────────────────

const PatchCharacterBaseSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    roleType: z.string().optional().nullable(),
    age: z.number().int().min(0).max(9999).optional().nullable(),
    adultVerified: z.boolean().optional(),
    pronouns: z.string().optional().nullable(),
    biography: z.string().optional().nullable(),
    objective: z.string().optional().nullable(),
    fear: z.string().optional().nullable(),
    trauma: z.string().optional().nullable(),
    personality: z.record(z.unknown()).optional(),
    traits: z.array(z.string()).optional(),
    flaws: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    appearance: z.string().optional().nullable(),
    hairColor: z.string().optional().nullable(),
    eyeColor: z.string().optional().nullable(),
    outfitDefault: z.string().optional().nullable(),
    visualProfile: VisualProfileSchema.optional(),
    bodyState: BodyStateSchema.optional(),
    wardrobeProfile: WardrobeProfileSchema.optional(),
    speechProfile: SpeechProfileSchema.optional(),
    continuityProfile: ContinuityProfileSchema.optional(),
    adultContentProfile: AdultContentProfileSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const error = validateAdultConsistency(data);
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["adultContentProfile"] });
    }
  });

export const PatchCharacterSchema = PatchCharacterBaseSchema;

export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;
export type PatchCharacterInput = z.infer<typeof PatchCharacterSchema>;
export type VisualProfile = z.infer<typeof VisualProfileSchema>;
export type BodyState = z.infer<typeof BodyStateSchema>;
export type WardrobeProfile = z.infer<typeof WardrobeProfileSchema>;
export type SpeechProfile = z.infer<typeof SpeechProfileSchema>;
export type ContinuityProfile = z.infer<typeof ContinuityProfileSchema>;
export type AdultContentProfile = z.infer<typeof AdultContentProfileSchema>;
