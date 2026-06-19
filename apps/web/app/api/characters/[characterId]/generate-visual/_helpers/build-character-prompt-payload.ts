import {
  buildCharacterPromptBundle,
  resolveCharacterIdentity,
  buildCharacterImagePrompt,
  buildCharacterSheetPrompt,
  type CharacterIdentity,
  type CharacterIdentitySource,
  type CharacterSheetPromptInput,
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
  composed: ReturnType<typeof buildCharacterImagePrompt>;
  promptBundle: ReturnType<typeof buildCharacterPromptBundle>;
  lockedPositive: string;
  lockedNegative: string;
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeSheetGender(
  value: string | null,
): CharacterSheetPromptInput["gender"] {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "male" || v === "homme" || v === "m") return "male";
  if (v === "female" || v === "femme" || v === "f") return "female";
  if (v === "non-binary" || v === "nonbinary" || v === "nb") return "non-binary";
  return null;
}

function joinClean(parts: Array<string | null>): string | null {
  const out = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return out.length > 0 ? out.join(", ") : null;
}

/**
 * Mappe l'identité résolue vers l'entrée du builder propre `buildCharacterSheetPrompt`.
 * Aucun blob JSON ni prose libre : uniquement des champs normalisés. Les champs
 * absents sont omis par le builder (pas de "null" dans le prompt).
 */
function mapIdentityToSheetInput(
  identity: CharacterIdentity,
  fullOutfit: string | null,
  projectVisualStyle: string | null,
): CharacterSheetPromptInput {
  const permanentMarkers = [identity.scars, identity.tattoos]
    .map((m) => (m ?? "").trim())
    .filter(Boolean);
  return {
    name: identity.name,
    gender: normalizeSheetGender(identity.gender),
    bodyBuild: identity.silhouette,
    faceShape: identity.faceShape,
    hair: joinClean([identity.hairColor, identity.hairStyle]),
    eyes: joinClean([identity.eyeColor, identity.eyeShape]),
    skin: identity.skinTone,
    outfit: identity.outfit ?? fullOutfit,
    permanentMarkers: permanentMarkers.length > 0 ? permanentMarkers : null,
    style: (projectVisualStyle ?? "").trim() || "seinen manga, clean sharp inking, halftone screentone shading",
  };
}

export function buildCharacterPromptPayload(
  character: OwnedCharacterLike,
  options: {
    intensityLayer: string;
    sensualityLevel: number;
  },
): CharacterPromptPayload {
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

  const identitySource: CharacterIdentitySource = {
    name: character.name,
    gender: typeof raw.gender === "string" ? raw.gender : null,
    appearance: fullAppearance,
    hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
    eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
    outfitDefault: fullOutfit,
    roleType: character.roleType,
    emotionalState: character.emotionalState,
    traits: Array.isArray(character.traits) ? (character.traits as string[]) : null,
    flaws: Array.isArray(character.flaws) ? (character.flaws as string[]) : null,
    entityKind: typeof raw.entityKind === "string" ? raw.entityKind : null,
    speciesLabel: typeof raw.speciesLabel === "string" ? raw.speciesLabel : null,
    visualProfile,
    bodyState,
    wardrobeProfile,
    continuityProfile,
    stableVisualDNA: asObjectRecord(raw.stableVisualDNA),
  };

  const identity = resolveCharacterIdentity(identitySource);

  const composed = buildCharacterImagePrompt(identity, {
    projectVisualStyle: character.project.visualStyle,
    contentIntensityLayer: options.intensityLayer,
    sensualityLevel: options.sensualityLevel,
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

  // Prompt de fiche perso PROPRE (buildCharacterSheetPrompt) : zéro blob JSON,
  // zéro prose "Continuity rules for X:", zéro duplication outfit/hair/eyes.
  // L'anti-drift (forbiddenDriftRules + composed.negative) est préservé dans
  // le NÉGATIF, là où les modèles diffusion l'exploitent réellement.
  const sheet = buildCharacterSheetPrompt(
    mapIdentityToSheetInput(identity, fullOutfit, character.project.visualStyle),
  );

  const lockedPositive = [
    sheet.positive,
    "STRICT: preserve exact character identity, face, hair, body markers, outfit and all permanent traits.",
  ]
    .filter(Boolean)
    .join(" ");

  const lockedNegative = [
    sheet.negative,
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
