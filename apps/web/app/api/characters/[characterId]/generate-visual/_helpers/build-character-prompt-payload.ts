import {
  buildCharacterPromptBundle,
  composeCharacterVisualPrompt,
} from "@manga-ai-studio/ai";

import {
  serializeBodyStateForPrompt,
  serializeWardrobeProfileForPrompt,
} from "@/lib/retry/build-character-retry-hints";

interface OwnedCharacterLike {
  name: string;
  outfitDefault: string | null;
  traits: unknown;
  flaws?: unknown;
  roleType: string | null;
  emotionalState: string | null;
  biography: string | null;
  objective: string | null;
  fear: string | null;
  project: { visualStyle: string | null };
}

export interface CharacterPromptPayload {
  bodyState: Record<string, unknown>;
  wardrobeProfile: Record<string, unknown>;
  fullAppearance: string | null;
  fullOutfit: string | null;
  composed: ReturnType<typeof composeCharacterVisualPrompt>;
  promptBundle: ReturnType<typeof buildCharacterPromptBundle>;
  lockedPositive: string;
  lockedNegative: string;
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeGender(value: unknown): "male" | "female" | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "male") return "male";
  if (trimmed === "female") return "female";
  return null;
}

export function buildCharacterPromptPayload(
  character: OwnedCharacterLike,
  options: {
    intensityLayer: string;
    sensualityLevel: number;
  },
): CharacterPromptPayload {
  // P1.4 : on remplace les String(...) naïfs par des sérialiseurs dédiés
  // (aucun risque de `[object Object]` dans le prompt si un champ est un
  // array ou un objet imbriqué). Les records bruts restent exposés pour
  // les autres consommateurs (promptBundle / metadata) qui attendent un
  // Record<string, unknown>.
  const raw = character as unknown as Record<string, unknown>;
  const bodyState = asObjectRecord(raw.bodyState);
  const wardrobeProfile = asObjectRecord(raw.wardrobeProfile);
  const visualProfile = asObjectRecord(raw.visualProfile);
  const speechProfile = asObjectRecord(raw.speechProfile);
  const continuityProfile = asObjectRecord(raw.continuityProfile);

  const bodyStateLine = serializeBodyStateForPrompt(bodyState);
  const wardrobeLine = serializeWardrobeProfileForPrompt(wardrobeProfile);

  const fullAppearance =
    [
      typeof raw.appearance === "string" ? raw.appearance : null,
      bodyStateLine,
    ]
      .filter(Boolean)
      .join(", ") || null;

  const fullOutfit =
    [
      typeof character.outfitDefault === "string" ? character.outfitDefault : null,
      wardrobeLine,
    ]
      .filter(Boolean)
      .join(", ") || null;

  const composed = composeCharacterVisualPrompt({
    name: character.name,
    gender: normalizeGender(raw.gender),
    appearance: fullAppearance,
    hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
    eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
    outfitDefault: fullOutfit,
    traits: Array.isArray(character.traits) ? (character.traits as string[]) : null,
    roleType: character.roleType,
    emotionalState: character.emotionalState,
    projectVisualStyle: character.project.visualStyle,
    sensualityLevel: options.sensualityLevel,
    contentIntensityLayer: options.intensityLayer,
  });

  const promptBundle = buildCharacterPromptBundle({
    name: character.name,
    roleType: character.roleType,
    biography: character.biography,
    objective: character.objective,
    fear: character.fear,
    appearance: fullAppearance,
    hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
    eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
    outfitDefault: fullOutfit,
    visualProfile,
    bodyState,
    wardrobeProfile,
    speechProfile,
    continuityProfile,
    traits: Array.isArray(character.traits) ? (character.traits as string[]) : [],
    flaws: Array.isArray(character.flaws) ? (character.flaws as string[]) : [],
  });

  const lockedPositive = [
    composed.positive,
    promptBundle.visualPrompt,
    promptBundle.continuityPrompt,
    promptBundle.canonConstraintLine,
    "STRICT: preserve exact character identity, face, hair, body markers, outfit and all permanent traits.",
  ]
    .filter(Boolean)
    .join(", ");

  const lockedNegative = [
    composed.negative,
    ...promptBundle.forbiddenDriftRules,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    bodyState,
    wardrobeProfile,
    fullAppearance,
    fullOutfit,
    composed,
    promptBundle,
    lockedPositive,
    lockedNegative,
  };
}
