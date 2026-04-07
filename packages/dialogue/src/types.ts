import { z } from "zod";

export const dialogueVoiceScoreSchema = z.object({
  characterId: z.string(),
  score: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
});

export type DialogueVoiceScore = z.infer<typeof dialogueVoiceScoreSchema>;

export const characterVoiceProfileSchema = z.object({
  characterId: z.string(),
  voiceRegister: z.string().optional().nullable(),
  voiceSentenceLength: z.string().optional().nullable(),
  voiceVocabularyStyle: z.string().optional().nullable(),
  voiceEmotionalLeak: z.number().optional().nullable(),
  voiceSarcasmLevel: z.number().optional().nullable(),
  voiceAggressionLevel: z.number().optional().nullable(),
  voiceSilenceFrequency: z.number().optional().nullable(),
  voiceFavoriteExpressions: z.array(z.string()).default([]),
  voiceForbiddenExpressions: z.array(z.string()).default([]),
  voiceForbiddenPatterns: z.array(z.string()).default([]),
  voiceThreatenStyle: z.string().optional().nullable(),
  voiceLieStyle: z.string().optional().nullable(),
  voiceSeductionStyle: z.string().optional().nullable(),
  voiceInnerMonologueStyle: z.string().optional().nullable(),
  voiceExamplesCanonical: z.array(z.object({
    context: z.string(),
    line: z.string(),
    emotion: z.string().optional().nullable(),
  })).default([]),
  voiceSpeechRules: z.array(z.string()).default([]),
});

export type CharacterVoiceProfile = z.infer<typeof characterVoiceProfileSchema>;
