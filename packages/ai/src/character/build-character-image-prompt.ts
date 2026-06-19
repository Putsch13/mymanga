/**
 * Builder de prompt image unifié.
 *
 * Consomme `CharacterIdentity` (issu de `resolveCharacterIdentity`) pour
 * produire un prompt positive/negative prêt à envoyer à FAL / BFL.
 *
 * Remplace la logique dupliquée entre `character-visual-composer.ts` et
 * `character-prompt-builder.ts` pour la partie "image".
 */

import type { CharacterIdentity } from "./resolve-character-identity";

/* ── Constants ─────────────────────────────────────────────────────────── */

const BASE_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, " +
  "watermark, text overlay, low quality, multiple characters, crowd, background characters, " +
  "poorly drawn face, missing fingers, extra fingers, distorted proportions";

const ROLE_POSE_MAP: Record<string, string> = {
  protagonist: "heroic stance, confident posture, dynamic pose",
  antagonist: "menacing stance, dark aura, powerful presence",
  mentor: "wise expression, calm authoritative posture",
  ally: "friendly open posture, warm expression",
  rival: "competitive stance, intense gaze",
  love_interest: "gentle expression, soft romantic lighting",
  comic_relief: "playful expression, exaggerated gesture",
  mysterious: "enigmatic expression, partially shadowed face",
};

const CREATURE_STYLE_MAP: Record<string, string> = {
  monster: "terrifying monster creature, detailed anatomy, manga monster design, intimidating presence, fearsome silhouette",
  creature: "fantastical creature, unique anatomy, manga creature design, detailed features, otherworldly",
  animal: "animal companion, realistic animal manga style, detailed fur/scales/feathers, expressive eyes",
  spirit: "ethereal spirit being, translucent form, ghostly manga style, spiritual energy, glowing aura",
  construct: "mechanical construct, robot manga design, mechanical joints visible, metallic surface, engineered precision",
  dragon: "massive dragon, detailed scales, powerful wings, manga dragon design, majestic presence, ancient power",
  demon: "dark demon creature, menacing horns, dark manga design, supernatural menace, intimidating form",
  beast: "powerful beast creature, wild anatomy, manga beast design, raw ferocity",
};

const INTENSITY_STYLE: Record<string, string> = {
  GENERAL_SAFE: "fully clothed, appropriate attire",
  TEEN: "fully clothed, stylish outfit",
  MATURE_DRAMA: "mature character design, expressive",
  MATURE_VISUAL: "mature character design, detailed",
  ADULT_EXPLICIT: "adult character design, detailed, mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
};

const EMO_MAP: Record<string, string> = {
  determined: "determined expression, focused gaze",
  sad: "melancholic expression, downcast eyes",
  angry: "fierce expression, intense eyes",
  happy: "warm smile, bright eyes",
  fearful: "wide eyes, tense expression",
  mysterious: "enigmatic half-smile, piercing gaze",
  confident: "confident smirk, relaxed posture",
};

/* ── Public types ──────────────────────────────────────────────────────── */

export interface CharacterImagePromptOptions {
  projectVisualStyle?: string | null;
  contentIntensityLayer?: string;
  sensualityLevel?: number;
}

export interface CharacterImagePrompt {
  positive: string;
  negative: string;
  imageSize: "portrait_3_4" | "square_hd";
}

/* ── Builder ───────────────────────────────────────────────────────────── */

function isNonHuman(entityKind: string | null): boolean {
  if (!entityKind) return false;
  return !["human", "named_npc", ""].includes(entityKind.toLowerCase());
}

function buildCreaturePrompt(
  identity: CharacterIdentity,
  style: string,
): CharacterImagePrompt {
  const baseStyle = CREATURE_STYLE_MAP[identity.entityKind?.toLowerCase() ?? ""] ?? CREATURE_STYLE_MAP.creature;
  const species = identity.speciesLabel ? `${identity.speciesLabel}, ` : "";

  const positive = [
    style,
    "manga creature reference sheet, full body, multiple angles",
    identity.name,
    `${species}${baseStyle}`,
    identity.appearanceText,
    identity.hairColor ? `${identity.hairColor} coloring` : null,
    identity.eyeColor ? `${identity.eyeColor} eyes` : null,
    identity.outfit,
    identity.traits.length > 0 ? `characteristics: ${identity.traits.slice(0, 3).join(", ")}` : null,
    "white background, reference sheet style, clean linework, high detail",
    "CRITICAL: all unique physical features, mutations, special anatomy must be clearly visible",
  ].filter(Boolean).join(", ");

  const negative = [
    BASE_NEGATIVE,
    "human face, humanoid body, normal person, realistic human",
    "poorly defined creature, blob, amorphous shape without distinct features",
    "wrong species, inconsistent anatomy",
  ].join(", ");

  return { positive, negative, imageSize: "portrait_3_4" };
}

