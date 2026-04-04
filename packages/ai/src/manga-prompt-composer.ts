import type { PanelMood } from "./chapter-pipeline";

export interface CharacterRef {
  name: string;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  canonicalImageUrl?: string | null;
}

export interface StylePackRef {
  name?: string | null;
  description?: string | null;
  visualStyle?: string | null;
}

export interface PanelPromptInput {
  /** Style artistique du projet */
  stylePack?: StylePackRef | null;
  /** Personnages présents dans le panel */
  characters?: CharacterRef[];
  /** Lieu de la scène */
  location: string;
  /** Action principale du panel */
  action: string;
  /** Type de plan caméra */
  camera: string;
  /** Ambiance émotionnelle */
  mood: PanelMood;
  /** Layer de contenu (contrôle les contraintes) */
  contentIntensityLayer?: string;
  /** Texte de dialogue à intégrer dans le prompt */
  dialogueHint?: string;
  /** Seed pour reproductibilité */
  seed?: number;
}

export interface ComposedPrompt {
  positive: string;
  negative: string;
  seed?: number;
}

const MOOD_DESCRIPTORS: Record<PanelMood, string> = {
  action: "dynamic action scene, motion blur, speed lines, explosive energy",
  tension: "tense atmosphere, dramatic shadows, high contrast, ominous lighting",
  emotion: "emotional close-up, glistening eyes, soft warm lighting, delicate expression",
  revelation: "shocking reveal, dramatic spotlight, wide eyes, frozen moment",
  calm: "peaceful composition, soft diffused light, serene atmosphere",
  horror: "dark horror, deep oppressive shadows, unsettling angles, pale skin",
  romance: "soft romantic lighting, cherry blossom petals, warm golden tones, intimate framing",
  comedy: "comedic exaggeration, sweat drops, chibi-style reaction, bright colors",
  dramatic: "dramatic composition, strong diagonal shadows, cinematic framing",
};

const CAMERA_DESCRIPTORS: Record<string, string> = {
  "wide establishing shot": "wide shot, full environment visible, characters small in frame",
  "medium shot": "medium shot, waist up, balanced composition",
  "close-up on face": "close-up portrait, face filling frame, emotional detail",
  "over-the-shoulder shot": "over-the-shoulder perspective, depth of field",
  "extreme close-up on eyes": "extreme close-up, eyes only, intense gaze, micro detail",
  "low angle shot": "low angle, looking up, powerful imposing figure",
  "bird's eye view": "bird's eye view, top-down perspective, full scene overview",
};

const INTENSITY_CONSTRAINTS: Record<string, string> = {
  GENERAL_SAFE: "family friendly, no violence, no suggestive content",
  TEEN: "mild action, no explicit content, teen appropriate",
  MATURE_DRAMA: "mature themes allowed, no explicit nudity, dark drama",
  MATURE_VISUAL: "mature visual content, artistic nudity allowed, dark themes",
  ADULT_EXPLICIT: "adult content, explicit artistic nudity, dark romance, mature themes",
  RESTRICTED_BLOCKED_VISUAL: "BLOCKED",
};

const BASE_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, " +
  "watermark, text overlay, low quality, duplicate character, poorly drawn face, " +
  "missing fingers, extra fingers, fused characters, inconsistent art style";

function describeCharacter(c: CharacterRef): string {
  const parts: string[] = [`[${c.name}]`];
  if (c.appearance) parts.push(c.appearance);
  if (c.hairColor) parts.push(`${c.hairColor} hair`);
  if (c.eyeColor) parts.push(`${c.eyeColor} eyes`);
  if (c.outfitDefault) parts.push(c.outfitDefault);
  return parts.join(", ");
}

function resolveVisualStyle(stylePack?: StylePackRef | null): string {
  if (!stylePack) return "detailed manga art, professional manga panel";
  const parts: string[] = [];
  if (stylePack.visualStyle) parts.push(stylePack.visualStyle);
  else if (stylePack.description) parts.push(stylePack.description);
  else if (stylePack.name) parts.push(`${stylePack.name} style`);
  parts.push("manga panel");
  return parts.join(", ");
}

/**
 * Compose un prompt image structuré pour un panel manga.
 * Intègre le style du projet, les descriptions canoniques des personnages,
 * la caméra, le mood et les contraintes de contenu.
 */
export function composeMangaPanelPrompt(input: PanelPromptInput): ComposedPrompt {
  const layer = input.contentIntensityLayer ?? "TEEN";

  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    throw new Error("Content blocked: RESTRICTED_BLOCKED_VISUAL layer");
  }

  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic manga panel";
  const cameraDesc =
    CAMERA_DESCRIPTORS[input.camera] ?? `${input.camera}, manga composition`;
  const intensityNote = INTENSITY_CONSTRAINTS[layer] ?? "";

  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map(describeCharacter).join(" | ")
      : "";

  const positiveParts: string[] = [
    visualStyle,
    cameraDesc,
    `location: ${input.location}`,
  ];

  if (charDescs) positiveParts.push(`characters: ${charDescs}`);
  positiveParts.push(input.action);
  positiveParts.push(moodDesc);
  if (intensityNote && layer !== "GENERAL_SAFE") positiveParts.push(intensityNote);
  positiveParts.push(
    "high detail, consistent character design, professional manga art, ink lines, same character appearance as previous panels",
  );

  if (input.dialogueHint) {
    positiveParts.push(`emotional subtext: ${input.dialogueHint.slice(0, 120)}`);
  }

  const positive = positiveParts.filter(Boolean).join(", ");

  // Negative prompt enrichi selon le layer + verrous de dérive visuelle
  let negative = BASE_NEGATIVE;
  if (input.characters && input.characters.length > 0) {
    const driftGuards = input.characters
      .map((c) => {
        const guards: string[] = [];
        if (c.hairColor) guards.push(`wrong hair color for ${c.name}`);
        if (c.eyeColor) guards.push(`wrong eye color for ${c.name}`);
        if (c.outfitDefault) guards.push(`wrong outfit for ${c.name}`);
        return guards.join(", ");
      })
      .filter(Boolean)
      .join(", ");
    if (driftGuards) negative += `, ${driftGuards}`;
  }
  if (layer === "GENERAL_SAFE" || layer === "TEEN") {
    negative += ", nudity, violence, blood, gore, suggestive poses";
  }

  return {
    positive,
    negative,
    seed: input.seed,
  };
}

/**
 * Compose un prompt pour une image de couverture de chapitre.
 */
export function composeChapterCoverPrompt(input: {
  stylePack?: StylePackRef | null;
  characters?: CharacterRef[];
  chapterTitle: string;
  tone: string;
  mood: PanelMood;
  contentIntensityLayer?: string;
}): ComposedPrompt {
  const visualStyle = resolveVisualStyle(input.stylePack);
  const moodDesc = MOOD_DESCRIPTORS[input.mood] ?? "dramatic";
  const charDescs =
    input.characters && input.characters.length > 0
      ? input.characters.map(describeCharacter).join(" | ")
      : "";

  const positive = [
    visualStyle,
    "manga chapter cover, full page illustration",
    charDescs,
    `tone: ${input.tone}`,
    moodDesc,
    "epic composition, detailed background, professional manga cover art",
  ]
    .filter(Boolean)
    .join(", ");

  return { positive, negative: BASE_NEGATIVE };
}
