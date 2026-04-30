import type { GenerateImageInput, GenerateImageResult } from "../types";
import { optimizePromptForFal } from "../services/structured-prompt-lang";
import { createFalJobClient, type FalJobClientInput } from "../services/fal-job-client";

export const FAL_MODEL_TEXT = "fal-ai/flux/dev";
export const FAL_MODEL_REDUX = "fal-ai/flux/dev/redux";
export const FAL_MODEL_LORA = "fal-ai/flux-lora";
export const FAL_MODEL_SCHNELL = "fal-ai/flux/schnell";

/**
 * COST-1 — Résolution du modèle optimal selon la criticité du panel.
 * flux/schnell ($0.003) pour les panels medium/low.
 * flux/dev ($0.025) uniquement pour les panels critical/high et les character refs.
 * Économie attendue : ~70% du coût image.
 */
export const FAL_MODEL_REALISM = "fal-ai/flux-realism";

export function resolveOptimalFalModel(
  criticality: string | null | undefined,
  panelCategory: string | null | undefined,
  referencePolicy: string | null | undefined,
  rerollKind: string | null | undefined,
  contentIntensityLayer?: string | null,
): { model: string; numSteps: number; usedSchnell: boolean } {
  // Contenu explicite/mature visuel → flux-realism (moins filtré que flux/dev)
  // Sauf CHARACTER_LOCK qui a besoin de flux/dev pour la fidélité personnage
  if (
    (contentIntensityLayer === "ADULT_EXPLICIT" || contentIntensityLayer === "MATURE_VISUAL") &&
    panelCategory !== "CHARACTER_LOCK"
  ) {
    return { model: FAL_MODEL_REALISM, numSteps: 28, usedSchnell: false };
  }

  // Toujours flux/dev pour les panels critiques, les character locks, les refs fortes et la cover
  const forceHighQuality =
    criticality === "critical" ||
    criticality === "high" ||
    panelCategory === "CHARACTER_LOCK" ||
    panelCategory === "COVER_ART" ||
    panelCategory === "SPLASH_PAGE" ||
    referencePolicy === "STRONG";

  if (forceHighQuality) {
    return { model: FAL_MODEL_TEXT, numSteps: 28, usedSchnell: false };
  }

  // Rerolls locaux : toujours schnell (rapide + moins cher, juste pour voir les fixes)
  if (rerollKind === "reroll_local" || rerollKind === "LOCAL_FIX") {
    return { model: FAL_MODEL_SCHNELL, numSteps: 4, usedSchnell: true };
  }

  // Establishing shots / environment panels → schnell suffisant
  if (
    panelCategory === "ESTABLISHING_ENVIRONMENT" ||
    panelCategory === "ENVIRONMENT_ONLY" ||
    criticality === "medium" ||
    criticality === "low"
  ) {
    return { model: FAL_MODEL_SCHNELL, numSteps: 4, usedSchnell: true };
  }

  // Par défaut : flux/dev
  return { model: FAL_MODEL_TEXT, numSteps: 28, usedSchnell: false };
}

/**
 * Normalise le prompt négatif pour FAL/FLUX.
 *
 * Historique :
 * - BUG-02 : l'ancienne implémentation filtrait via regex restrictives, jetant
 *   quasi tous les drift guards. Capée à ~22 termes.
 * - P0-2 (audit DIAG) : 22 était trop bas — les drift guards dynamiques
 *   (~6 par personnage × N personnages + format + anatomy + composition)
 *   dépassaient 22 dès 2 persos, supprimant les protections critiques.
 *
 * Nouvelle stratégie :
 * 1. Budget élargi à 80 termes (FLUX gère confortablement jusqu'à ~100 tokens
 *    négatifs distincts avant que la qualité ne dégrade).
 * 2. Priorisation étendue à 6 groupes :
 *    - drift (wrong hair/eye/outfit/gender for <name>) — jamais jetés
 *    - format (photorealistic, 3d, western comics) — style-breaking
 *    - anatomy (deformed, extra fingers, bad proportions)
 *    - composition (empty bg, studio, isolated portrait)
 *    - quality (blurry, low quality, watermark, jpeg artifacts)
 *    - rest (fallback)
 * 3. Dédoublonnage par segment (case-insensitive).
 */