export function buildCharacterImagePrompt(
  identity: CharacterIdentity,
  options: CharacterImagePromptOptions = {},
): CharacterImagePrompt {
  const visualStyle = options.projectVisualStyle ?? "detailed manga art, professional character sheet";

  if (isNonHuman(identity.entityKind)) {
    return buildCreaturePrompt(identity, visualStyle);
  }

  const layer = options.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const normalizedGender =
    identity.gender?.trim().toLowerCase() === "male" ? "male"
    : identity.gender?.trim().toLowerCase() === "female" ? "female"
    : null;

  const physicalParts: string[] = [];
  if (normalizedGender === "male") {
    physicalParts.push("adult man, male, masculine features");
  } else if (normalizedGender === "female") {
    physicalParts.push("adult woman, female, feminine features");
  }
  if (identity.appearanceText) physicalParts.push(identity.appearanceText);
  if (identity.hairColor) physicalParts.push(`${identity.hairColor} hair`);
  if (identity.hairStyle) physicalParts.push(`${identity.hairStyle} hairstyle`);
  if (identity.eyeColor) physicalParts.push(`${identity.eyeColor} eyes`);
  if (identity.faceShape) physicalParts.push(`${identity.faceShape} face`);
  if (identity.skinTone) physicalParts.push(`${identity.skinTone} skin`);
  if (identity.silhouette) physicalParts.push(`${identity.silhouette} silhouette`);
  if (identity.outfit) physicalParts.push(identity.outfit);

  if (identity.beard.present) {
    const beardParts = [
      identity.beard.style ?? "beard",
      identity.beard.density ? `${identity.beard.density} density` : null,
      identity.beard.color ? `${identity.beard.color} colored` : null,
    ].filter(Boolean).join(", ");
    physicalParts.push(`facial hair: ${beardParts}`);
  }
  if (identity.mustache.present) {
    physicalParts.push(`moustache: ${identity.mustache.style ?? "moustache"}`);
  }
  if (identity.sideburns) {
    physicalParts.push(`${identity.sideburns.toLowerCase()} sideburns`);
  }
  if (identity.scars) physicalParts.push(`scars: ${identity.scars}`);
  if (identity.tattoos) physicalParts.push(`tattoos: ${identity.tattoos}`);
  if (identity.accessories) physicalParts.push(`accessories: ${identity.accessories}`);
  if (identity.colorPalette) physicalParts.push(`color palette: ${identity.colorPalette}`);

  if (!identity.bodyMarkers.leftArm) physicalParts.push("missing left arm");
  if (!identity.bodyMarkers.rightArm) physicalParts.push("missing right arm");
  if (!identity.bodyMarkers.leftEye) physicalParts.push("eye patch left eye");
  if (!identity.bodyMarkers.rightEye) physicalParts.push("eye patch right eye");

  const roleKey = (identity.roleType ?? "").toLowerCase().replace(/[^a-z_]/g, "_");
  const pose = ROLE_POSE_MAP[roleKey] ?? "natural standing pose, character reference sheet";

  let expression = "neutral expression";
  if (identity.emotionalState) {
    expression = EMO_MAP[identity.emotionalState.toLowerCase()] ?? `${identity.emotionalState} expression`;
  }

  const personalityParts = [
    identity.restingFace ? `resting face: ${identity.restingFace}` : null,
    identity.typicalGaze ? `typical gaze: ${identity.typicalGaze}` : null,
    identity.habitualPosture ? `habitual stance: ${identity.habitualPosture}` : null,
    identity.signatureGesture ? `signature gesture: ${identity.signatureGesture}` : null,
  ].filter(Boolean);

  const traitDesc = identity.traits.length > 0
    ? `personality: ${identity.traits.slice(0, 3).join(", ")}`
    : "";

  const intensityNote = INTENSITY_STYLE[layer] ?? "";

  const positive = [
    visualStyle,
    "manga character portrait, full body reference",
    identity.name,
    ...physicalParts,
    pose,
    expression,
    ...personalityParts,
    traitDesc,
    intensityNote,
    "white background, character sheet style, clean linework, high detail, consistent design",
    "IMPORTANT: all body modifications, prosthetics, bionic limbs, scars, tattoos, and unique physical features MUST be clearly visible and accurate",
  ].filter(Boolean).join(", ");

  let negative = BASE_NEGATIVE;
  if (normalizedGender === "male") {
    negative += ", woman, female, feminine, girl, long feminine hair, makeup, breasts";
  } else if (normalizedGender === "female") {
    negative += ", man, male, masculine, boy, adam's apple";
    if (!identity.beard.present && !identity.mustache.present) {
      negative += ", beard, facial hair";
    }
  }
  if (identity.hairColor) {
    negative += `, wrong hair color, not ${identity.hairColor} hair`;
  }
  if (identity.eyeColor) {
    negative += `, wrong eye color, not ${identity.eyeColor} eyes`;
  }
  if (layer === "GENERAL_SAFE" || layer === "TEEN") {
    negative += ", nudity, suggestive poses, revealing clothing";
  }
  for (const drift of identity.forbiddenVisualDrift) {
    negative += `, ${drift}`;
  }

  return { positive, negative, imageSize: "portrait_3_4" };
}
