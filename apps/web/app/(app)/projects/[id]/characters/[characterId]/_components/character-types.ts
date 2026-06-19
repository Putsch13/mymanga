/**
 * P5.4 — Types partagés de la page character. Extraits du monolithe
 * pour que les hooks (use-character-save, detect drift, etc.) puissent
 * les consommer sans dépendance circulaire sur la page.
 */

export type CharacterPayload = {
  id: string;
  projectId?: string;
  name: string;
  roleType: string | null;
  gender: "male" | "female" | null;
  biography: string | null;
  age: number | null;
  adultVerified: boolean;
  objective: string | null;
  fear: string | null;
  trauma: string | null;
  emotionalState: string | null;
  status: string;
  canonLocked: boolean;
  traits: string[];
  flaws: string[];
  secrets: string[];
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  outfitDefault: string | null;
  visualProfile: Record<string, unknown>;
  bodyState: Record<string, unknown>;
  wardrobeProfile: Record<string, unknown>;
  speechProfile: Record<string, unknown>;
  continuityProfile: Record<string, unknown>;
  adultContentProfile: Record<string, unknown>;
  voiceRegister: string | null;
  voiceSentenceLength: string | null;
  voiceVocabularyStyle: string | null;
  voiceEmotionalLeak: number | null;
  voiceSarcasmLevel: number | null;
  voiceAggressionLevel: number | null;
  voiceSilenceFrequency: number | null;
  voiceFavoriteExpressions: string[];
  voiceForbiddenExpressions: string[];
  voiceForbiddenPatterns: string[];
  voiceThreatenStyle: string | null;
  voiceLieStyle: string | null;
  voiceSeductionStyle: string | null;
  voiceInnerMonologueStyle: string | null;
  voiceExamplesCanonical: Array<{ context: string; line: string; emotion?: string }>;
  voiceSpeechRules: string[];
  stableVisualDNA: Record<string, unknown>;
  stableSpeechDNA: Record<string, unknown>;
  stablePsycheDNA: Record<string, unknown>;
  canChangeHair: boolean;
  canChangeOutfitFreely: boolean;
  canChangeVisibleScars: boolean;
  canChangeSpeechRegister: boolean;
  requiresCanonApprovalFor: string[];
  visualRefs: Array<{ id: string; imageUrl: string; type: string; isPrimary: boolean }>;
  relationshipsFrom: Array<{ id: string; targetCharacterId: string; relationType: string; intensity: number; note: string | null }>;
  relationshipsTo: Array<{ id: string; sourceCharacterId: string; relationType: string; intensity: number; note: string | null }>;
};

export type ProjectCharacter = { id: string; name: string };

export type InitialVisualSnapshot = {
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  outfitDefault: string | null;
  visualProfile: unknown;
  bodyState: unknown;
  wardrobeProfile: unknown;
  stableVisualDNA: unknown;
};
