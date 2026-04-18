import { z } from "zod";

/**
 * Schéma STRICT des champs acceptés par PATCH /api/characters/[characterId].
 *
 * Important : `.strict()` → tout champ inconnu provoque un 422 explicite au
 * lieu d'être dropé silencieusement par Zod (regression P0.4 du plan CTO).
 *
 * Chaque clé déclarée ici DOIT avoir un mapping Prisma côté route.
 * À chaque ajout d'un champ UI, ajoute-le ici ET dans le mapping.
 */

const voiceFavoriteSchema = z.array(z.string()).optional();
const jsonRecord = z.record(z.unknown()).optional();

export const characterVisualRefPatchSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  imageUrl: z.string().url(),
  promptSnapshot: z.string().optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const characterEditSchema = z
  .object({
    name: z.string().min(1).optional(),
    roleType: z.string().optional().nullable(),
    age: z.number().int().min(0).max(500).optional().nullable(),
    adultVerified: z.boolean().optional(),
    gender: z.enum(["male", "female"]).optional().nullable(),
    pronouns: z.string().optional().nullable(),
    biography: z.string().optional().nullable(),
    objective: z.string().optional().nullable(),
    fear: z.string().optional().nullable(),
    trauma: z.string().optional().nullable(),
    personality: z.unknown().optional(),
    traits: z.array(z.string()).optional(),
    flaws: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    appearance: z.string().optional().nullable(),
    hairColor: z.string().optional().nullable(),
    eyeColor: z.string().optional().nullable(),
    outfitDefault: z.string().optional().nullable(),
    bodyProfile: z.unknown().optional(),
    // Profils avancés (LOT 2)
    visualProfile: jsonRecord,
    bodyState: jsonRecord,
    wardrobeProfile: jsonRecord,
    speechProfile: jsonRecord,
    continuityProfile: jsonRecord,
    adultContentProfile: jsonRecord,
    status: z.string().optional(),
    emotionalState: z.string().optional().nullable(),
    canonLocked: z.boolean().optional(),

    // DialogueVoiceProfile
    voiceRegister: z.string().optional().nullable(),
    voiceSentenceLength: z.string().optional().nullable(),
    voiceVocabularyStyle: z.string().optional().nullable(),
    voiceEmotionalLeak: z.number().min(0).max(1).optional().nullable(),
    voiceSarcasmLevel: z.number().min(0).max(1).optional().nullable(),
    voiceAggressionLevel: z.number().min(0).max(1).optional().nullable(),
    voiceSilenceFrequency: z.number().min(0).max(1).optional().nullable(),
    voiceFavoriteExpressions: voiceFavoriteSchema,
    voiceForbiddenExpressions: voiceFavoriteSchema,
    voiceForbiddenPatterns: voiceFavoriteSchema,
    voiceThreatenStyle: z.string().optional().nullable(),
    voiceLieStyle: z.string().optional().nullable(),
    voiceSeductionStyle: z.string().optional().nullable(),
    voiceInnerMonologueStyle: z.string().optional().nullable(),
    // voiceExamplesCanonical : Array<{context, line, emotion}>
    voiceExamplesCanonical: z
      .array(
        z.object({
          context: z.string().optional(),
          line: z.string().optional(),
          emotion: z.string().optional(),
        }).passthrough(),
      )
      .optional(),
    voiceSpeechRules: voiceFavoriteSchema,

    // StableIdentity (DNAs)
    stableVisualDNA: jsonRecord,
    stableSpeechDNA: jsonRecord,
    stablePsycheDNA: jsonRecord,

    // ChangePolicy
    canChangeHair: z.boolean().optional(),
    canChangeOutfitFreely: z.boolean().optional(),
    canChangeVisibleScars: z.boolean().optional(),
    canChangeSpeechRegister: z.boolean().optional(),
    requiresCanonApprovalFor: z.array(z.string()).optional(),

    // visualRefs (diff géré côté route — voir P0.6)
    visualRefs: z.array(characterVisualRefPatchSchema).optional(),
  })
  .strict();

export type CharacterEditInput = z.infer<typeof characterEditSchema>;
export type CharacterVisualRefPatch = z.infer<typeof characterVisualRefPatchSchema>;
