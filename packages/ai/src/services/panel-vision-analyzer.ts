import type { CharacterFingerprint } from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";

type VisionPanelScore = {
  characterConsistencyScore: number;
  backgroundPresenceScore: number;
  environmentReadabilityScore: number;
  interactionScore: number;
  shotComplianceScore: number;
  styleConsistencyScore: number;
  releaseScore: number;
  confidence: number;
  findings: string[];
  model: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export async function analyzePanelWithVision(input: {
  imageUrl: string;
  heuristicReleaseScore: number;
  requiredCharacters: Array<{
    characterName: string;
    fingerprint: CharacterFingerprint;
  }>;
  panelContract?: {
    shotType?: string;
    purpose?: string;
    mustShow?: string[];
    backgroundExtras?: string[];
  };
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    anatomyBias?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
  };
  sceneBlueprint?: SceneBlueprint;
}): Promise<VisionPanelScore | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
  const visionEnabled = process.env.ENABLE_PREMIUM_VISION_QA !== "false";
  if (!apiKey || !visionEnabled) return null;
  if (!/^https?:\/\//i.test(input.imageUrl)) return null;

  const shotType = input.panelContract?.shotType ?? input.sceneBlueprint?.composition.shotType ?? "medium";
  const shouldRun =
    shotType === "wide"
    || shotType === "over_shoulder"
    || input.heuristicReleaseScore < 0.86
    || input.requiredCharacters.length > 0;
  if (!shouldRun) return null;

  const expectedCharacters = input.requiredCharacters.map((character) => ({
    name: character.characterName,
    hairColor: character.fingerprint.hair.color,
    eyeColor: character.fingerprint.face.eyeColor,
    gender: character.fingerprint.identity.gender,
    markers: character.fingerprint.permanentMarkers.slice(0, 4),
    outfit: character.fingerprint.defaultOutfit.slice(0, 4),
  }));

  const context = {
    shotType,
    purpose: input.panelContract?.purpose ?? null,
    mustShow: input.panelContract?.mustShow ?? [],
    backgroundExtras: input.panelContract?.backgroundExtras ?? [],
    stylePack: input.stylePack ?? null,
    expectedCharacters,
    environmentSignals: input.sceneBlueprint?.environment.mustShowLocationSignals ?? [],
    interactionBeat: input.sceneBlueprint?.composition.interactionBeat ?? null,
  };

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
              "Tu es un controleur QA manga premium. Tu regardes UNE image et tu rends uniquement un JSON. Donne des scores 0..1 tres stricts pour: characterConsistencyScore, backgroundPresenceScore, environmentReadabilityScore, interactionScore, shotComplianceScore, styleConsistencyScore, releaseScore, confidence, findings[]. Pas de texte hors JSON.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Analyse cette image de panel manga.\nContexte JSON:\n${JSON.stringify(context, null, 2)}\nRègles:\n- wide: le décor doit être clairement visible\n- medium: personnage et décor doivent rester lisibles\n- closeup: garder des indices environnementaux\n- sanctionner fond vide, décor générique, interaction faible, drift style/personnage\n- findings = liste courte de constats concrets`,
              },
              {
                type: "image_url",
                image_url: { url: input.imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[panel-vision] skipped model=${model} status=${response.status} error=${errorText.slice(0, 180)}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      characterConsistencyScore: asNumber(parsed.characterConsistencyScore, 0.5),
      backgroundPresenceScore: asNumber(parsed.backgroundPresenceScore, 0.5),
      environmentReadabilityScore: asNumber(parsed.environmentReadabilityScore, 0.5),
      interactionScore: asNumber(parsed.interactionScore, 0.5),
      shotComplianceScore: asNumber(parsed.shotComplianceScore, 0.5),
      styleConsistencyScore: asNumber(parsed.styleConsistencyScore, 0.5),
      releaseScore: asNumber(parsed.releaseScore, 0.5),
      confidence: asNumber(parsed.confidence, 0.65),
      findings: asStringArray(parsed.findings).slice(0, 6),
      model,
    };
  } catch (error) {
    console.warn(`[panel-vision] exception ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