export function buildFalNegativePrompt(raw: string | undefined) {
  if (!raw?.trim()) return "";

  const normalized = optimizePromptForFal(raw, 1000)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const deduped = [...new Set(normalized)];

  const driftGuards: string[] = [];
  const formatGuards: string[] = [];
  const anatomyGuards: string[] = [];
  const compositionGuards: string[] = [];
  const qualityGuards: string[] = [];
  const rest: string[] = [];

  const DRIFT_RE = /wrong (hair|eye|outfit|skin|age|gender|face|body)|character drift|visual drift|different (hair|eye|outfit|face)|color drift|identity shift|swapped character|wrong character|male for female|female for male|woman for male|man for female|inconsistent outfit|duplicate character|fused character|twin character|clone character|feminine|masculine|beard|facial hair|long feminine hair|woman|female|man|male|boy|girl/;
  const FORMAT_RE = /photorealistic|photoreal|photography|photo realistic|3d render|cgi|octane|unreal engine|blender|western comics|american comics|marvel|dc comics|disney style|pixar|realistic photo|stock photo|render 3d|anime 3d|portrait photo|selfie|oil painting|acrylic painting|watercolor style/;
  const ANATOMY_RE = /deformed|malformed|extra (fingers|hands|limbs|legs|arms|heads|eyes)|missing (fingers|hands|limbs|eyes|arms|legs)|mutated|disfigured|bad anatomy|bad proportions|long neck|fused fingers|broken (hands|limbs|fingers)|twisted limbs|floating limbs|poorly drawn (face|hands|eyes)|unnatural pose|stiff pose/;
  const COMPOSITION_RE = /empty background|studio backdrop|studio background|flat grey backdrop|isolated centered portrait|isolated portrait|blurry environment|floating character|disconnected characters|missing background|no crowd|weak social interaction|vague background|plain backdrop|white background|centered composition always|no environment interaction|generic campus background|empty school courtyard|missing students|blank outdoor backdrop/;
  const QUALITY_RE = /blurry|low quality|jpeg artifacts|watermark|signature|artist signature|text overlay|washed image|overblur|noise|grain|pixelated|compression artifact|low resolution|oversaturated|undersaturated|motion blur unwanted/;

  for (const item of deduped) {
    if (DRIFT_RE.test(item)) driftGuards.push(item);
    else if (FORMAT_RE.test(item)) formatGuards.push(item);
    else if (ANATOMY_RE.test(item)) anatomyGuards.push(item);
    else if (COMPOSITION_RE.test(item)) compositionGuards.push(item);
    else if (QUALITY_RE.test(item)) qualityGuards.push(item);
    else rest.push(item);
  }

  // Budget par groupe — caps internes pour éviter qu'un seul groupe mange tout
  // si l'input est mal formé. Total théorique : 24+12+14+10+8+12 = 80.
  const prioritized = [
    ...driftGuards.slice(0, 24),
    ...formatGuards.slice(0, 12),
    ...anatomyGuards.slice(0, 14),
    ...compositionGuards.slice(0, 10),
    ...qualityGuards.slice(0, 8),
    ...rest.slice(0, 12),
  ];

  const MAX_NEGATIVE_TERMS = 80;
  return prioritized.slice(0, MAX_NEGATIVE_TERMS).join(", ");
}

export function describeReferencePolicy(value: unknown) {
  return value === "NONE" || value === "LIGHT" || value === "STRONG" ? value : "LIGHT";
}

export function normalizeRequestedFalModel(
  requested: string | null | undefined,
  flags: { useLora: boolean; useRedux: boolean },
  optimalModel?: { model: string; numSteps: number; usedSchnell: boolean },
) {
  if (flags.useLora) return { model: FAL_MODEL_LORA, numSteps: optimalModel?.numSteps ?? 28, usedSchnell: false };
  if (flags.useRedux) return { model: FAL_MODEL_REDUX, numSteps: optimalModel?.numSteps ?? 28, usedSchnell: false };
  if (requested === "flux-pro/v1.1") {
    return { model: FAL_MODEL_TEXT, numSteps: optimalModel?.numSteps ?? 28, usedSchnell: false };
  }
  if (optimalModel) {
    return { model: optimalModel.model, numSteps: optimalModel.numSteps, usedSchnell: optimalModel.usedSchnell };
  }
  return { model: FAL_MODEL_TEXT, numSteps: 28, usedSchnell: false };
}

interface ReferenceMetadata {
  assetKind?: string;
  sourceType?: string;
}

const EXCLUDED_REFERENCE_PATTERNS = [
  /\/sceneKeyframes\//i,
  /\/backgrounds\//i,
  /\/locations\//i,
  /\/environments\//i,
  /\/keyframes\//i,
  /\/scene_/i,
  /\/env_/i,
  /\/bg_/i,
];

