/**
 * Character Visual Composer
 *
 * Compose un prompt image cohérent pour générer le visuel de référence canonique
 * d'un personnage. Utilisé par POST /api/characters/:id/generate-visual.
 */

export interface CharacterVisualInput {
  /** Nom du personnage */
  name: string;
  /** Sexe/genre (hyper important pour l'IA) */
  gender?: "male" | "female" | null;
  /** Description physique libre */
  appearance?: string | null;
  /** Couleur de cheveux */
  hairColor?: string | null;
  /** Couleur des yeux */
  eyeColor?: string | null;
  /** Tenue vestimentaire par défaut */
  outfitDefault?: string | null;
  /** Traits de personnalité (pour l'expression) */
  traits?: string[] | null;
  /** Rôle dans l'histoire (pour le style de pose) */
  roleType?: string | null;
  /** État émotionnel actuel */
  emotionalState?: string | null;
  /** Style visuel du projet */
  projectVisualStyle?: string | null;
  /** Niveau de sensualité du projet (0-10) */
  sensualityLevel?: number;
  /** Layer de contenu */
  contentIntensityLayer?: string;
  /** CREATURE-1 : type d'entité non-humaine */
  entityKind?: string | null;
  /** CREATURE-1 : label d'espèce (ex: "dragon rouge", "golem de pierre") */
  speciesLabel?: string | null;
}

export interface CharacterVisualPrompt {
  positive: string;
  negative: string;
  /** Suggestion de taille d'image */
  imageSize: "portrait_3_4" | "square_hd";
}

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

