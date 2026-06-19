/**
 * MOAT-2 — Image-image similarity scoring (post-gen, pas du texte).
 *
 * Compare une image générée à une référence canonique d'un personnage en
 * utilisant un modèle vision (par défaut gpt-4o-mini) pour produire un score
 * de similarité visuel — face, cheveux, tenue, marqueurs permanents.
 *
 * Cette mesure complète le détecteur symbolique `visual-drift-detector` :
 * elle attrape les drifts qui passent à travers le filtre textuel
 * (ex: prompt parfait mais image ratée, génération hors-style).
 *
 * Designed to be cheap and rate-limited :
 *  - skip si pas de OPENAI_API_KEY
 *  - skip si pas de canonical reference
 *  - throttle global 60 calls / minute
 *  - cache (panelImageUrl + canonRefUrl) — 1h
 */

interface ImageSimilarityScore {
  /** Similarité globale 0..1 (1 = identique au canon) */
  overallScore: number;
  /** Similarité visage 0..1 */
  faceScore: number;
  /** Similarité cheveux (couleur + coupe) 0..1 */
  hairScore: number;
  /** Similarité tenue 0..1 */
  outfitScore: number;
  /** Confiance du modèle 0..1 */
  confidence: number;
  /** Constats lisibles (max 5) */
  findings: string[];
  /** Modèle utilisé */
  model: string;
  /** Skipped: raison si pas exécuté */
  skipped?: string;
}

interface ScoreInput {
  /** URL HTTP(S) de l'image générée */
  generatedImageUrl: string;
  /** URL HTTP(S) de l'image canonique (référence) */
  canonicalReferenceUrl: string;
  /** Nom du personnage attendu (pour le prompt vision) */
  characterName: string;
  /** Optionnel : indice de couleur cheveux attendu pour aide au scoring */
  expectedHairColor?: string | null;
  /** Optionnel : indice de tenue attendue */
  expectedOutfit?: string | null;
}

const CACHE = new Map<string, { result: ImageSimilarityScore; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CALLS_PER_MINUTE = 60;
let callsThisMinute = 0;
let windowStart = Date.now();

// P4.1 — Known temporary URL hosts that expire quickly
const TEMPORARY_URL_HOSTS = [
  "v3b.fal.media",
  "fal.media",
  "delivery.bfl.ai",
  "delivery-1.bfl.ai",
  "delivery-2.bfl.ai",
];

function isLikelyExpiredProviderUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return TEMPORARY_URL_HOSTS.some((host) => parsed.host.includes(host));
  } catch {
    return false;
  }
}

function cacheKey(input: ScoreInput): string {
  return `${input.generatedImageUrl}__${input.canonicalReferenceUrl}__${input.characterName}`;
}

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function asStringArray(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, max);
}

function checkThrottle(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    callsThisMinute = 0;
    windowStart = now;
  }
  if (callsThisMinute >= MAX_CALLS_PER_MINUTE) return false;
  callsThisMinute += 1;
  return true;
}

/**
 * Skipped (pas exécuté) :
 *  - sans OPENAI_API_KEY
 *  - sans URLs HTTP(S) valides
 *  - throttle dépassé
 */
export async function scoreImageSimilarity(input: ScoreInput): Promise<ImageSimilarityScore> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";

  const skip = (reason: string): ImageSimilarityScore => ({
    overallScore: 0,
    faceScore: 0,
    hairScore: 0,
    outfitScore: 0,
    confidence: 0,
    findings: [],
    model,
    skipped: reason,
  });

  if (!apiKey) return skip("no_openai_api_key");
  if (!/^https?:\/\//i.test(input.generatedImageUrl)) return skip("invalid_generated_url");
  if (!/^https?:\/\//i.test(input.canonicalReferenceUrl)) return skip("invalid_canonical_url");
  // P4.1 — Reject likely-expired temporary URLs
  if (isLikelyExpiredProviderUrl(input.generatedImageUrl)) return skip("likely_expired_generated_url");
  if (isLikelyExpiredProviderUrl(input.canonicalReferenceUrl)) return skip("likely_expired_canonical_url");

  const key = cacheKey(input);
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  if (!checkThrottle()) return skip("rate_limited");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu compares deux images d'un même personnage manga. La PREMIÈRE image est la référence canonique. La DEUXIÈME image est une nouvelle génération. Tu rends UNIQUEMENT un JSON strict avec des scores 0..1 (1 = identique). Champs requis : overallScore, faceScore, hairScore, outfitScore, confidence, findings (array de constats courts max 5). Sois sévère sur les drifts couleur cheveux/yeux et changement de tenue.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Personnage : ${input.characterName}.\n` +
                  (input.expectedHairColor ? `Couleur cheveux attendue : ${input.expectedHairColor}.\n` : "") +
                  (input.expectedOutfit ? `Tenue attendue : ${input.expectedOutfit}.\n` : "") +
                  `Image 1 = canonical reference. Image 2 = generated panel.\n` +
                  `Note les similarités selon les règles du système.`,
              },
              { type: "image_url", image_url: { url: input.canonicalReferenceUrl } },
              { type: "image_url", image_url: { url: input.generatedImageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(
        `[image-similarity] skipped model=${model} status=${response.status} error=${text.slice(0, 180)}`,
      );
      return skip(`http_${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return skip("empty_response");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const result: ImageSimilarityScore = {
      overallScore: clamp01(parsed.overallScore, 0.5),
      faceScore: clamp01(parsed.faceScore, 0.5),
      hairScore: clamp01(parsed.hairScore, 0.5),
      outfitScore: clamp01(parsed.outfitScore, 0.5),
      confidence: clamp01(parsed.confidence, 0.6),
      findings: asStringArray(parsed.findings, 5),
      model,
    };

    CACHE.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error) {
    console.warn(
      `[image-similarity] exception ${error instanceof Error ? error.message : String(error)}`,
    );
    return skip("exception");
  }
}

/**
 * Combine plusieurs scores image-image (un par personnage focus) en un score
 * global de drift visuel (1 = pas de drift, 0 = drift majeur). Renvoie aussi
 * une liste de characterDrifts pour exposer les findings dans la UI.
 */
export interface AggregatedSimilarity {
  /** Score moyen pondéré 0..1 */
  averageScore: number;
  /** Score min observé (le pire personnage) */
  minScore: number;
  /** Personnages individuellement scorés */
  characterDrifts: Array<{
    characterName: string;
    overallScore: number;
    faceScore: number;
    hairScore: number;
    outfitScore: number;
    findings: string[];
    skipped?: string;
  }>;
  /** True si au moins un score < 0.55 (drift fort) */
  hasStrongDrift: boolean;
  /** True si au moins un score < 0.7 (drift modéré) */
  hasModerateDrift: boolean;
}

export function aggregateSimilarityScores(
  scores: Array<{ characterName: string; score: ImageSimilarityScore }>,
): AggregatedSimilarity | null {
  const usable = scores.filter((s) => !s.score.skipped);
  if (usable.length === 0) return null;

  const overallScores = usable.map((s) => s.score.overallScore);
  const averageScore = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;
  const minScore = Math.min(...overallScores);

  return {
    averageScore,
    minScore,
    characterDrifts: scores.map((s) => ({
      characterName: s.characterName,
      overallScore: s.score.overallScore,
      faceScore: s.score.faceScore,
      hairScore: s.score.hairScore,
      outfitScore: s.score.outfitScore,
      findings: s.score.findings,
      skipped: s.score.skipped,
    })),
    hasStrongDrift: minScore < 0.55,
    hasModerateDrift: minScore < 0.7,
  };
}

export type { ImageSimilarityScore, ScoreInput };