export function isValidCharacterReference(
  referenceUrl?: string | null,
  metadata?: ReferenceMetadata,
): { valid: boolean; reason: string } {
  if (!referenceUrl || referenceUrl.trim() === "") {
    return { valid: false, reason: "empty_url" };
  }

  if (metadata?.assetKind) {
    if (metadata.assetKind === "character_reference" || metadata.assetKind === "character_portrait") {
      return { valid: true, reason: "metadata_character" };
    }
    if (["scene_keyframe", "background", "location", "environment"].includes(metadata.assetKind)) {
      return { valid: false, reason: `metadata_excluded_${metadata.assetKind}` };
    }
  }

  for (const pattern of EXCLUDED_REFERENCE_PATTERNS) {
    if (pattern.test(referenceUrl)) {
      return { valid: false, reason: "url_pattern_excluded" };
    }
  }

  if (/\/characters\//i.test(referenceUrl)) {
    return { valid: true, reason: "url_characters_path" };
  }

  if (/\/portraits?\//i.test(referenceUrl) || /\/avatars?\//i.test(referenceUrl)) {
    return { valid: true, reason: "url_portrait_path" };
  }

  // P4.2 — Additional valid character reference patterns
  if (/\/face_?closeup/i.test(referenceUrl) || /_face\./i.test(referenceUrl)) {
    return { valid: true, reason: "url_face_closeup_path" };
  }

  if (/\/canon(ical)?_?ref/i.test(referenceUrl) || /_canon\./i.test(referenceUrl)) {
    return { valid: true, reason: "url_canonical_ref_path" };
  }

  // Allow URLs with explicit character ID or name patterns
  if (/\/char[_-]?[a-z0-9]+\//i.test(referenceUrl) || /\/[a-z]+_ref\./i.test(referenceUrl)) {
    return { valid: true, reason: "url_character_id_path" };
  }

  return { valid: false, reason: "no_character_signal" };
}

