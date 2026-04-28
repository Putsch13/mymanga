/**
 * Extraction de CharacterFingerprint depuis les références visuelles.
 * Analyse les images primaires pour extraire l'identité visuelle stricte.
 */

import { type CharacterFingerprint, isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";

export interface CharacterRefImage {
  url: string;
  type: string;
  isPrimary: boolean;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function extractFingerprintWithVision(
  input: {
    characterName: string;
    gender: "male" | "female" | "other";
    visualRefs: CharacterRefImage[];
  },
): Promise<Partial<CharacterFingerprint> | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.ENABLE_CHARACTER_VISION_FINGERPRINT === "false") return null;
  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
  const refs = input.visualRefs.filter((ref) => ref.isPrimary).slice(0, 3);
  if (refs.length === 0) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu extrais une fiche visuelle de personnage manga. Réponds uniquement en JSON avec: face{faceShape,eyeShape,eyeColor,eyebrowStyle}, hair{color,style,length,texture,silhouette}, body{build,height,posture,silhouette}, permanentMarkers[], defaultOutfit[], forbiddenDrift[]. Reste compact et factuel.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Personnage: ${input.characterName}\nGenre canon: ${input.gender}\nAnalyse les références suivantes et extrais les traits stables uniquement.`,
              },
              ...refs.map((ref) => ({
                type: "image_url" as const,
                image_url: { url: ref.url },
              })),
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const face = (parsed.face ?? {}) as Record<string, unknown>;
    const hair = (parsed.hair ?? {}) as Record<string, unknown>;
    const body = (parsed.body ?? {}) as Record<string, unknown>;
    return {
      face: {
        faceShape: asString(face.faceShape, "oval"),
        eyeShape: asString(face.eyeShape, "almond"),
        eyeColor: asString(face.eyeColor, "brown"),
        eyebrowStyle: asString(face.eyebrowStyle, "natural"),
      },
      hair: {
        color: asString(hair.color, "black"),
        style: asString(hair.style, "short"),
        length: asString(hair.length, "medium"),
        texture: asString(hair.texture, "straight"),
        silhouette: asString(hair.silhouette, "standard"),
      },
      body: {
        build: asString(body.build, "average"),
        height: asString(body.height, "average"),
        posture: asString(body.posture, "upright"),
        silhouette: asString(body.silhouette, "standard"),
      },
      permanentMarkers: asStringArray(parsed.permanentMarkers),
      defaultOutfit: asStringArray(parsed.defaultOutfit),
      forbiddenDrift: asStringArray(parsed.forbiddenDrift),
    };
  } catch {
    return null;
  }
}

/**
 * Extrait un CharacterFingerprint structuré depuis les références visuelles.
 * 
 * IMPORTANT: Cette v1 est heuristique/basique. Pour une vraie extraction,
 * il faudrait:
 * - Vision AI (GPT-4V, Claude Sonnet) pour analyser l'image
 * - Détection de features (couleur cheveux/yeux, silhouette, markers)
 * - Extraction de embeddings visuels
 * 
 * Pour l'instant, on crée un fingerprint minimal depuis les métadonnées Character.
 */
export async function extractCharacterFingerprintFromRefs(input: {
  characterId: string;
  characterName: string;
  gender: "male" | "female" | "other";
  visualRefs: CharacterRefImage[];
  visualProfile?: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
}): Promise<CharacterFingerprint> {
  const primaryRefs = input.visualRefs.filter((ref) => ref.isPrimary);
  const premium = isPipelineV3PremiumOnlyEnabled();

  if (premium && primaryRefs.length > 0) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error(
        "premium_character_vision_fingerprint_required: OPENAI_API_KEY is required when primary visual refs exist.",
      );
    }
    if (process.env.ENABLE_CHARACTER_VISION_FINGERPRINT === "false") {
      throw new Error(
        "premium_character_vision_fingerprint_required: ENABLE_CHARACTER_VISION_FINGERPRINT=false is incompatible with primary refs in premium.",
      );
    }
  }

  const visualProfile = input.visualProfile ?? {};
  const bodyState = input.bodyState ?? {};
  const wardrobeProfile = input.wardrobeProfile ?? {};
  const visionFingerprint = await extractFingerprintWithVision({
    characterName: input.characterName,
    gender: input.gender,
    visualRefs: input.visualRefs,
  });

  if (premium && primaryRefs.length > 0 && !visionFingerprint) {
    throw new Error(
      "premium_character_vision_fingerprint_failed: vision extraction returned no usable fingerprint.",
    );
  }

  const fingerprint: CharacterFingerprint = {
    identity: {
      name: input.characterName,
      gender: input.gender,
      perceivedAge: (visualProfile.age as string) ?? "adult",
      role: (visualProfile.role as string) ?? "protagonist",
    },
    face: {
      faceShape: visionFingerprint?.face?.faceShape ?? (visualProfile.faceShape as string) ?? "oval",
      eyeShape: visionFingerprint?.face?.eyeShape ?? (visualProfile.eyeShape as string) ?? "almond",
      eyeColor: input.eyeColor ?? visionFingerprint?.face?.eyeColor ?? (visualProfile.eyeColor as string) ?? "brown",
      eyebrowStyle: visionFingerprint?.face?.eyebrowStyle ?? (visualProfile.eyebrowStyle as string) ?? "natural",
      noseStyle: (visualProfile.noseStyle as string) ?? undefined,
      mouthStyle: (visualProfile.mouthStyle as string) ?? undefined,
    },
    hair: {
      color: input.hairColor ?? visionFingerprint?.hair?.color ?? (visualProfile.hairColor as string) ?? "black",
      style: visionFingerprint?.hair?.style ?? (visualProfile.hairStyle as string) ?? "short",
      length: visionFingerprint?.hair?.length ?? (visualProfile.hairLength as string) ?? "medium",
      texture: visionFingerprint?.hair?.texture ?? (visualProfile.hairTexture as string) ?? "straight",
      silhouette: visionFingerprint?.hair?.silhouette ?? (visualProfile.hairSilhouette as string) ?? "standard",
    },
    body: {
      build: visionFingerprint?.body?.build ?? (bodyState.build as string) ?? "average",
      height: visionFingerprint?.body?.height ?? (bodyState.height as string) ?? "average",
      posture: visionFingerprint?.body?.posture ?? (bodyState.posture as string) ?? "upright",
      silhouette: visionFingerprint?.body?.silhouette ?? (bodyState.silhouette as string) ?? "standard",
    },
    permanentMarkers: [
      ...(visionFingerprint?.permanentMarkers ?? []),
      ...(Array.isArray(bodyState.scars) ? (bodyState.scars as string[]) : []),
      ...(Array.isArray(bodyState.tattoos) ? (bodyState.tattoos as string[]) : []),
      ...(Array.isArray(visualProfile.distinctiveFeatures) ? (visualProfile.distinctiveFeatures as string[]) : []),
    ],
    defaultOutfit: [
      ...(visionFingerprint?.defaultOutfit ?? []),
      ...(Array.isArray(wardrobeProfile.defaultOutfit) ? (wardrobeProfile.defaultOutfit as string[]) : []),
    ],
    forbiddenDrift: [
      ...(visionFingerprint?.forbiddenDrift ?? []),
      // Auto-générer forbidden drifts basés sur les traits fixes
      input.hairColor ? `never change hair color from ${input.hairColor}` : "",
      input.eyeColor ? `never change eye color from ${input.eyeColor}` : "",
      input.gender === "male" ? "never appear as female" : "",
      input.gender === "female" ? "never appear as male" : "",
    ].filter(Boolean),
    primaryRefs: input.visualRefs
      .filter((ref) => ref.isPrimary)
      .map((ref) => ref.url),
    loraTrigger: undefined, // Sera rempli si LoRA disponible
  };

  return fingerprint;
}

/**
 * Enrichit un fingerprint existant avec les infos d'un LoRA.
 */
export function enrichFingerprintWithLora(
  fingerprint: CharacterFingerprint,
  loraTrigger: string
): CharacterFingerprint {
  return {
    ...fingerprint,
    loraTrigger,
  };
}