const INTENSITY_STYLE: Record<string, string> = {
  GENERAL_SAFE: "fully clothed, appropriate attire",
  TEEN: "fully clothed, stylish outfit",
  MATURE_DRAMA: "mature character design, expressive",
  MATURE_VISUAL: "mature character design, detailed",
  ADULT_EXPLICIT: "adult character design, detailed, mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
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

/**
 * Compose un prompt pour une créature / entité non-humaine.
 * Court-circuite complètement le pipeline humain.
 */
function composeCreatureVisualPrompt(
  input: CharacterVisualInput,
  entityKind: string,
  speciesLabel: string | null,
): CharacterVisualPrompt {
  const visualStyle = input.projectVisualStyle ?? "detailed manga art, professional creature sheet";
  const baseStyle = CREATURE_STYLE_MAP[entityKind.toLowerCase()] ?? CREATURE_STYLE_MAP.creature;
  const species = speciesLabel ? `${speciesLabel}, ` : "";

  const positiveParts: string[] = [
    visualStyle,
    "manga creature reference sheet, full body, multiple angles",
    `${input.name}`,
    `${species}${baseStyle}`,
    input.appearance ?? "",
    input.hairColor ? `${input.hairColor} coloring` : "",
    input.eyeColor ? `${input.eyeColor} eyes` : "",
    input.outfitDefault ? input.outfitDefault : "",
    input.traits?.length ? `characteristics: ${input.traits.slice(0, 3).join(", ")}` : "",
    "white background, reference sheet style, clean linework, high detail",
    "CRITICAL: all unique physical features, mutations, special anatomy must be clearly visible",
  ].filter(Boolean);

  const negative = [
    BASE_NEGATIVE,
    "human face, humanoid body, normal person, realistic human",
    "poorly defined creature, blob, amorphous shape without distinct features",
    "wrong species, inconsistent anatomy",
  ].join(", ");

  return {
    positive: positiveParts.join(", "),
    negative,
    imageSize: "portrait_3_4",
  };
}

/**
 * Compose un prompt structuré pour le visuel canonique d'un personnage.
 * Le résultat est utilisé directement dans l'appel FAL flux/dev.
 */
export function composeCharacterVisualPrompt(
  input: CharacterVisualInput,
): CharacterVisualPrompt {
  // CREATURE-1 : détecter les entités non-humaines et utiliser le composer dédié
  const entityKind = input.entityKind;
  const speciesLabel = input.speciesLabel ?? null;
  const isNonHuman = entityKind && !["human", "named_npc", ""].includes(entityKind.toLowerCase());
  if (isNonHuman) {
    return composeCreatureVisualPrompt(input, entityKind, speciesLabel);
  }

  const layer = input.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const visualStyle =
    input.projectVisualStyle ?? "detailed manga art, professional character sheet";

  const normalizedGender = input.gender?.trim().toLowerCase() === "male" ? "male"
    : input.gender?.trim().toLowerCase() === "female" ? "female"
    : null;

  const physicalParts: string[] = [];
  if (normalizedGender === "male") {
    physicalParts.push("adult man, male, masculine features");
  } else if (normalizedGender === "female") {
    physicalParts.push("adult woman, female, feminine features");
  }
  if (input.appearance) physicalParts.push(input.appearance);
  if (input.hairColor) physicalParts.push(`${input.hairColor} hair`);
  if (input.eyeColor) physicalParts.push(`${input.eyeColor} eyes`);
  if (input.outfitDefault) physicalParts.push(input.outfitDefault);

  // Pose selon le rôle
  const roleKey = (input.roleType ?? "").toLowerCase().replace(/[^a-z_]/g, "_");
  const pose = ROLE_POSE_MAP[roleKey] ?? "natural standing pose, character reference sheet";

  // Expression selon l'état émotionnel
  let expression = "neutral expression";
  if (input.emotionalState) {
    const emoMap: Record<string, string> = {
      determined: "determined expression, focused gaze",
      sad: "melancholic expression, downcast eyes",
      angry: "fierce expression, intense eyes",
      happy: "warm smile, bright eyes",
      fearful: "wide eyes, tense expression",
      mysterious: "enigmatic half-smile, piercing gaze",
      confident: "confident smirk, relaxed posture",
    };
    expression = emoMap[input.emotionalState.toLowerCase()] ?? `${input.emotionalState} expression`;
  }

  // Traits de personnalité → style visuel
  const traitDesc =
    input.traits && input.traits.length > 0
      ? `personality: ${input.traits.slice(0, 3).join(", ")}`
      : "";

  const intensityNote = INTENSITY_STYLE[layer] ?? "";

  const positiveParts = [
    visualStyle,
    "manga character portrait, full body reference",
    `${input.name}`,
    ...physicalParts,
    pose,
    expression,
    traitDesc,
    intensityNote,
    "white background, character sheet style, clean linework, high detail, consistent design",
    "IMPORTANT: all body modifications, prosthetics, bionic limbs, scars, tattoos, and unique physical features MUST be clearly visible and accurate",
  ].filter(Boolean);

  const positive = positiveParts.join(", ");

  // Negative enrichi pour éviter les incohérences canoniques
  let negative = BASE_NEGATIVE;
  if (normalizedGender === "male") {
    negative += ", woman, female, feminine, girl, long feminine hair, makeup, breasts";
  } else if (normalizedGender === "female") {
    negative += ", man, male, masculine, boy, beard, facial hair, adam's apple";
  }
  if (input.hairColor) {
    negative += `, wrong hair color, not ${input.hairColor} hair`;
  }
  if (input.eyeColor) {
    negative += `, wrong eye color, not ${input.eyeColor} eyes`;
  }
  if (layer === "GENERAL_SAFE" || layer === "TEEN") {
    negative += ", nudity, suggestive poses, revealing clothing";
  }

  return {
    positive,
    negative,
    imageSize: "portrait_3_4",
  };
}

/**
 * Compose un prompt pour une scène avec un personnage spécifique au premier plan.
 * Utilisé pour les images de profil contextuelles.
 */
export function composeCharacterScenePrompt(
  input: CharacterVisualInput & { location: string; action: string },
): CharacterVisualPrompt {
  const base = composeCharacterVisualPrompt(input);

  const sceneParts = [
    base.positive.replace("white background, character sheet style,", ""),
    `location: ${input.location}`,
    input.action,
    "manga panel, cinematic framing, detailed background",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    positive: sceneParts,
    negative: base.negative,
    imageSize: "portrait_3_4",
  };
}