export function buildFalGenerationRequest(input: GenerateImageInput) {
  const contentLayer = typeof input.providerParams?.contentIntensityLayer === "string"
    ? input.providerParams.contentIntensityLayer
    : null;
  const isMature =
    contentLayer === "MATURE_DRAMA" ||
    contentLayer === "MATURE_VISUAL" ||
    contentLayer === "ADULT_EXPLICIT";
  const isExplicit = contentLayer === "ADULT_EXPLICIT";
  const isCover =
    String(input.providerParams?.mode ?? "").includes("COVER") ||
    String(input.providerParams?.mode ?? "").includes("LOCATION");
  const imageSize =
    typeof input.width === "number" && typeof input.height === "number"
      ? { width: input.width, height: input.height }
      : (isCover ? "landscape_4_3" : "portrait_4_3");
  const referencePolicy = describeReferencePolicy(input.providerParams?.referencePolicy);
  const panelCategory = typeof input.providerParams?.panelCategory === "string" ? input.providerParams.panelCategory : "CHARACTER_IN_SCENE";
  const scenePass = typeof input.providerParams?.scenePass === "string" ? input.providerParams.scenePass : "single_pass";
  const rerollKind = typeof input.providerParams?.rerollKind === "string" ? input.providerParams.rerollKind : null;
  const panelCriticality = typeof input.providerParams?.panelCriticality === "string" ? input.providerParams.panelCriticality : null;

  // COST-1 : résolution du modèle optimal (schnell vs dev selon criticité)
  const optimalModel = resolveOptimalFalModel(panelCriticality, panelCategory, referencePolicy, rerollKind, contentLayer);

  // PREMIUM H16 — bypass du prompt-translator sur le chemin premium v3.
  // Le builder `minimal-panel-prompt-builder` produit déjà un prompt
  // anglais court, structuré, non contradictoire. Le passer à
  // `optimizePromptForFal` le retraduit partiellement (token FR/EN
  // résiduels, troncatures aléatoires, mélange français/anglais dans les
  // adjectifs de couleur ou de lieu). Pour les panels v3, on passe
  // `providerParams.skipPromptTranslation = true`.
  const skipTranslation = input.providerParams?.skipPromptTranslation === true;
  const translatedPositive = skipTranslation
    ? input.positivePrompt
    : optimizePromptForFal(input.positivePrompt);
  const translatedNegative = skipTranslation
    ? (input.negativePrompt ?? "")
    : buildFalNegativePrompt(input.negativePrompt);
  const activeLoras = input.loras?.filter((l) => l.url) ?? [];
  const loraPromptPrefix = activeLoras.map((l) => l.triggerWord).filter(Boolean).join(", ");
  const promptWithLoras = loraPromptPrefix ? `${loraPromptPrefix}, ${translatedPositive}` : translatedPositive;
  const promptWithNeg = translatedNegative
    ? `${promptWithLoras}. Negative constraints: ${translatedNegative}`
    : promptWithLoras;
  const effectiveReferenceUrls = referencePolicy === "NONE" ? [] : (input.referenceImageUrls ?? []);
  const referenceUrl = effectiveReferenceUrls.length > 0 ? effectiveReferenceUrls[0] : null;
  // DIFF-4 : IP-Adapter multi-image.
  // Les modèles Fal compatibles (flux-pro/redux, flux-ip-adapter) acceptent une liste
  // d'image_urls pour pondérer simultanément plusieurs références (canon + closeup + action, etc.).
  // On dédoublonne, on limite à 4 (au-delà les poids diluent trop la direction), et on place la
  // ref principale en tête pour que les modèles qui lisent la première URL (cas redux classique)
  // gardent la même sortie qu'avant.
  const MAX_IP_ADAPTER_REFS = 4;
  const ipAdapterReferenceUrls = Array.from(new Set(effectiveReferenceUrls.filter(Boolean))).slice(0, MAX_IP_ADAPTER_REFS);
  const hasMultipleRefs = ipAdapterReferenceUrls.length > 1;
  const effectiveLoras =
    referencePolicy === "NONE"
      ? []
      : activeLoras.map((lora) => ({
          ...lora,
          scale: referencePolicy === "LIGHT" ? Math.min(0.55, lora.scale ?? 0.85) : lora.scale ?? 0.85,
        }));
  const useLora = effectiveLoras.length > 0;
  const referenceCheck = isValidCharacterReference(
    referenceUrl,
    typeof input.providerParams?.referenceMetadata === "object" ? input.providerParams.referenceMetadata as ReferenceMetadata : undefined,
  );
  const useRedux = !useLora && Boolean(referenceUrl) && referencePolicy === "STRONG" && panelCategory === "CHARACTER_LOCK" && referenceCheck.valid;

  if (panelCategory === "CHARACTER_LOCK" && referenceUrl && !referenceCheck.valid) {
    console.log(`[fal:redux-guard] Redux DISABLED — reason=${referenceCheck.reason} url=${referenceUrl?.slice(0, 80)} panelCategory=${panelCategory} → fallback text2img`);
  }

  const useLoraWithRef = useLora && Boolean(referenceUrl);
  const target = normalizeRequestedFalModel(
    typeof input.providerParams?.model === "string" ? input.providerParams.model : null,
    { useLora, useRedux },
    optimalModel,
  );

  const numSteps = target.numSteps ?? 28;
  // flux/schnell n'accepte pas guidance_scale — on l'omet pour ce modèle
  const isSchnell = target.model === FAL_MODEL_SCHNELL;
  const guidanceScale = isSchnell ? undefined : 3.9;

  let payload: Record<string, unknown>;
  const safetyFields = isMature
    ? { enable_safety_checker: false, safety_tolerance: "6" }
    : { enable_safety_checker: true };

  if (useLora) {
    payload = {
      prompt: promptWithNeg,
      image_size: imageSize,
      num_inference_steps: numSteps,
      ...(guidanceScale !== undefined ? { guidance_scale: guidanceScale } : {}),
      num_images: 1,
      ...safetyFields,
      output_format: "jpeg",
      loras: effectiveLoras.map((l) => ({
        path: l.url,
        scale: l.scale ?? 0.85,
      })),
    };
    if (useLoraWithRef && referenceUrl) {
      payload.image_url = referenceUrl;
      payload.strength = referencePolicy === "LIGHT" ? 0.28 : 0.55;
      // DIFF-4 : en LoRA + multi-ref, on expose aussi l'array complet. Les modèles
      // qui supportent l'IP-Adapter le consomment ; les autres ignorent silencieusement.
      if (hasMultipleRefs) {
        payload.image_urls = ipAdapterReferenceUrls;
        payload.reference_images = ipAdapterReferenceUrls;
      }
    }
  } else if (useRedux) {
    payload = {
      prompt: promptWithNeg,
      image_url: referenceUrl,
      image_size: imageSize,
      num_inference_steps: numSteps,
      ...(guidanceScale !== undefined ? { guidance_scale: guidanceScale } : {}),
      num_images: 1,
      ...safetyFields,
      output_format: "jpeg",
      strength: 0.7,
    };
    // DIFF-4 : même principe pour Redux — exposer l'array complet pour les déclinaisons
    // IP-Adapter (flux-pro/redux-ipa, flux-redux-multi).
    if (hasMultipleRefs) {
      payload.image_urls = ipAdapterReferenceUrls;
      payload.reference_images = ipAdapterReferenceUrls;
    }
  } else {
    payload = {
      prompt: promptWithNeg,
      image_size: imageSize,
      num_inference_steps: numSteps,
      ...(guidanceScale !== undefined ? { guidance_scale: guidanceScale } : {}),
      num_images: 1,
      ...safetyFields,
      output_format: "jpeg",
    };
  }

  if (typeof input.providerParams?.seed === "number") {
    payload.seed = input.providerParams.seed;
  }

  return {
    target,
    payload,
    referencePolicy,
    panelCategory,
    scenePass,
    imageSize,
    effectiveReferenceUrls,
    ipAdapterReferenceUrls,
    translatedPositive,
    translatedNegative,
    mode: (useLoraWithRef || useRedux) ? "img2img" : "text2img",
  } as const;
}

export async function runFalGenerationJob(apiKey: string | undefined, input: GenerateImageInput, strategy: "subscribe" | "submitAndPoll") {
  const client = createFalJobClient(apiKey);
  const request = buildFalGenerationRequest(input);
  console.log(
    `[fal] ${JSON.stringify({
      strategy,
      model: request.target.model,
      usedSchnell: request.target.usedSchnell ?? false,
      reduxEnabled: request.mode === "img2img" && request.target.model.includes("redux"),
      imageSize: typeof request.imageSize === "string" ? request.imageSize : `${request.imageSize.width}x${request.imageSize.height}`,
      referencePolicy: request.referencePolicy,
      panelCategory: request.panelCategory,
      scenePass: request.scenePass,
      refs: request.effectiveReferenceUrls,
      ipAdapterRefs: request.ipAdapterReferenceUrls,
      positivePrompt: input.positivePrompt,
      optimizedPrompt: request.translatedPositive,
      negativePrompt: request.translatedNegative,
    })}`,
  );

  const jobInput: FalJobClientInput = {
    model: request.target.model,
    mode: request.mode,
    input: request.payload,
    timeoutMs: typeof input.providerParams?.timeoutMs === "number" ? input.providerParams.timeoutMs : 180_000,
    pollIntervalMs: typeof input.providerParams?.pollIntervalMs === "number" ? input.providerParams.pollIntervalMs : 2_000,
    networkRetries: typeof input.providerParams?.networkRetries === "number" ? input.providerParams.networkRetries : 2,
    logs: true,
  };
  const result = strategy === "subscribe"
    ? await client.subscribe(jobInput)
    : await client.submitAndPoll(jobInput);
  if (!result.ok) {
    throw new Error(result.error ?? "fal_job_failed");
  }
  const imageUrl = result.outputUrls[0];
  if (!imageUrl) {
    throw new Error("fal.run: pas d'URL image dans la réponse");
  }
  const response: GenerateImageResult = {
    imageUrl,
    provider: "fal",
    model: result.model,
    requestId: result.requestId,
    jobId: result.jobId,
    timings: result.timings as unknown as Record<string, unknown>,
    raw: result.raw,
    seed: extractFalSeed(result.raw),
  };
  return response;
}

/**
 * Extrait le seed réellement consommé par FAL depuis le payload brut.
 *
 * FAL expose le seed selon plusieurs formes selon le modèle :
 *  - `{ seed: 12345 }` — flux/dev, flux/schnell, flux-lora, redux
 *  - `{ seeds: [12345] }` — certaines variantes multi-images
 *  - `{ data: { seed: 12345 } }` — réponses wrappées
 *
 * On persiste ce seed dans `MediaAsset.metadata.seed` côté appelant : cela permet
 * de relancer une génération strictement identique lors d'un retry déterministe
 * (cohérence perso / décor / PNJ à l'identique).
 */
export function extractFalSeed(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;

  const direct = root.seed;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && /^\d+$/.test(direct)) return Number(direct);

  const seeds = root.seeds;
  if (Array.isArray(seeds) && typeof seeds[0] === "number") return seeds[0];

  const data = root.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).seed;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
    if (typeof nested === "string" && /^\d+$/.test(nested)) return Number(nested);
  }

  return null;
}
