import {
  generateChapterBundle,
  runRoutedImageGeneration,
  composeMangaPanelPrompt,
  composeEnvironment,
  runChapterContinuityPass,
  runChapterNarrativeCoherencePass,
  buildTriggerWord,
  trainCharacterLora,
  detectVisualDrift,
  validateGeneratedPanel,
  parseIntentEntities,
  inferEntityProfile,
  resolveAdultEngine,
  buildCharacterPromptBundle,
  computeFalSceneAssessment,
  getFalImageSizePreset,
  getPremiumImageSize,
  directCombatPanel,
  validatePreflightPanel,
  inferGenreMode,
  getGenreDirectorConfig,
  directRomanceDramaScene,
  runPanelQualityGate,
  getMaxRerolls,
  type StoryboardPanel,
  type RoutingContext,
  type ProjectContextForChapter,
} from "@manga-ai-studio/ai";
import {
  buildLegacyApprovedOutlineFromStudio,
  chapterStudioSnapshotSchema,
  classifyPanelCriticality,
  getCharacterTierPolicy,
  parseApprovedOutline,
  resolveEffectiveProductionSource,
  resolveCharacterImportanceTier,
  resolveChapterLookProfile,
  type StableImageReference,
  type PanelCharacterPlan,
  type ChapterLookProfile,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import {
  buildPanelIntentCard,
  buildSceneAnchor,
  type PanelIntentCard,
  type SceneAnchor,
} from "@manga-ai-studio/ai";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  buildProjectContext,
  detectCanonWarnings,
  ensureSceneExtras,
  persistChapterMemory,
  replaceRagDocument,
} from "@manga-ai-studio/memory";
import {
  buildChapterCanonState,
  buildChapterSnapshot,
  buildSceneSnapshot,
  persistChapterCanonState,
  buildSceneState,
  deriveSceneEvents,
  loadContinuityKernel,
  materializeCanonStateFromChapterSnapshot,
  persistSceneState,
  persistValidatedSceneContinuity,
  runContinuityDiff,
  validateSceneSnapshotAgainstKernel,
  applySceneEventsToKernel,
  type CharacterState,
} from "@manga-ai-studio/continuity";
import { scoreVisualConsistency } from "@manga-ai-studio/visual-consistency";
import { buildSceneBlueprint, type CreativityControls, type SceneBlueprint } from "@manga-ai-studio/world";
import { createClient } from "@supabase/supabase-js";
import { buildPanelContract } from "./build-panel-contract";
import {
  buildPersistedChapterRuntimeState,
  buildRuntimeDebugSummary,
  buildValidationDetails as buildSharedValidationDetails,
  computeChapterQualityReport as computeChapterQualityReportShared,
} from "./chapter-runtime-helpers";
import { buildStableImageReference, resolveStableImageReferences } from "./stable-image-refs";

type JobStep = {
  key: string;
  label: string;
  status?: "queued" | "running" | "completed" | "failed";
  detail?: string;
};

type PlannedImage = {
  sceneImageId: string;
  panel: StoryboardPanel;
  sceneIndex: number;
  baseMetadata: Record<string, unknown>;
};

type PipelineJobInput = {
  focusCharacterIds?: string[];
  selectedPlotLabel?: "safe" | "bold" | "shock";
  creativityControls?: Partial<CreativityControls>;
  /** Blueprints premium passés depuis pipeline/route.ts */
  panelBlueprints?: unknown[];
  /** Plan de production premium complet */
  productionPlan?: unknown;
  /** Score de readiness premium */
  premiumReadinessScore?: number;
};

type PipelineBundle = Awaited<ReturnType<typeof generateChapterBundle>>;

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";
const PANEL_DRAFT_SIZE = getPremiumImageSize("PANEL_DRAFT");

function buildPanelCharacterPlan(input: {
  panelId: string;
  panel: StoryboardPanel;
  sceneCharacters: string[];
  shotType?: string;
  purpose?: string;
}): PanelCharacterPlan {
  const characters = input.panel.characters ?? [];
  const foregroundCharacters =
    input.shotType === "wide"
      ? characters.slice(0, 1)
      : input.shotType === "closeup" || input.shotType === "extreme_closeup"
        ? characters.slice(0, 1)
        : characters.slice(0, 2);
  const midgroundCharacters =
    input.shotType === "wide"
      ? characters.slice(1, 3)
      : input.shotType === "over_shoulder"
        ? characters.slice(0, 2)
        : characters.slice(1, 3);
  const backgroundCharacters = input.sceneCharacters.filter((name) => !foregroundCharacters.includes(name) && !midgroundCharacters.includes(name));
  return {
    panelId: input.panelId,
    foregroundCharacters,
    midgroundCharacters,
    backgroundCharacters,
    faceVisibilityExpected:
      input.shotType === "closeup" || input.shotType === "extreme_closeup"
        ? "priority"
        : input.shotType === "medium"
          ? "clear"
          : input.shotType === "over_shoulder"
            ? "partial"
            : "none",
    actionIntensity:
      input.purpose === "action"
        ? "high"
        : input.purpose === "reaction" || input.purpose === "dialogue"
          ? "low"
          : "medium",
    speakingPriority: (input.panel.dialogues ?? [])
      .map((dialogue) => dialogue.speaker)
      .concat(input.panel.dialogue?.speaker ? [input.panel.dialogue.speaker] : [])
      .filter((speaker, index, all) => Boolean(speaker) && all.indexOf(speaker) === index),
  };
}

function buildSceneKeyframeDraft(input: {
  sceneId: string;
  scene: { summary: string; location: string; characters: string[]; purpose?: string | null };
  sceneBlueprint: SceneBlueprint;
  stylePack?: {
    renderFamily?: string | null;
    lineWeight?: string | null;
    shadingMode?: string | null;
    contrastProfile?: string | null;
    backgroundDensity?: string | null;
    cameraLanguage?: string | null;
  } | null;
  persistentSceneExtras: Array<{ archetype: string; anchorSlot: string }>;
}) {
  const styleLine = [
    input.stylePack?.renderFamily,
    input.stylePack?.lineWeight,
    input.stylePack?.shadingMode,
    input.stylePack?.contrastProfile,
  ].filter(Boolean).join(", ");
  const extrasLine = input.persistentSceneExtras
    .map((extra) => `${extra.archetype}:${extra.anchorSlot}`)
    .slice(0, 5)
    .join(", ");
  const positivePrompt = [
    styleLine || "premium manga scene keyframe",
    "establishing scene keyframe",
    `location: ${input.scene.location}`,
    input.sceneBlueprint.promptBridge.sceneContextLine,
    input.sceneBlueprint.promptBridge.environmentLine,
    `characters present: ${input.scene.characters.join(", ")}`,
    input.scene.purpose ? `scene purpose: ${input.scene.purpose}` : "",
    input.scene.summary,
    extrasLine ? `persistent extras: ${extrasLine}` : "",
    "clear environment, readable architecture, balanced foreground midground background",
  ].filter(Boolean).join(", ");
  const negativePrompt = [
    "empty background",
    "studio backdrop",
    "isolated portrait",
    "blurred environment",
  ].join(", ");
  return {
    positivePrompt,
    negativePrompt,
    environmentLock: {
      location: input.scene.location,
      summary: input.scene.summary,
      extras: input.persistentSceneExtras,
      requiredSignals: parseIntentEntities(`${input.scene.location} ${input.scene.summary}`, []).map((entity) => entity.name).slice(0, 6),
    },
    compositionArchetype: input.scene.purpose?.toLowerCase().includes("fight") ? "combat_establishing" : "story_scene",
    involvedCharacterNames: input.scene.characters,
  };
}

function extractSceneFactions(text: string) {
  const normalized = text.toLowerCase();
  const factions = [
    "guilde",
    "guild",
    "armée",
    "army",
    "rebelles",
    "rebels",
    "survivors",
    "survivants",
    "corporation",
    "ordre",
    "clan",
  ];
  return factions.filter((item) => normalized.includes(item));
}

function inferSceneWeather(text: string) {
  const normalized = text.toLowerCase();
  if (/(pluie|rain|orage|storm)/.test(normalized)) return "rain";
  if (/(neige|snow|blizzard)/.test(normalized)) return "snow";
  if (/(poussière|dust|cendres|ash)/.test(normalized)) return "dust";
  if (/(brouillard|mist|fog)/.test(normalized)) return "mist";
  return null;
}

function inferSceneTimeOfDay(text: string) {
  const normalized = text.toLowerCase();
  if (/(nuit|night|moon)/.test(normalized)) return "night";
  if (/(aube|dawn|sunrise)/.test(normalized)) return "dawn";
  if (/(soir|sunset|crépuscule|coucher du soleil)/.test(normalized)) return "sunset";
  return "day";
}

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Préférer service role key, fallback sur anon key (bucket public)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isHttpImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isAlreadyStableStorageUrl(url: string) {
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseBase && url.startsWith(supabaseBase)) return true;
  return false;
}

function isDataUrl(url: string) {
  return url.startsWith("data:image/");
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Résout les panel blueprints premium effectifs pour un panel donné.
 * Priorité : job.input.panelBlueprints > studioSnapshot.productionPlan.panelBlueprints > null
 * Fallback : null (le pipeline utilisera les heuristiques génériques)
 */
function resolveEffectivePanelBlueprints(opts: {
  jobInput: PipelineJobInput;
  studioSnapshot: { data?: { productionPlan?: { panelBlueprints?: unknown[] } } } | null;
}): PanelBlueprintPremium[] {
  // Priorité 1 : blueprints passés explicitement dans le job input
  if (Array.isArray(opts.jobInput.panelBlueprints) && opts.jobInput.panelBlueprints.length > 0) {
    return opts.jobInput.panelBlueprints as PanelBlueprintPremium[];
  }
  // Priorité 2 : blueprints depuis le snapshot studio persisté
  const snapshotBlueprints = opts.studioSnapshot?.data?.productionPlan?.panelBlueprints;
  if (Array.isArray(snapshotBlueprints) && snapshotBlueprints.length > 0) {
    return snapshotBlueprints as PanelBlueprintPremium[];
  }
  return [];
}

/**
 * Trouve le blueprint premium correspondant à un panel donné (par beatId/sceneIndex + panelNumber).
 */
function findPanelBlueprint(
  blueprints: PanelBlueprintPremium[],
  sceneIndex: number,
  panelNumber: number,
): PanelBlueprintPremium | undefined {
  // Correspondance par panelNumber dans l'ordre des blueprints pour ce beat
  const beatBlueprints = blueprints.filter((bp) => {
    const bpBeatIndex = parseInt(bp.beatId?.split("_")[1] ?? "0", 10) - 1;
    return bpBeatIndex === sceneIndex;
  });
  return beatBlueprints[panelNumber - 1] ?? beatBlueprints[0];
}

function normalizeCreativeControls(
  value: Partial<CreativityControls> | undefined,
  canonStrictness: number | null | undefined,
): CreativityControls {
  const input = value ?? {};
  const clamp = (raw: number | undefined, fallback: number) =>
    Math.max(0, Math.min(100, Number.isFinite(raw) ? Number(raw) : fallback));
  return {
    noveltyLevel: clamp(input.noveltyLevel, 55),
    worldStrictness: clamp(input.worldStrictness, canonStrictness ?? 85),
    visualExoticism: clamp(input.visualExoticism, 50),
    npcVariety: clamp(input.npcVariety, 60),
    environmentRichness: clamp(input.environmentRichness, 78),
  };
}

function looksLikeBflDelivery(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.startsWith("delivery-") && u.hostname.endsWith(".bfl.ai");
  } catch {
    return false;
  }
}

async function persistImageIfNeeded(opts: {
  imageUrl: string;
  projectId: string;
  chapterId: string;
  sceneImageId: string;
}) {
  const client = getStorageClient();

  const canPersistHttp =
    isHttpImageUrl(opts.imageUrl) && !looksLikeBflDelivery(opts.imageUrl) && !isAlreadyStableStorageUrl(opts.imageUrl);
  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl) || canPersistHttp;
  if (!mustPersist) return { ok: true as const, url: opts.imageUrl, persisted: false as const };

  if (!client) {
    console.warn(`[pipeline:persist] WARN no Supabase client (NEXT_PUBLIC_SUPABASE_URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL} SERVICE_ROLE=${!!process.env.SUPABASE_SERVICE_ROLE_KEY}) – storing temporary FAL URL for ${opts.sceneImageId}`);
    return {
      ok: true as const,
      url: opts.imageUrl,
      persisted: false as const,
      temporary: true as const,
      warning: "Stockage non configuré. Image temporaire: elle peut expirer.",
    };
  }

  let bytes: Uint8Array;
  let contentType = "image/jpeg";

  if (isDataUrl(opts.imageUrl)) {
    const commaIdx = opts.imageUrl.indexOf(",");
    if (commaIdx <= 0) return { ok: false as const, error: "data URL invalide" };
    const header = opts.imageUrl.slice(0, commaIdx);
    const b64 = opts.imageUrl.slice(commaIdx + 1);
    const ct = header.split(";")[0]?.slice("data:".length);
    if (ct?.startsWith("image/")) contentType = ct;
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } else {
    const res = await fetch(opts.imageUrl);
    if (!res.ok) return { ok: false as const, error: `download failed ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    bytes = buf;
    const ct = res.headers.get("content-type");
    if (ct?.startsWith("image/")) contentType = ct;
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filePath = `projects/${opts.projectId}/chapters/${opts.chapterId}/panels/${opts.sceneImageId}.${ext}`;

  // Essayer plusieurs buckets dans l'ordre de préférence
  const bucketsToTry = [
    process.env.STORAGE_BUCKET,
    "MyManga",
    "mymanga-images",
    "manga-images",
  ].filter(Boolean) as string[];

  // Dédupliquer
  const uniqueBuckets = [...new Set(bucketsToTry)];

  for (const bucket of uniqueBuckets) {
    // Tenter de créer le bucket s'il n'existe pas (ignore l'erreur si déjà existant)
    try {
      await client.storage.createBucket(bucket, { public: false });
    } catch { /* bucket existe déjà, c'est ok */ }

    const up = await client.storage.from(bucket).upload(filePath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });

    if (up.error) {
      console.warn(`[pipeline:persist] bucket=${bucket} failed: ${up.error.message}`);
      continue;
    }

    const publicUrl = client.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    console.log(`[pipeline:persist] OK bucket=${bucket} → ${publicUrl.slice(0, 80)}`);
    return { ok: true as const, url: publicUrl, persisted: true as const };
  }

  // Tous les buckets ont échoué → mode dégradé avec URL temporaire FAL
  console.error(`[pipeline:persist] All buckets failed for ${opts.sceneImageId} – using temporary FAL URL`);
  return { ok: true as const, url: opts.imageUrl, persisted: false as const, temporary: true as const, warning: "all_buckets_failed" };
}

async function setJobProgress(jobId: string, step: JobStep, status: "running" | "completed" | "failed") {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const output = (job.output as Record<string, unknown>) ?? {};
  const previousSteps = Array.isArray(output.steps) ? (output.steps as JobStep[]) : [];
  const nextSteps = [
    ...previousSteps.filter((existing) => existing.key !== step.key),
    { ...step, status },
  ];
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: status === "running" ? (job.startedAt ?? new Date()) : job.startedAt,
      output: {
        ...output,
        currentStep: step.key,
        steps: nextSteps,
      },
    },
  });
}

async function mergeJobOutput(jobId: string, patch: Record<string, unknown>) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const output = (job.output as Record<string, unknown>) ?? {};
  await prisma.job.update({
    where: { id: jobId },
    data: {
      output: ({
        ...output,
        ...patch,
      } as unknown) as Prisma.InputJsonValue,
    },
  });
}

function buildRoutingContext(
  intensityLayer: string,
  panel: StoryboardPanel,
  panelContract: {
    purpose?: string;
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    cameraAngle?: string;
    npcPresence?: string[];
    npcGroupPresence?: string[];
    creaturePresence?: string[];
    mustShowLocationSignals?: string[];
  } | undefined,
  stylePack: { backgroundDensity?: string | null } | null | undefined,
  hasCanonRef: boolean,
  adultEngine?: "realistic" | "fantasy",
  panelCharacterRoles: string[] = [],
  panelCharacterImportanceTiers: Array<"MAIN_HERO" | "SECONDARY_CORE" | "IMPORTANT_SUPPORTING_CHARACTER" | "RECURRING_NPC" | "BACKGROUND_EXTRA"> = [],
  chapterLookProfileMode?: string | null,
  beatEventType?: string | null,
): RoutingContext {
  const text = `${panel.camera} ${panel.caption} ${panel.prompt}`.toLowerCase();
  const heroPresent = panelCharacterRoles.some((role) => /hero|protagon|main_hero|héros|heros/i.test(role));
  const shotType = panelContract?.shotType ?? (/(wide|establishing|panorama|vue d'ensemble)/.test(text)
    ? "wide"
    : /(over shoulder|over-shoulder|par-dessus l'épaule)/.test(text)
      ? "over_shoulder"
      : /(extreme close)/.test(text)
        ? "extreme_closeup"
        : /(close-up|closeup|gros plan)/.test(text)
          ? "closeup"
          : "medium");
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    adultEngine,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
    characterCountInScene: panel.characters.length,
    panelCharacterRoles,
    panelCharacterImportanceTiers,
    heroPresent,
    heroFocus: heroPresent && (shotType === "closeup" || shotType === "extreme_closeup"),
    purpose: panelContract?.purpose,
    npcCount: (panelContract?.npcPresence?.length ?? 0) > 0 || /(crowd|guard|merchant|passant|client|audience|foule|garde)/.test(text) ? 1 : 0,
    creatureCount: (panelContract?.creaturePresence?.length ?? 0) > 0 || /(creature|monster|spirit|dragon|familiar|beast|mutant)/.test(text) ? 1 : 0,
    hasNpcGroup: (panelContract?.npcGroupPresence?.length ?? 0) > 0,
    hasCreatureGroup: (panelContract?.creaturePresence?.length ?? 0) > 1,
    shotType,
    cameraAngle: panelContract?.cameraAngle,
    environmentPriority:
      (panelContract?.mustShowLocationSignals?.length ?? 0) >= 2
      || /(environment|decor|décor|background|ruins|city|forest|garden|lab|arena|crowd|school|campus|courtyard)/.test(text)
        ? "high"
        : panel.characters.length >= 2
          ? "medium"
          : "low",
    locationComplexity: Math.min(30, (panelContract?.mustShowLocationSignals?.length ?? 0) * 6),
    environmentDensityRequired:
      stylePack?.backgroundDensity === "high" || (panelContract?.shotType === "wide")
        ? "high"
        : stylePack?.backgroundDensity === "low"
          ? "low"
          : "medium",
    continuityWeight: hasCanonRef ? 70 : 35,
    scenePurpose: panel.caption,
    styleBackgroundDensity: stylePack?.backgroundDensity ?? null,
    styleReferenceRequired: hasCanonRef || /(style|render family|ink|shading)/.test(text),
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature:
      intensityLayer === "MATURE_DRAMA" ||
      intensityLayer === "MATURE_VISUAL" ||
      intensityLayer === "ADULT_EXPLICIT",
    chapterLookProfileMode: chapterLookProfileMode ?? null,
    beatEventType: beatEventType ?? null,
  };
}

function inferRequiredSceneExtras(scene: {
  summary: string;
  location: string;
  characters: string[];
}) {
  const text = `${scene.summary} ${scene.location}`.toLowerCase();
  const extras: Array<{ archetype: "bartender" | "client" | "guard" | "server" | "crowd" | "merchant" | "passerby" | "other"; anchorSlot: string }> = [];
  if (/(taverne|bar|auberge|café|cafe)/.test(text)) {
    extras.push({ archetype: "bartender", anchorSlot: "service-counter" });
    extras.push({ archetype: "client", anchorSlot: "ambient-left" });
  }
  if (/(marché|market|bazaar|boutique)/.test(text)) {
    extras.push({ archetype: "merchant", anchorSlot: "stall-front" });
    extras.push({ archetype: "passerby", anchorSlot: "lane-depth" });
  }
  if (/(prison|surveillance|checkpoint|guard|garde|palais|banque)/.test(text)) {
    extras.push({ archetype: "guard", anchorSlot: "security-edge" });
  }
  if (/(arène|arena|foule|crowd|festival)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "backdrop-crowd" });
  }
  if (/(lycée|lycee|école|ecole|school|campus|cour de récré|cour du lycée|classe)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "student-yard" });
    extras.push({ archetype: "passerby", anchorSlot: "corridor-depth" });
  }
  if (/(moque|ridicul|humili|entouré de ses amis|autour de ses amis|raillerie)/.test(text)) {
    extras.push({ archetype: "crowd", anchorSlot: "mocking-ring" });
  }
  if (extras.length === 0 && scene.characters.length <= 2) {
    extras.push({ archetype: "passerby", anchorSlot: "ambient-depth" });
  }
  return extras.slice(0, 3);
}

function computeChapterQualityReport(
  rows: Array<{
    consistencyScore: number | null;
    metadata: unknown;
  }>,
) {
  return computeChapterQualityReportShared(rows);
}

type LoadedLoraAttachment = {
  id: string;
  enabled: boolean;
  weight: number;
  characterId: string | null;
  lora: {
    id: string;
    name: string;
    status: string;
    weightsMeta: unknown;
  };
};

type LoadedCharacterForPipeline = {
  id: string;
  name: string;
  roleType?: string | null;
  objective?: string | null;
  fear?: string | null;
  biography?: string | null;
  traits?: string[];
  flaws?: string[];
  gender: string | null;
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  outfitDefault: string | null;
  canonicalImageUrl: string | null;
  canonSignatureText: string | null;
  forbiddenVisualDrift: unknown;
  bodyDetails: string | null;
  wardrobeDetails: string | null;
  visualProfile: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  speechProfile?: Record<string, unknown>;
  continuityProfile?: Record<string, unknown>;
  characterFingerprint?: Record<string, unknown> | null;
  visualRefUrls: string[];
  entityKind?: string | null;
  speciesLabel?: string | null;
  dialogueMode?: string | null;
  recurrencePolicy?: string | null;
};

async function queueAutoLoraTrainingIfEligible(input: {
  projectId: string;
  characters: LoadedCharacterForPipeline[];
  loraAttachments: LoadedLoraAttachment[];
}) {
  const readyByCharId = new Set<string>();
  const trainingByCharId = new Set<string>();

  for (const att of input.loraAttachments) {
    if (!att.characterId) continue;
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const hasWeights = typeof meta.loraUrl === "string" && meta.loraUrl.length > 0;
    if (att.enabled && att.lora.status === "active" && hasWeights) {
      readyByCharId.add(att.characterId);
      continue;
    }
    if (att.lora.status === "training" || att.lora.status === "queued") {
      trainingByCharId.add(att.characterId);
    }
  }

  const candidates = input.characters
    .filter((c) => c.visualRefUrls.length >= 3)
    .filter((c) => !readyByCharId.has(c.id))
    .filter((c) => !trainingByCharId.has(c.id))
    .slice(0, 2);

  if (candidates.length === 0) return 0;

  for (const candidate of candidates) {
    const triggerWord = buildTriggerWord(candidate.name, input.projectId);
    const seedRefs = candidate.visualRefUrls.slice(0, 20);
    const lora = await prisma.loraModel.create({
      data: {
        projectId: input.projectId,
        provider: "fal",
        externalId: triggerWord,
        name: `LoRA ${candidate.name}`,
        status: "training",
        weightsMeta: {
          autoQueued: true,
          triggerWord,
          characterId: candidate.id,
          imageCount: seedRefs.length,
          queuedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.loraAttachment.create({
      data: {
        loraId: lora.id,
        projectId: input.projectId,
        characterId: candidate.id,
        weight: 1,
        enabled: false,
      },
    });

    console.log(`[auto-lora] queued character=${candidate.name} refs=${seedRefs.length}`);

    void (async () => {
      const result = await trainCharacterLora({
        prisma,
        projectId: input.projectId,
        characterId: candidate.id,
        characterName: candidate.name,
        triggerWord,
        imageUrls: seedRefs,
        imageTypes: seedRefs.map(() => "generated_primary"),
        steps: 300,
      });
      if (!result.ok) {
        await prisma.loraModel.update({
          where: { id: lora.id },
          data: {
            status: "error",
            weightsMeta: {
              autoQueued: true,
              triggerWord,
              characterId: candidate.id,
              imageCount: seedRefs.length,
              error: result.error ?? "training_failed",
              readiness: result.readiness ?? null,
              failedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        console.error(`[auto-lora] failed character=${candidate.name} error=${result.error ?? "unknown"}`);
        return;
      }

      await prisma.loraModel.update({
        where: { id: lora.id },
        data: {
          status: "active",
          weightsMeta: {
            autoQueued: true,
            triggerWord,
            characterId: candidate.id,
            imageCount: seedRefs.length,
            loraUrl: result.loraUrl,
            configUrl: result.configUrl ?? null,
            requestId: result.requestId ?? null,
            jobId: result.jobId ?? null,
            previewImages: result.previewImages ?? [],
            trainingAssetId: result.trainingAssetId ?? null,
            readiness: result.readiness ?? null,
            trainedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await prisma.loraAttachment.updateMany({
        where: { loraId: lora.id, characterId: candidate.id, projectId: input.projectId },
        data: { enabled: true, weight: 1 },
      });
      console.log(`[auto-lora] ready character=${candidate.name}`);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : "auto_lora_background_error";
      console.error(`[auto-lora] background crash character=${candidate.name} error=${message}`);
    });
  }

  return candidates.length;
}

function syncVisualsAfterNarrativePass(bundle: PipelineBundle): PipelineBundle {
  const pages = bundle.storyboard.pages;
  const scenes = bundle.script.scenes;
  const beats = bundle.outline.beats;

  const ROLE_CAMERAS: Record<string, string[]> = {
    establishing: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    escalation: ["medium shot", "over-the-shoulder shot", "close-up on face", "low angle shot", "medium shot", "extreme close-up on eyes"],
    confrontation: ["medium shot", "close-up on face", "low angle dynamic shot", "extreme close-up on eyes", "over-the-shoulder shot", "dutch angle shot"],
    revelation: ["medium shot", "slow zoom close-up", "extreme close-up shocked eyes", "wide shot consequences", "over-the-shoulder shot", "high angle distant shot"],
    aftermath: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    cliffhanger: ["medium shot", "close-up on face", "low angle shot", "extreme close-up on eyes", "silhouette shot", "dramatic wide shot"],
  };

  const updatedPages = pages.map((page, pageIndex) => {
    const scene = scenes[pageIndex];
    const beat = beats[pageIndex];
    if (!scene || !beat) return page;

    const beatRaw = beat as Record<string, unknown>;
    const role = (typeof beatRaw.pageRole === "string" ? beatRaw.pageRole : "escalation") as string;
    const roleCams = ROLE_CAMERAS[role] ?? ROLE_CAMERAS.escalation;

    const updatedPanels = page.panels.map((panel, panelIndex) => {
      const camera = roleCams[panelIndex] ?? roleCams[panelIndex % roleCams.length] ?? "medium shot";
      return { ...panel, camera };
    });

    return { ...page, panels: updatedPanels };
  });

  return {
    ...bundle,
    storyboard: { ...bundle.storyboard, pages: updatedPages },
  };
}

function enforceBundleIntegrity(bundle: PipelineBundle): { bundle: PipelineBundle; notes: string[] } {
  const notes: string[] = [];
  const scenes = [...bundle.script.scenes];
  const pages = [...bundle.storyboard.pages];

  const alignedCount = Math.min(scenes.length, pages.length);
  if (scenes.length !== pages.length) {
    notes.push(`alignment_fixed: scenes=${scenes.length} pages=${pages.length} => ${alignedCount}`);
  }

  const safeScenes = scenes.slice(0, alignedCount);
  const safePages = pages.slice(0, alignedCount).map((page, pageIndex) => {
    const scene = safeScenes[pageIndex];
    const originalPanels = Array.isArray(page.panels) ? page.panels : [];
    const normalizedPanels = originalPanels
      .slice(0, 6)
      .map((panel, panelIndex) => {
        const speaker = panel.dialogue?.speaker?.trim();
        const normalizedCharacters = [...new Set((panel.characters ?? []).filter(Boolean))];
        if (speaker && !/narrateur|narration/i.test(speaker)) {
          const hasSpeaker = normalizedCharacters.some((c) => c.toLowerCase() === speaker.toLowerCase());
          if (!hasSpeaker) normalizedCharacters.push(speaker);
        }
        return {
          ...panel,
          panelNumber: panelIndex + 1,
          sceneId: scene?.id ?? panel.sceneId,
          characters: normalizedCharacters.length > 0 ? normalizedCharacters : (scene?.characters ?? []),
        };
      });

    if (normalizedPanels.length < 4 && scene) {
      notes.push(`panel_floor_applied: page=${pageIndex + 1}`);
      while (normalizedPanels.length < 4) {
        const fallbackPanel = normalizedPanels[normalizedPanels.length - 1] ?? normalizedPanels[0];
        if (fallbackPanel) {
          normalizedPanels.push({
            ...fallbackPanel,
            panelNumber: normalizedPanels.length + 1,
            caption: `${scene.summary}`,
            dialogue: undefined,
            narration: scene.summary,
          });
        } else {
          normalizedPanels.push({
            panelNumber: normalizedPanels.length + 1,
            sceneId: scene.id,
            beatId: `fallback_${pageIndex + 1}_${normalizedPanels.length + 1}`,
            caption: scene.summary,
            prompt: scene.summary,
            negativePrompt: "",
            camera: "medium shot",
            characters: scene.characters.slice(0, 2),
            mood: "dramatic",
            narration: scene.summary,
            textScale: "normal",
          });
        }
      }
    }

    return {
      ...page,
      pageNumber: pageIndex + 1,
      panels: normalizedPanels,
    };
  });

  return {
    bundle: {
      ...bundle,
      script: { ...bundle.script, scenes: safeScenes },
      storyboard: {
        ...bundle.storyboard,
        pageCount: safePages.length,
        pages: safePages,
      },
    },
    notes,
  };
}

export async function runFullChapterPipelineFromJob(jobId: string) {
  // Diagnostic de configuration au démarrage du pipeline
  console.log(`[pipeline:config] SUPABASE_URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL} SERVICE_ROLE=${!!process.env.SUPABASE_SERVICE_ROLE_KEY} ANON_KEY=${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} BUCKET=${process.env.STORAGE_BUCKET ?? "(default:MyManga)"}`);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || !job.chapterId || !job.projectId) {
    return { ok: false as const, error: "invalid_job" };
  }

  const [chapter, project, stylePacks, loraAttachments, rawCharacters, npcProfiles, propInventory] = await Promise.all([
    prisma.chapter.findUnique({ where: { id: job.chapterId } }),
    prisma.project.findUnique({
      where: { id: job.projectId },
      include: { settings: true },
    }),
    prisma.stylePack.findMany({
      where: { projectId: job.projectId },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    // Charger tous les LoRAs liés au projet (actifs + en entraînement)
    prisma.loraAttachment.findMany({
      where: { projectId: job.projectId },
      include: { lora: true },
    }),
    prisma.character.findMany({
      where: { projectId: job.projectId },
      include: {
        canonPack: true,
        visualRefs: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          take: 20,
          select: {
            id: true,
            imageUrl: true,
            isPrimary: true,
            metadata: true,
            mediaAssetId: true,
            mediaAsset: {
              select: {
                id: true,
                storageProvider: true,
                bucket: true,
                storageKey: true,
                publicUrl: true,
                signedUrl: true,
                falCdnUrl: true,
                sha256: true,
                metadata: true,
              },
            },
          },
        },
      },
    }).then(async (chars) => {
      const canonRefs: Record<string, StableImageReference> = {};
      for (const c of chars) {
        const primaryRef = c.visualRefs.find((v) => v.isPrimary && (v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey));
        const bestRef = primaryRef ?? c.visualRefs.find((v) => v.imageUrl || v.mediaAssetId || v.mediaAsset?.storageKey);
        if (bestRef) {
          const stableRef = buildStableImageReference({
            assetId: bestRef.mediaAsset?.id ?? bestRef.mediaAssetId ?? null,
            storageProvider: bestRef.mediaAsset?.storageProvider ?? null,
            bucket: bestRef.mediaAsset?.bucket ?? null,
            storageKey: bestRef.mediaAsset?.storageKey ?? null,
            publicUrl: bestRef.mediaAsset?.publicUrl ?? bestRef.imageUrl,
            signedUrl: bestRef.mediaAsset?.signedUrl ?? null,
            falCdnUrl: bestRef.mediaAsset?.falCdnUrl ?? null,
            sourceUrl: bestRef.imageUrl,
            sourceType: bestRef.mediaAssetId ? "media_asset" : "character_visual_ref",
            checksum: bestRef.mediaAsset?.sha256 ?? null,
            metadata:
              bestRef.metadata && typeof bestRef.metadata === "object"
                ? (bestRef.metadata as Record<string, unknown>)
                : {},
          });
          if (stableRef) {
            canonRefs[c.id] = stableRef;
          }
        }
      }
      return chars.map((c) => {
        const raw = c as unknown as Record<string, unknown>;
        const bodyState = raw.bodyState && typeof raw.bodyState === "object" ? raw.bodyState as Record<string, unknown> : {};
        const wardrobeProfile = raw.wardrobeProfile && typeof raw.wardrobeProfile === "object" ? raw.wardrobeProfile as Record<string, unknown> : {};
        const visualProfile = raw.visualProfile && typeof raw.visualProfile === "object" ? raw.visualProfile as Record<string, unknown> : {};
        const continuityProfile = raw.continuityProfile && typeof raw.continuityProfile === "object" ? raw.continuityProfile as Record<string, unknown> : {};

        // Construire une description corporelle compacte depuis bodyState
        const bodyParts: string[] = [];
        if (bodyState.height) bodyParts.push(String(bodyState.height));
        if (bodyState.build) bodyParts.push(String(bodyState.build));
        if (bodyState.scars) bodyParts.push(`scars: ${String(bodyState.scars)}`);
        if (bodyState.prosthetics) bodyParts.push(`prosthetic: ${String(bodyState.prosthetics)}`);
        if (bodyState.tattoos) bodyParts.push(`tattoo: ${String(bodyState.tattoos)}`);
        if (bodyState.injuries) bodyParts.push(`injury: ${String(bodyState.injuries)}`);
        if (bodyState.modifications) bodyParts.push(String(bodyState.modifications));
        const bodyDetails = bodyParts.join(", ") || null;

        // Construire une description vestimentaire compacte
        const wardrobeParts: string[] = [];
        if (wardrobeProfile.defaultOutfit) wardrobeParts.push(String(wardrobeProfile.defaultOutfit));
        if (wardrobeProfile.accessories) wardrobeParts.push(String(wardrobeProfile.accessories));
        if (wardrobeProfile.armor) wardrobeParts.push(String(wardrobeProfile.armor));
        if (wardrobeProfile.weapons) wardrobeParts.push(String(wardrobeProfile.weapons));
        const wardrobeDetails = wardrobeParts.join(", ") || null;

        return {
          id: c.id,
          name: c.name,
          roleType: typeof raw.roleType === "string" ? raw.roleType : null,
          objective: typeof raw.objective === "string" ? raw.objective : null,
          fear: typeof raw.fear === "string" ? raw.fear : null,
          biography: typeof raw.biography === "string" ? raw.biography : null,
          traits: Array.isArray(raw.traits) ? raw.traits.filter((item): item is string => typeof item === "string") : [],
          flaws: Array.isArray(raw.flaws) ? raw.flaws.filter((item): item is string => typeof item === "string") : [],
          gender: typeof raw.gender === "string" ? raw.gender : null,
          appearance: typeof raw.appearance === "string" ? raw.appearance : null,
          hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
          eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
          outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
          canonicalImageUrl: canonRefs[c.id]?.sourceUrl ?? canonRefs[c.id]?.publicUrl ?? null,
          canonicalReference: canonRefs[c.id] ?? null,
          canonSignatureText: c.canonPack?.visualSignatureText ?? null,
          forbiddenVisualDrift: c.canonPack?.forbiddenVisualDrift ?? null,
          bodyDetails,
          wardrobeDetails,
          visualProfile,
          bodyState,
          wardrobeProfile,
          speechProfile: raw.speechProfile && typeof raw.speechProfile === "object" ? raw.speechProfile as Record<string, unknown> : {},
          continuityProfile,
          characterFingerprint:
            raw.characterFingerprint && typeof raw.characterFingerprint === "object"
              ? raw.characterFingerprint as Record<string, unknown>
              : null,
          visualRefUrls: c.visualRefs.map((v) => v.imageUrl).filter(Boolean),
          entityKind: typeof continuityProfile.entityKind === "string" ? continuityProfile.entityKind : null,
          speciesLabel: typeof continuityProfile.speciesLabel === "string" ? continuityProfile.speciesLabel : null,
          dialogueMode: typeof continuityProfile.dialogueMode === "string" ? continuityProfile.dialogueMode : null,
          recurrencePolicy: typeof continuityProfile.recurrencePolicy === "string" ? continuityProfile.recurrencePolicy : null,
        };
      });
    }),
    prisma.npcVisualProfile.findMany({
      where: {
        projectId: job.projectId ?? undefined,
        characterId: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }, { appearanceCount: "desc" }],
      select: {
        characterId: true,
        importanceLevel: true,
        promotionStatus: true,
        appearanceCount: true,
        silhouetteSignature: true,
        accessoryMarker: true,
        outfitSignature: true,
        shortVisualCore: true,   // URGENCE 5 : description visuelle pour injection dans prompts
        metadata: true,
      },
    }),
    // PROP-1 : charger l'inventaire de props actifs cross-chapitres
    prisma.characterPropInventory.findMany({
      where: { projectId: job.projectId ?? undefined, isActive: true },
      select: {
        characterId: true,
        propCanonicalName: true,
        propCategory: true,
        visualDescription: true,
      },
    }),
  ]);

  if (!chapter) {
    return { ok: false as const, error: "invalid_job" };
  }

  const projectId = job.projectId;
  const chapterId = job.chapterId;
  const chapterNumber = chapter.chapterNumber;
  const npcProfileByCharacterId = new Map(
    npcProfiles
      .filter((profile): profile is typeof profile & { characterId: string } => typeof profile.characterId === "string")
      .map((profile) => [profile.characterId, profile]),
  );
  const intensityLayer = (project?.intensityLayer as string | null) ?? "TEEN";
  const jobInput = ((job.input as Record<string, unknown>) ?? {}) as PipelineJobInput;
  const focusCharacterIds = Array.isArray(jobInput.focusCharacterIds) ? jobInput.focusCharacterIds.filter(Boolean) : [];
  const selectedPlotLabel =
    jobInput.selectedPlotLabel === "safe" || jobInput.selectedPlotLabel === "bold" || jobInput.selectedPlotLabel === "shock"
      ? jobInput.selectedPlotLabel
      : undefined;
  const effectiveCreativeControls = normalizeCreativeControls(
    jobInput.creativityControls,
    project?.settings?.canonStrictness,
  );

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt: job.startedAt ?? new Date() },
  });

  try {
    // LoRA auto non bloquant: on queue l'entraînement, sans retarder le chapitre courant.
    const autoLoraQueued = await queueAutoLoraTrainingIfEligible({
      projectId,
      characters: rawCharacters,
      loraAttachments: loraAttachments as LoadedLoraAttachment[],
    }).catch((error) => {
      const msg = error instanceof Error ? error.message : "auto_lora_queue_failed";
      console.error(`[auto-lora] queue failed project=${projectId} error=${msg}`);
      return 0;
    });
    if (autoLoraQueued > 0) {
      console.log(`[auto-lora] queued_for_project=${projectId} count=${autoLoraQueued}`);
    }

    // Prétraiter le userIntent pour mapper aux entités du projet
    const enrichedIntent = (() => {
      const intent = chapter.userIntent ?? "";
      const intentLower = intent.toLowerCase();
      const mentionedChars = rawCharacters
        .filter((c) => intentLower.includes(c.name.toLowerCase()))
        .map((c) => c.name);
      const unmatchedFocusNames = focusCharacterIds
        .map((fid) => rawCharacters.find((c) => c.id === fid)?.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0 && !mentionedChars.includes(n));

      const parts = [intent];
      if (unmatchedFocusNames.length > 0) {
        parts.push(`[Personnages sélectionnés mais pas encore mentionnés : ${unmatchedFocusNames.join(", ")}]`);
      }
      if (mentionedChars.length > 0) {
        parts.push(`[Personnages détectés dans l'intention : ${mentionedChars.join(", ")}]`);
      }
      return parts.join("\n");
    })();

    // ── Étape 1 : Contexte projet ──────────────────────────────────────────
    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "running");
    const contextRaw = await buildProjectContext(prisma, projectId, enrichedIntent, { focusCharacterIds });
    if (!contextRaw) throw new Error("project_context_not_found");
    // buildProjectContext retourne un objet structurellement compatible avec ProjectContextForChapter.
    // Le cast est nécessaire car les types Prisma (Json, Decimal…) diffèrent des types pipeline.
    // À terme : exporter ProjectContextForChapter depuis packages/memory et aligner les deux.
    const intentEntities = parseIntentEntities(
      enrichedIntent,
      (contextRaw.characters ?? []).map((c) => c.name),
    );
    const intentEntityByName = new Map(intentEntities.map((entity) => [entity.name.toLowerCase(), entity]));
    const context = {
      ...contextRaw,
      intentEntities,
    } as ProjectContextForChapter;
    const adultEngine = resolveAdultEngine({
      primaryGenre: context.project.primaryGenre,
      subGenres: context.project.subGenres,
      visualStyle: context.project.visualStyle,
      userIntent: enrichedIntent,
    });

    // Charger les lieux nommés du projet (pour le scene-environment-engine)
    // DECOR-1 : inclure establishedVisualBrief pour ancrer visuellement les lieux déjà vus
    const knownLocations = await prisma.location.findMany({
      where: { projectId },
      select: { name: true, description: true, visualBrief: true, establishedVisualBrief: true },
      take: 20,
    }).catch(() => [] as Array<{ name: string; description: string | null; visualBrief?: string | null; establishedVisualBrief?: string | null }>);

    const contextDocument = [
      `Projet: ${context.project.title}`,
      context.project.pitch ? `Pitch: ${context.project.pitch}` : "",
      context.project.description ? `Description: ${context.project.description}` : "",
      context.project.primaryGenre ? `Genre: ${context.project.primaryGenre}` : "",
      context.project.subGenres?.length ? `Sous-genres: ${context.project.subGenres.join(", ")}` : "",
      context.storyBible?.summary ? `Bible: ${context.storyBible.summary}` : "",
      context.characters.length
        ? `Personnages:\n${context.characters
            .slice(0, 6)
            .map((character) => `- ${character.name} | ${character.roleType ?? "rôle?"} | obj: ${character.objective ?? "n/a"} | peur: ${character.fear ?? "n/a"}`)
            .join("\n")}`
        : "",
      context.recentMemory.length
        ? `Mémoire récente:\n${context.recentMemory
            .map((memory) => memory.narrativeSummary)
            .filter(Boolean)
            .slice(0, 3)
            .join("\n")}`
        : "",
      context.retrievedDocs.length
        ? `RAG:\n${context.retrievedDocs
            .slice(0, 4)
            .map((doc) => `${doc.title ?? doc.entityType ?? "doc"}: ${doc.content}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 3900);

    await replaceRagDocument(prisma, {
      projectId,
      entityType: "project_context",
      entityId: chapterId,
      title: `Contexte chapitre ${chapterNumber}`,
      content: contextDocument,
      metadata: { chapterId, focusCharacterIds, selectedPlotLabel },
    });
    // ── Charger le canon state précédent (pour continuité) ─────────────────
    const previousCanonState = await prisma.chapterCanonState.findFirst({
      where: {
        projectId,
        chapterNumber: { lt: chapterNumber },
      },
      orderBy: { chapterNumber: "desc" },
    });

    const previousCharacterStates = previousCanonState?.characterStates
      ? (previousCanonState.characterStates as CharacterState[])
      : [];
    let continuityKernel = await loadContinuityKernel(prisma, {
      projectId,
      beforeChapterNumber: chapterNumber,
    });
    if (continuityKernel.characterStates.length > 0) {
      previousCharacterStates.splice(0, previousCharacterStates.length, ...continuityKernel.characterStates);
    }

    await setJobProgress(jobId, { key: "build_context", label: "Contexte projet" }, "completed");

    // ── Étape 2 : Génération bundle (outline, script, storyboard) ──────────
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "running",
    );
    const chapterOutlineRecord = asRecord(chapter.outline);
    const studioSnapshotResult = chapterStudioSnapshotSchema.safeParse(chapterOutlineRecord.studio);
    const studioSnapshot = studioSnapshotResult.success ? studioSnapshotResult.data : null;
    const productionSource = studioSnapshot
      ? resolveEffectiveProductionSource(studioSnapshot)
      : { source: "missing", fallbackUsed: true, legacyBridgeUsed: true };

    // Résolution de l'outline approuvé — priorité premium
    // 1. productionOutline premium depuis le snapshot studio (source non legacy)
    // 2. approvedOutline depuis le snapshot studio (bridge legacy)
    // 3. approvedOutline depuis la DB directement
    const premiumProductionOutline = studioSnapshot?.data?.productionOutline;
    const hasPremiumOutline =
      premiumProductionOutline &&
      typeof premiumProductionOutline === "object" &&
      "source" in premiumProductionOutline &&
      premiumProductionOutline.source !== "legacy_adapted" &&
      Array.isArray((premiumProductionOutline as { beats?: unknown[] }).beats) &&
      ((premiumProductionOutline as { beats?: unknown[] }).beats?.length ?? 0) > 0;

    const approvedOutlineForBundle = hasPremiumOutline
      ? parseApprovedOutline(chapterOutlineRecord.approvedOutline)
        ?? buildLegacyApprovedOutlineFromStudio(studioSnapshot!)
      : studioSnapshot
        ? buildLegacyApprovedOutlineFromStudio(studioSnapshot) ?? parseApprovedOutline(chapterOutlineRecord.approvedOutline)
        : parseApprovedOutline(chapterOutlineRecord.approvedOutline);

    // Résoudre les blueprints premium effectifs pour ce chapitre
    const effectivePanelBlueprints = resolveEffectivePanelBlueprints({
      jobInput: jobInput as PipelineJobInput,
      studioSnapshot,
    });

    // Récupérer la timeline d'état des objets pour la continuité
    const objectStateTimeline = Array.isArray(studioSnapshot?.data?.productionPlan?.objectStateTimeline)
      ? (studioSnapshot!.data!.productionPlan!.objectStateTimeline as Array<{
          beatId: string;
          objectId: string;
          canonicalName: string;
          state: string;
          visibility: string;
        }>)
      : [];
    const bundle = await generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: enrichedIntent || chapter.userIntent || `Continuer ${context.project.title}`,
      selectedPlotLabel,
      creativityControls: effectiveCreativeControls,
      context,
      approvedOutline: approvedOutlineForBundle,
    });
    await setJobProgress(
      jobId,
      { key: "generate_bundle", label: "Direction, outline, script, storyboard" },
      "completed",
    );
    await setJobProgress(
      jobId,
      { key: "continuity_pass", label: "Continuité IA avant images" },
      "running",
    );
    const continuity = await runChapterContinuityPass({
      context,
      bundle,
      chapterGoal: bundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
    });
    let revisedBundle = continuity.bundle;
    await setJobProgress(
      jobId,
      {
        key: "continuity_pass",
        label: continuity.usedOpenAI ? "Continuité IA appliquée" : "Continuité fallback appliquée",
        detail: continuity.notes.slice(0, 2).join(" · ") || undefined,
      },
      "completed",
    );

    await setJobProgress(jobId, { key: "story_coherence_pass", label: "Cohérence narrative & rythme" }, "running");
    const narrative = await runChapterNarrativeCoherencePass({
      context,
      bundle: revisedBundle,
      chapterGoal: revisedBundle.creativeDirection.chapterGoal,
      selectedPlotLabel,
      creativityControls: effectiveCreativeControls as Record<string, number>,
    });
    revisedBundle = narrative.bundle;
    const integrity = enforceBundleIntegrity(revisedBundle);
    revisedBundle = integrity.bundle;
    revisedBundle = syncVisualsAfterNarrativePass(revisedBundle);

    // Auto-détection et création disciplinée des PNJ non-déclarés
    // Règle : un nom inconnu n'est promu en Character persistant que s'il est
    // explicitement autorisé dans le entityRegistry du snapshot studio.
    // Sinon, il reste une entité locale temporaire (non persistée en DB).
    const knownCharNames = new Set(rawCharacters.map((c) => c.name.toLowerCase()));
    const bundleCharNames = new Set<string>();
    for (const page of revisedBundle.storyboard.pages) {
      for (const panel of page.panels) {
        for (const name of panel.characters ?? []) {
          if (name && !knownCharNames.has(name.toLowerCase())) {
            bundleCharNames.add(name);
          }
        }
      }
    }
    for (const scene of revisedBundle.script.scenes) {
      for (const name of scene.characters ?? []) {
        if (name && !knownCharNames.has(name.toLowerCase())) {
          bundleCharNames.add(name);
        }
      }
    }

    // Lire le registry du snapshot studio pour décider qui peut être promu
    const entityRegistry = studioSnapshot?.data?.entityRegistry ?? null;
    const promotedNames = new Set<string>(
      (entityRegistry?.namedEntities ?? [])
        .filter((e) => e.promotionStatus === "promoted" || e.allowedRecurrence === "story_locked")
        .map((e) => e.name.toLowerCase()),
    );
    const temporaryNames = new Set<string>(
      [
        ...(entityRegistry?.temporaryEntities ?? []),
        ...(entityRegistry?.backgroundExtras ?? []),
      ].map((e) => e.name.toLowerCase()),
    );

    if (bundleCharNames.size > 0) {
      const toPromote: string[] = [];
      const toSkip: string[] = [];

      for (const pnjName of bundleCharNames) {
        const nameLower = pnjName.toLowerCase();
        if (promotedNames.has(nameLower)) {
          toPromote.push(pnjName);
        } else if (temporaryNames.has(nameLower)) {
          toSkip.push(pnjName);
        } else if (entityRegistry) {
          // Registry présent mais nom absent → entité non autorisée, on skip
          toSkip.push(pnjName);
        } else {
          // Pas de registry → comportement legacy : on promeut (compatibilité descendante)
          toPromote.push(pnjName);
        }
      }

      if (toSkip.length > 0) {
        console.log(`[pipeline] npc_discipline: skipping ${toSkip.length} non-promoted entities: ${toSkip.join(", ")}`);
      }

      if (toPromote.length > 0) {
        console.log(`[pipeline] npc_promotion: creating ${toPromote.length} characters: ${toPromote.join(", ")}`);
      }

      for (const pnjName of toPromote) {
        try {
          const slug = pnjName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 40) + `-${Date.now()}`;
          const scenesWithPnj = revisedBundle.script.scenes.filter((s) => (s.characters ?? []).includes(pnjName));
          const contextHint = scenesWithPnj[0]?.summary?.slice(0, 200) ?? "";
          const entityProfile = inferEntityProfile({
            name: pnjName,
            contextText: contextHint,
            hint: intentEntityByName.get(pnjName.toLowerCase()) ?? null,
          });

          const newChar = await prisma.character.create({
            data: {
              projectId,
              name: pnjName,
              slug,
              roleType:
                entityProfile.entityKind === "animal"
                  ? "animal"
                  : entityProfile.entityKind === "monster"
                    ? "monster"
                    : entityProfile.entityKind === "creature"
                      ? "creature"
                      : entityProfile.entityKind === "spirit"
                        ? "spirit"
                        : entityProfile.entityKind === "construct"
                          ? "construct"
                          : "pnj",
              status: "alive",
              autoGenerated: true,
              appearance: [
                entityProfile.speciesLabel ? `${entityProfile.speciesLabel}` : null,
                entityProfile.roleHint ? `${entityProfile.roleHint}` : null,
                scenesWithPnj[0]?.location ? `lié à ${scenesWithPnj[0].location}` : null,
                contextHint ? `contexte: ${contextHint}` : null,
              ].filter(Boolean).join(", ") || null,
              continuityProfile: {
                entityKind: entityProfile.entityKind,
                speciesLabel: entityProfile.speciesLabel,
                dialogueMode: entityProfile.dialogueMode,
                recurrencePolicy: entityProfile.recurrencePolicy,
                roleHint: entityProfile.roleHint,
              },
            },
          });

          rawCharacters.push({
            id: newChar.id,
            name: pnjName,
            roleType: newChar.roleType ?? "pnj",
            objective: scenesWithPnj[0]?.summary?.slice(0, 160) ?? null,
            fear: null as string | null,
            biography: contextHint ? `PNJ introduit dans le contexte suivant : ${contextHint}` : null,
            traits: [entityProfile.roleHint ?? "pnj récurrent"].filter(Boolean) as string[],
            flaws: [] as string[],
            gender: null as string | null,
            appearance: (newChar.appearance as string | null) ?? null,
            hairColor: null as string | null,
            eyeColor: null as string | null,
            outfitDefault: null as string | null,
            canonicalImageUrl: null as string | null,
            canonSignatureText: null as string | null,
            forbiddenVisualDrift: null as unknown,
            bodyDetails: null as string | null,
            wardrobeDetails: null as string | null,
            visualProfile: {} as Record<string, unknown>,
            bodyState: {} as Record<string, unknown>,
            wardrobeProfile: {} as Record<string, unknown>,
            speechProfile: {} as Record<string, unknown>,
            continuityProfile: {
              entityKind: entityProfile.entityKind,
              speciesLabel: entityProfile.speciesLabel,
              dialogueMode: entityProfile.dialogueMode,
              recurrencePolicy: entityProfile.recurrencePolicy,
              roleHint: entityProfile.roleHint,
              introLocation: scenesWithPnj[0]?.location ?? null,
            } as Record<string, unknown>,
            characterFingerprint: null as Record<string, unknown> | null,
            visualRefUrls: [] as string[],
            entityKind: entityProfile.entityKind,
            speciesLabel: entityProfile.speciesLabel ?? null,
            dialogueMode: entityProfile.dialogueMode,
            recurrencePolicy: entityProfile.recurrencePolicy,
          } as (typeof rawCharacters)[number]);
          knownCharNames.add(pnjName.toLowerCase());
        } catch (e) {
          console.warn(`[pipeline] PNJ creation failed for "${pnjName}":`, e instanceof Error ? e.message : e);
        }
      }
    }

    if (integrity.notes.length > 0) {
      console.warn(`[pipeline] bundle integrity fixes: ${integrity.notes.join(" | ")}`);
    }
    if (revisedBundle.generationDiagnostics.degradedModes.length > 0) {
      console.warn(
        `[pipeline] degraded_generation status=${revisedBundle.generationDiagnostics.operationalStatus} modes=${revisedBundle.generationDiagnostics.degradedModes.join(",")} outline=${revisedBundle.generationDiagnostics.outline.fallbackReason ?? "none"} dialogueScenes=${revisedBundle.generationDiagnostics.dialogue.fallbackSceneIds.join(",") || "none"}`,
      );
    }
    await mergeJobOutput(jobId, {
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: revisedBundle.generationDiagnostics,
    });
    await setJobProgress(
      jobId,
      {
        key: "story_coherence_pass",
        label: narrative.usedOpenAI ? "Narration peaufinée" : "Narration (fallback)",
        detail: [...narrative.notes.slice(0, 2), ...integrity.notes.slice(0, 1)].join(" · ") || undefined,
      },
      "completed",
    );

    // ── Étape 3 : Persistance chapitre + scènes + images planifiées ────────
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "running",
    );

    const chapterOutline: Prisma.InputJsonValue = {
      ...asRecord(chapter.outline),
      ...revisedBundle.outline,
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: revisedBundle.generationDiagnostics.outline,
    };
    const chapterScript: Prisma.InputJsonValue = {
      ...revisedBundle.script,
      operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
      degradedModes: revisedBundle.generationDiagnostics.degradedModes,
      generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
    };
    const chapterStoryboard: Prisma.InputJsonValue = revisedBundle.storyboard;

    // ── Genre director : inférer le mode une fois pour tout le chapitre ──────
    const chapterGenreMode = inferGenreMode(effectiveCreativeControls, selectedPlotLabel);
    const chapterGenreConfig = getGenreDirectorConfig(chapterGenreMode);

    // ── ChapterLookProfile : résoudre depuis le snapshot studio ──────────────
    const studioLookProfileRaw = studioSnapshot?.data?.chapterLookProfile;
    const chapterLookProfile: ChapterLookProfile = resolveChapterLookProfile(
      studioLookProfileRaw?.mode ?? null,
      studioLookProfileRaw?.mode ?? undefined,
    );
    const debugPanel = process.env.MANGA_DEBUG_PANEL === "true";

    // ── SceneAnchor : construire une ancre par scène ──────────────────────────
    const sceneAnchorByIndex = new Map<number, SceneAnchor>();
    for (let idx = 0; idx < revisedBundle.script.scenes.length; idx++) {
      const scene = revisedBundle.script.scenes[idx];
      if (!scene) continue;
      const anchor = buildSceneAnchor({
        sceneId: `scene_${idx + 1}`,
        castLineup: scene.characters.slice(0, 4),
        location: scene.location,
        mood: scene.purpose ?? "dramatic",
        weather: inferSceneWeather(scene.summary) ?? undefined,
        timeOfDay: inferSceneTimeOfDay(scene.summary) ?? undefined,
      });
      sceneAnchorByIndex.set(idx, anchor);
    }

    // ── Romance director : pré-calculer la direction pour les scènes émotionnelles ──
    const romanceDirectionByScene = new Map<number, ReturnType<typeof directRomanceDramaScene>>();
    if (chapterGenreMode === "romance_shojo" || chapterGenreMode === "quiet_aftermath") {
      for (let idx = 0; idx < revisedBundle.script.scenes.length; idx++) {
        const scene = revisedBundle.script.scenes[idx];
        if (!scene) continue;
        const romanceDirection = directRomanceDramaScene({
          sceneText: scene.summary,
          involvedCharacters: scene.characters.slice(0, 3),
          currentTensionLevel: 40 + idx * 8,
        });
        romanceDirectionByScene.set(idx, romanceDirection);
      }
    }

    console.log(
      `[pipeline] genre_director mode=${chapterGenreMode} rhythm=${chapterGenreConfig.beatRhythm} panelDensity=${chapterGenreConfig.panelDensity} romance_scenes=${romanceDirectionByScene.size}`,
    );

    // B3-1 + B4-1 : Générer dynamiquement les blueprints si non fournis depuis le studio
    // (Panel Blueprint Builder + Prop Inference Engine branchés dans le pipeline)
    let finalPanelBlueprints = effectivePanelBlueprints;
    if (finalPanelBlueprints.length === 0 && revisedBundle.outline.beats.length > 0) {
      console.log(`[pipeline] b3-1 generating panel blueprints dynamically for ${revisedBundle.outline.beats.length} beats`);
      try {
        const { buildPanelBlueprintsFromBeat, inferNarrativeFactsFromBeat, inferRequiredPropsFromBeat } = await import("@manga-ai-studio/ai");
        const heroCharacterId = rawCharacters.find((c) => /hero|protagon|main/i.test(c.roleType ?? ""))?.id ?? null;
        const blueprintContext = {
          heroCharacterId: heroCharacterId ?? undefined,
          chapterNumber,
          projectGenre: context.project.primaryGenre ?? undefined,
          projectTone: context.project.tone ?? undefined,
        };
        const narrativeCtx = {
          projectGenre: context.project.primaryGenre ?? null,
          projectTone: context.project.tone ?? null,
          heroCharacterId,
        };
        let pageCounter = 1;
        let panelCounter = 1;
        const allDynamicBlueprints: typeof finalPanelBlueprints = [];
        for (const beat of revisedBundle.outline.beats) {
          const productionBeat = {
            beatId: beat.id,
            summary: beat.summary,
            narrativeFunction: beat.pageRole ?? beat.purpose,
            whyThisBeatExists: beat.summary,
            dramaticChange: beat.turn ?? beat.purpose,
            involvedCharacters: beat.characters,
            activeCanonConstraints: [] as string[],
            environmentContext: [beat.location],
            visualPriority: "high" as const,
            estimatedPanels: 4,
            criticality: (beat.pageRole === "cliffhanger" || beat.pageRole === "revelation" ? "critical" : "medium") as "critical" | "medium",
            continuityDependencies: [] as string[],
            infoGained: null,
            emotionProduced: null,
            indispensabilityScore: 72,
            redundancyRisk: 18,
          };
          const facts = inferNarrativeFactsFromBeat(productionBeat, narrativeCtx);
          const knownUniverseTypes = ["ninja","cyberpunk","post_apo","school_life","mecha","fantasy","military","medical","urban","generic"] as const;
          type UniverseType = typeof knownUniverseTypes[number];
          const rawGenre = context.project.primaryGenre ?? "";
          const universeType: UniverseType | undefined = (knownUniverseTypes as readonly string[]).includes(rawGenre)
            ? rawGenre as UniverseType
            : undefined;
          const props = inferRequiredPropsFromBeat(productionBeat, facts, {
            universeType,
            projectGenre: context.project.primaryGenre ?? undefined,
            projectTone: context.project.tone ?? undefined,
            heroCharacterId: heroCharacterId ?? undefined,
          });
          const beatBlueprints = buildPanelBlueprintsFromBeat(
            productionBeat,
            facts,
            props,
            blueprintContext,
            pageCounter,
            panelCounter,
          );
          allDynamicBlueprints.push(...beatBlueprints);
          pageCounter += Math.ceil(beatBlueprints.length / 3);
          panelCounter += beatBlueprints.length;

          // FIX-4 : Persister les props narratifs importants dans CharacterPropInventory
          // pour les retrouver cross-chapitres (personnage porte une arme depuis ch.3, etc.)
          const propsToSave = props.filter((p: { mustBeVisible?: boolean; narrativeRole?: string | null }) =>
            p.mustBeVisible !== false &&
            (p.narrativeRole === "action_tool" || p.narrativeRole === "payoff" || p.narrativeRole === "threat"),
          );
          if (propsToSave.length > 0) {
            const carrierCharId = productionBeat.involvedCharacters?.[0]
              ? rawCharacters.find((rc) => rc.name === productionBeat.involvedCharacters?.[0])?.id ?? null
              : heroCharacterId;
            if (carrierCharId) {
              await Promise.allSettled(
                propsToSave.map((prop: { canonicalName: string; category?: string; narrativeRole?: string | null }) =>
                  prisma.characterPropInventory.upsert({
                    where: {
                      characterId_propCanonicalName: {
                        characterId: carrierCharId,
                        propCanonicalName: prop.canonicalName,
                      },
                    },
                    create: {
                      characterId: carrierCharId,
                      projectId,
                      propCanonicalName: prop.canonicalName,
                      propCategory: prop.category ?? "unknown",
                      propNarrativeRole: prop.narrativeRole ?? null,
                      acquiredAtChapterId: chapterId,
                      isActive: true,
                    },
                    update: { isActive: true },
                  }),
                ),
              );
            }
          }
        }
        if (allDynamicBlueprints.length > 0) {
          finalPanelBlueprints = allDynamicBlueprints;
          console.log(`[pipeline] b3-1 generated ${finalPanelBlueprints.length} blueprints dynamically`);
        }
      } catch (blueprintErr) {
        const bpMsg = blueprintErr instanceof Error ? blueprintErr.message : "blueprint_error";
        console.warn(`[pipeline] b3-1 blueprint generation failed (non-blocking): ${bpMsg}`);
      }
    }

    // Map sceneId → list of planned SceneImage ids (for image generation step)
    const plannedImages: PlannedImage[] = [];
    const sceneBlueprintsByScene = new Map<number, SceneBlueprint[]>();

    await prisma.$transaction(
      async (tx) => {
        await tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: revisedBundle.outline.chapter_title,
          outline: chapterOutline,
          script: chapterScript,
          storyboard: chapterStoryboard,
          summary: revisedBundle.memory.narrativeSummary,
          cliffhanger: revisedBundle.outline.cliffhanger,
          status: "ready_for_render",
          tokenEstimate: job.estimatedTokenCost ?? 80,
          tokenActual: job.actualTokenCost ?? job.estimatedTokenCost ?? 80,
        },
      });

        await tx.sceneImage.deleteMany({ where: { scene: { chapterId } } });
        await tx.chapterScene.deleteMany({ where: { chapterId } });

        for (let index = 0; index < revisedBundle.script.scenes.length; index++) {
          const scene = revisedBundle.script.scenes[index];
          if (!scene) continue;

          const romanceDirection = romanceDirectionByScene.get(index);
          const createdScene = await tx.chapterScene.create({
            data: {
              chapterId,
              sceneNumber: index + 1,
              title: scene.title,
              summary: scene.summary,
              script: scene as unknown as Prisma.InputJsonValue,
              dialogue: scene.dialogue as unknown as Prisma.InputJsonValue,
              metadata: {
                location: scene.location,
                characters: scene.characters,
                purpose: scene.purpose,
                continuityPayload: scene.continuityPayload,
                operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
                dialogueGeneration: scene.generationDiagnostics?.dialogue ?? {
                  degradedStatus: "FULLY_OPERATIONAL",
                  usedFallback: false,
                },
                // Genre director metadata
                genreDirectorMode: chapterGenreMode,
                genreBeatRhythm: chapterGenreConfig.beatRhythm,
                genrePanelDensity: chapterGenreConfig.panelDensity,
                // Romance director metadata (si applicable)
                romanceDirection: romanceDirection
                  ? {
                      detectedBeat: romanceDirection.detectedBeat,
                      suggestedBeat: romanceDirection.suggestedBeat.type,
                      tensionAfter: romanceDirection.tensionAfter,
                      panelSuggestions: romanceDirection.suggestedBeat.panelSuggestions.slice(0, 2),
                    }
                  : null,
              },
            },
          });

          // URGENCE 1 — Brancher resolvePageLayout() pour déterminer le layout dramatique de la scène
          try {
            const { resolvePageLayout } = await import("@manga-ai-studio/ai");
            const beatForLayout = revisedBundle.outline.beats[index];
            const totalBeats = revisedBundle.outline.beats.length;
            const beatHints = {
              pageRole: (beatForLayout?.pageRole ?? "escalation") as "establishing" | "escalation" | "confrontation" | "revelation" | "aftermath" | "cliffhanger" | "dialogue" | "action" | "transition",
              emotionalDelta: typeof (beatForLayout as { emotionalDelta?: number })?.emotionalDelta === "number"
                ? ((beatForLayout as { emotionalDelta?: number }).emotionalDelta as number)
                : (beatForLayout?.pageRole === "revelation" || beatForLayout?.pageRole === "cliffhanger" ? 2 : 0),
              cutawayType: null,
              subjectFocus: null,
              panelCount: finalPanelBlueprints.filter((bp) => {
                const bpRec = bp as unknown as Record<string, unknown>;
                const bpPage = typeof bpRec.pageNumber === "number" ? bpRec.pageNumber : null;
                return bpPage === null || bpPage === index + 1;
              }).length || 4,
            };
            const layoutDecision = resolvePageLayout(beatHints, {
              isFirst: index === 0,
              isLast: index === totalBeats - 1,
              beatIndex: index,
              totalBeats,
            });
            await tx.chapterScene.update({
              where: { id: createdScene.id },
              data: {
                pageLayoutTemplate: layoutDecision.template,
                dramaticWeight: layoutDecision.dramaticWeight,
                isSplashPage: layoutDecision.template === "splash",
                isDoublePage: layoutDecision.isDoublePage,
              },
            });
          } catch (layoutErr) {
            console.warn(`[pipeline] layout_decision_failed (non-blocking): ${layoutErr instanceof Error ? layoutErr.message : layoutErr}`);
          }

          // DECOR-1 : enregistrer le brief visuel du lieu si c'est sa première apparition
          if (scene.location) {
            try {
              const locationRecord = knownLocations.find(
                (loc) => loc.name.toLowerCase() === scene.location.trim().toLowerCase(),
              );
              if (locationRecord && !locationRecord.establishedVisualBrief && scene.summary) {
                // Construire un brief visuel condensé depuis le summary de la scène
                const visualBrief = [
                  scene.location,
                  scene.summary.slice(0, 200),
                ].filter(Boolean).join(" — ");
                await prisma.location.updateMany({
                  where: { projectId, name: locationRecord.name },
                  data: {
                    establishedVisualBrief: visualBrief,
                    firstSeenChapterId: chapterId,
                  },
                });
                // Mettre à jour le cache local pour les scènes suivantes
                locationRecord.establishedVisualBrief = visualBrief;
              }
            } catch (decorErr) {
              console.warn(`[pipeline] decor_anchor_failed (non-blocking): ${decorErr instanceof Error ? decorErr.message : decorErr}`);
            }
          }

          const persistentSceneExtras = await ensureSceneExtras(tx, {
            sceneId: createdScene.id,
            locationName: scene.location,
            projectId,
            requiredExtras: inferRequiredSceneExtras(scene),
          });

          const storyboardPage = revisedBundle.storyboard.pages[index];
          if (!storyboardPage) continue;
          const stylePack = stylePacks[0];
          const sceneKeyframeDraft = buildSceneKeyframeDraft({
            sceneId: createdScene.id,
            scene: {
              summary: scene.summary,
              location: scene.location,
              characters: scene.characters,
              purpose: scene.purpose,
            },
            sceneBlueprint: buildSceneBlueprint({
              panelId: `${createdScene.id}:scene_keyframe`,
              pageNumber: index + 1,
              panelNumber: 0,
              seed: chapterNumber * 10_000 + (index + 1) * 100,
              narrative: {
                chapterTitle: revisedBundle.outline.chapter_title,
                chapterGoal: revisedBundle.outline.chapter_goal,
                sceneSummary: scene.summary,
                scenePurpose: scene.purpose,
                panelIntent: scene.summary,
                pageRole: "establishing",
                panelNarration: scene.summary,
              },
              cast: {
                namedCharacters: scene.characters,
                npcNames: persistentSceneExtras.map((extra) => extra.archetype),
                creatureNames: [],
              },
              scene: {
                location: scene.location,
                weather: inferSceneWeather(scene.summary),
                timeOfDay: inferSceneTimeOfDay(scene.summary),
                worldState: [],
                factions: extractSceneFactions(scene.summary),
              },
              style: {
                universe: context.project.primaryGenre ?? "fantasy",
                tone: context.project.tone ?? "dramatic",
                visualStyle: project?.visualStyle ?? "manga",
                renderFamily: stylePack?.renderFamily ?? undefined,
                cameraLanguage: stylePack?.cameraLanguage ?? undefined,
                backgroundDensity: stylePack?.backgroundDensity ?? undefined,
              },
              composition: {
                shotType: "wide",
                cameraAngle: "eye_level",
                focusCharacters: scene.characters.slice(0, 2),
                requiredCharacters: scene.characters,
                backgroundExtras: persistentSceneExtras.map((extra) => `${extra.archetype}:${extra.anchorSlot}`),
              },
              controls: effectiveCreativeControls,
              continuity: {
                anchors: persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.archetype}`),
                worldRules: [],
                styleRules: [],
                loreConstraints: [],
              },
            }),
            stylePack: stylePack
              ? {
                  renderFamily: stylePack.renderFamily,
                  lineWeight: stylePack.lineWeight,
                  shadingMode: stylePack.shadingMode,
                  contrastProfile: stylePack.contrastProfile,
                  backgroundDensity: stylePack.backgroundDensity,
                  cameraLanguage: stylePack.cameraLanguage,
                }
              : null,
            persistentSceneExtras,
          });
          const sceneKeyframe = await tx.sceneKeyframe.create({
            data: {
              projectId,
              chapterId,
              sceneId: createdScene.id,
              version: 1,
              selected: true,
              imageUrl: null,
              involvedCharacterIds: scene.characters,
              environmentLock: sceneKeyframeDraft.environmentLock as Prisma.InputJsonValue,
              lightingLock: inferSceneTimeOfDay(scene.summary),
              timeOfDay: inferSceneTimeOfDay(scene.summary),
              compositionArchetype: sceneKeyframeDraft.compositionArchetype,
              emotionalTone: scene.purpose,
              combatMode: /fight|combat|battle|duel|impact/i.test(scene.purpose ?? scene.summary),
              metadata: {
                positivePrompt: sceneKeyframeDraft.positivePrompt,
                negativePrompt: sceneKeyframeDraft.negativePrompt,
                involvedCharacterNames: sceneKeyframeDraft.involvedCharacterNames,
              } as Prisma.InputJsonValue,
            },
          });

          for (const panel of storyboardPage.panels) {
            // Compose le prompt enrichi via le manga-prompt-composer
              let composedPositive = panel.prompt;
              let composedNegative = panel.negativePrompt;
              let promptDebug: Record<string, unknown> | null = null;
              const panelCanonRefs = panel.characters
                .map((name) => rawCharacters.find((c) => c.name === name)?.canonicalImageUrl)
                .filter((url): url is string => Boolean(url));
              // Résoudre le blueprint premium pour ce panel spécifique
              // B3-1 : utiliser finalPanelBlueprints (générés dynamiquement si non fournis)
              const panelPremiumBlueprint = finalPanelBlueprints.length > 0
                ? findPanelBlueprint(finalPanelBlueprints, index, panel.panelNumber)
                : undefined;

              const panelContractBase = await buildPanelContract({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                pageNumber: index + 1,
                panelNumber: panel.panelNumber,
                panel,
                sceneContext: {
                  location: scene.location,
                  atmosphere: scene.purpose,
                  presentCharacters: scene.characters,
                },
                previousPanelId: panel.panelNumber > 1 ? `${createdScene.id}:${panel.panelNumber - 1}` : undefined,
                visualAnchorIds: panelCanonRefs,
                // Blueprint premium — priorité absolue sur les heuristiques
                panelBlueprint: panelPremiumBlueprint,
              });
              const panelBackgroundExtras = [
                ...scene.characters.filter((name) => !panel.characters.includes(name)).slice(0, 2),
                ...persistentSceneExtras.map((extra) => `${extra.archetype}:${extra.anchorSlot}`),
              ].slice(0, 4);
              const sceneBlueprint = buildSceneBlueprint({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                pageNumber: index + 1,
                panelNumber: panel.panelNumber,
                seed: chapterNumber * 10_000 + (index + 1) * 100 + panel.panelNumber,
                narrative: {
                  chapterTitle: revisedBundle.outline.chapter_title,
                  chapterGoal: revisedBundle.outline.chapter_goal,
                  sceneSummary: scene.summary,
                  scenePurpose: scene.purpose,
                  panelIntent:
                    panel.narration
                    ?? panel.caption
                    ?? (panel as { turn?: string }).turn
                    ?? scene.summary.slice(0, 140),
                  panelNarration: panel.narration ?? null,
                  pageRole: revisedBundle.outline.beats[index]?.pageRole ?? null,
                },
                style: {
                  universe: context.project.primaryGenre ?? "fantasy",
                  tone: context.project.tone ?? "dramatique",
                  visualStyle: context.project.visualStyle ?? "manga",
                  renderFamily: stylePacks[0]?.renderFamily ?? null,
                  cameraLanguage: null,
                  backgroundDensity: "high",
                },
                scene: {
                  location: scene.location,
                  timeOfDay: inferSceneTimeOfDay(`${scene.summary} ${scene.location}`),
                  weather: inferSceneWeather(`${scene.summary} ${scene.location}`),
                  worldState: uniq([
                    ...continuityKernel.worldState.activeThreats,
                    ...continuityKernel.worldState.activeMysteries,
                    ...(context.recentContinuityEvents ?? [])
                      .map((event) => event.summary)
                      .filter((item): item is string => Boolean(item))
                      .slice(0, 4),
                  ]),
                  factions: uniq([
                    ...continuityKernel.worldState.factions,
                    ...extractSceneFactions(`${scene.summary} ${scene.location}`),
                  ]),
                },
                composition: {
                  shotType: panelContractBase.shotType,
                  cameraAngle: panelContractBase.cameraAngle,
                  focusCharacters: panelContractBase.focusCharacters,
                  requiredCharacters: panelContractBase.requiredCharacters,
                  backgroundExtras: [...panelContractBase.backgroundExtras, ...panelBackgroundExtras].slice(0, 6),
                },
                cast: {
                  namedCharacters: panel.characters,
                  npcNames: uniq([
                    ...panelBackgroundExtras,
                    ...persistentSceneExtras.map((extra) => extra.archetype),
                  ]),
                  creatureNames: [],
                },
                controls: {
                  noveltyLevel: effectiveCreativeControls.noveltyLevel,
                  worldStrictness: effectiveCreativeControls.worldStrictness,
                  visualExoticism: effectiveCreativeControls.visualExoticism,
                  npcVariety: effectiveCreativeControls.npcVariety,
                  environmentRichness: effectiveCreativeControls.environmentRichness,
                },
                continuity: {
                  anchors: [
                    scene.location,
                    scene.purpose,
                    ...(
                      continuityKernel.locationStates.find((location) => location.name.toLowerCase() === scene.location.toLowerCase())?.visualAnchors
                      ?? []
                    ).slice(0, 3),
                    ...(revisedBundle.outline.continuity_notes ?? []).slice(0, 3),
                  ],
                  worldRules: uniq([
                    ...continuityKernel.storyBible.worldRules,
                    ...continuityKernel.worldState.structuralProhibitions,
                  ]).slice(0, 6),
                  styleRules: stylePacks[0]
                    ? [
                        stylePacks[0].renderFamily,
                        stylePacks[0].lineWeight,
                        stylePacks[0].shadingMode,
                        stylePacks[0].contrastProfile,
                      ].filter(Boolean).map((item) => String(item))
                    : [],
                  loreConstraints: uniq([
                    typeof context.storyBible?.summary === "string" ? context.storyBible.summary.slice(0, 160) : null,
                    continuityKernel.arcRegistry.find((arc) => arc.status !== "closed")?.currentState ?? null,
                    ...continuityKernel.eventLog.slice(0, 3).map((event) => event.description),
                    ...previousCharacterStates
                      .filter((state) => panel.characters.includes(state.identity.stableName ?? ""))
                      .flatMap((state) => state.continuityObligations),
                  ]),
                },
                // Contrat premium injecté depuis le blueprint résolu
                premiumContract: panelPremiumBlueprint
                  ? {
                      subjectFocus: panelPremiumBlueprint.subjectFocus,
                      mustShowEnemy: panelPremiumBlueprint.mustShowEnemy,
                      requiredNpcCount: panelPremiumBlueprint.requiredNpcCount,
                      speakerAnchorCharacterId: panelPremiumBlueprint.speakerAnchorCharacterId,
                      dialogueCarrier: panelPremiumBlueprint.dialogueCarrier,
                      cutawayType: panelPremiumBlueprint.cutawayType,
                      heroCenterAllowed: panelPremiumBlueprint.heroCenterAllowed,
                      requiredPropNames: panelPremiumBlueprint.requiredProps.map((p) => p.canonicalName),
                      antiCollapseReason: panelPremiumBlueprint.cutawayType !== "none"
                        ? `cutaway type: ${panelPremiumBlueprint.cutawayType}`
                        : undefined,
                    }
                  : undefined,
              });
              const sceneBlueprints = sceneBlueprintsByScene.get(index) ?? [];
              sceneBlueprints.push(sceneBlueprint);
              sceneBlueprintsByScene.set(index, sceneBlueprints);
              const panelContract = {
                ...panelContractBase,
                backgroundExtras: [
                  ...panelContractBase.backgroundExtras,
                  ...panelBackgroundExtras,
                  ...sceneBlueprint.cast.npcPresence,
                  ...sceneBlueprint.cast.backgroundSubjects,
                ].filter(Boolean).slice(0, 5),
                mustShow: [
                  ...panelContractBase.mustShow,
                  ...sceneBlueprint.environment.mustShowLocationSignals,
                  ...sceneBlueprint.environment.props,
                ].filter(Boolean).slice(0, 8),
                mustNotShow: [
                  ...panelContractBase.mustNotShow,
                  ...sceneBlueprint.constraints.hard
                    .filter((rule) => rule.startsWith("Avoid:"))
                    .map((rule) => rule.replace(/^Avoid:\s*/, "")),
                ].filter(Boolean).slice(0, 8),
                npcPresence: uniq([
                  ...(panelContractBase.npcPresence ?? []),
                  ...persistentSceneExtras.map((extra) => extra.archetype),
                ]).slice(0, 5),
                persistentSceneAnchors: uniq([
                  ...(panelContractBase.persistentSceneAnchors ?? []),
                  ...persistentSceneExtras.map((extra) => `${extra.anchorSlot}:${extra.visualSignature.outfit ?? extra.archetype}`),
                ]).slice(0, 6),
              };
              const panelCharacterPlan = buildPanelCharacterPlan({
                panelId: `${createdScene.id}:${panel.panelNumber}`,
                panel,
                sceneCharacters: scene.characters,
                shotType: panelContract.shotType,
                purpose: panelContract.purpose,
              });
              // Construire l'intentCard et récupérer le sceneAnchor pour ce panel
              const panelIntentCard: PanelIntentCard = buildPanelIntentCard({
                purpose: panelContract.purpose,
                mood: panel.mood,
                scenePurpose: scene.purpose,
                sfx: panel.sfx ? [panel.sfx] : null,
                dialogueCount: (panel.dialogues?.length ?? 0) + (panel.dialogue ? 1 : 0),
                cameraShot: panel.camera,
                cameraAngle: panelContract.cameraAngle,
              });
              const panelSceneAnchor = sceneAnchorByIndex.get(index) ?? null;

              const combatDirection =
                (panelContract.purpose === "action" || panelIntentCard.beatEventType === "combat_turning_point" || panelIntentCard.beatEventType === "impact")
                  ? directCombatPanel({
                      beatText: `${panel.caption ?? ""} ${panel.prompt ?? ""}`,
                      scenePurpose: scene.purpose,
                      currentShotType: panelContract.shotType,
                      characterCount: panel.characters.length,
                      // Enrichissement via genre director : shonen_combat booste la lisibilité
                      combatReadabilityBonus: chapterGenreConfig.combatReadabilityBonus,
                    })
                  : null;

              try {
                const promptCharacters = rawCharacters
                  .filter((c) => panel.characters.includes(c.name))
                  .map((c) => {
                    const importanceTier = resolveCharacterImportanceTier({
                      roleType: typeof c.roleType === "string" ? c.roleType : null,
                      recurrencePolicy: typeof c.recurrencePolicy === "string" ? c.recurrencePolicy : null,
                    });
                    const tierPolicy = getCharacterTierPolicy(importanceTier);
                    const promptBundle = buildCharacterPromptBundle({
                      name: c.name,
                      roleType: c.roleType,
                      biography: c.biography,
                      objective: c.objective,
                      fear: c.fear,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                      visualProfile: c.visualProfile,
                      bodyState: c.bodyState,
                      wardrobeProfile: c.wardrobeProfile,
                      speechProfile: c.speechProfile,
                      continuityProfile: c.continuityProfile,
                      traits: c.traits,
                      flaws: c.flaws,
                    });
                    const fingerprint =
                      c.characterFingerprint && typeof c.characterFingerprint === "object"
                        ? c.characterFingerprint as Record<string, unknown>
                        : null;
                    const fingerprintVisualHints = [
                      typeof fingerprint?.identity === "object" && fingerprint.identity && "gender" in fingerprint.identity
                        ? `gender lock: ${String((fingerprint.identity as Record<string, unknown>).gender ?? "")}`
                        : null,
                      typeof fingerprint?.hair === "object" && fingerprint.hair
                        ? `hair lock: ${[
                            (fingerprint.hair as Record<string, unknown>).color,
                            (fingerprint.hair as Record<string, unknown>).style,
                            (fingerprint.hair as Record<string, unknown>).length,
                          ].filter(Boolean).join(" ")}`
                        : null,
                      typeof fingerprint?.face === "object" && fingerprint.face
                        ? `face lock: ${[
                            (fingerprint.face as Record<string, unknown>).eyeColor,
                            (fingerprint.face as Record<string, unknown>).eyeShape,
                            (fingerprint.face as Record<string, unknown>).faceShape,
                          ].filter(Boolean).join(", ")}`
                        : null,
                    ].filter(Boolean).join(", ");

                    const forbiddenDrift = [
                      ...(Array.isArray(c.forbiddenVisualDrift)
                        ? (c.forbiddenVisualDrift as string[]).filter((item) => typeof item === "string")
                        : []),
                      ...promptBundle.forbiddenDriftRules,
                      ...(fingerprint && Array.isArray(fingerprint.forbiddenDrift)
                        ? fingerprint.forbiddenDrift.filter((item): item is string => typeof item === "string")
                        : []),
                    ];
                    const npcProfile = npcProfileByCharacterId.get(c.id);
                    const npcProfileMetadata =
                      npcProfile?.metadata && typeof npcProfile.metadata === "object" && !Array.isArray(npcProfile.metadata)
                        ? (npcProfile.metadata as Record<string, unknown>)
                        : {};
                    const npcVisualMemory =
                      npcProfileMetadata.visualMemory && typeof npcProfileMetadata.visualMemory === "object" && !Array.isArray(npcProfileMetadata.visualMemory)
                        ? (npcProfileMetadata.visualMemory as Record<string, unknown>)
                        : {};
                    const recurringMemory =
                      importanceTier === "RECURRING_NPC" || npcProfile?.importanceLevel === "recurring"
                        ? [
                            npcProfile?.silhouetteSignature,
                            typeof npcVisualMemory.hairFamily === "string" ? npcVisualMemory.hairFamily : null,
                            typeof npcVisualMemory.ageBand === "string" ? `age ${npcVisualMemory.ageBand}` : null,
                            npcProfile?.accessoryMarker ? `marker ${npcProfile.accessoryMarker}` : null,
                            npcProfile?.outfitSignature ? `outfit ${npcProfile.outfitSignature}` : null,
                            npcProfile?.appearanceCount ? `seen ${npcProfile.appearanceCount} times` : null,
                            c.outfitDefault,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : null;

                    // Extraire hardTraits et softTraits depuis le fingerprint
                    const hardTraits = Array.isArray(fingerprint?.hardTraits)
                      ? (fingerprint!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
                      : null;
                    const softTraits = Array.isArray(fingerprint?.softTraits)
                      ? (fingerprint!.softTraits as string[]).filter((t): t is string => typeof t === "string")
                      : null;

                    return {
                      name: c.name,
                      entityKind: c.entityKind,
                      speciesLabel: c.speciesLabel,
                      gender: c.gender,
                      appearance: c.appearance,
                      hairColor: c.hairColor,
                      eyeColor: c.eyeColor,
                      outfitDefault: c.outfitDefault,
                      canonicalImageUrl: c.canonicalImageUrl ?? null,
                      forbiddenDrift,
                      importanceTier,
                      lockStrength: tierPolicy.minimumLock,
                      continuityBudget:
                        tierPolicy.qaExpectation === "strict"
                          ? ("strict" as const)
                          : tierPolicy.qaExpectation === "light"
                            ? ("light" as const)
                            : ("none" as const),
                      recurringMemory,
                      bodyDetails: c.bodyDetails,
                      // URGENCE 7 : enrichir wardrobeDetails avec les props actifs du personnage
                      wardrobeDetails: (() => {
                        const baseParts: string[] = [];
                        if (c.wardrobeDetails) baseParts.push(c.wardrobeDetails);
                        // PROP-1 : injecter les props actifs cross-chapitres de ce personnage
                        const charCrossChapProps = propInventory
                          .filter((p) => p.characterId === c.id)
                          .map((p) => p.visualDescription ?? p.propCanonicalName);
                        if (charCrossChapProps.length > 0) {
                          baseParts.push(`always carries: ${charCrossChapProps.join(", ")}`);
                        }
                        // Ajouter les props visibles du panelContract portés par ce personnage
                        const propsForChar = (panelContract.requiredPropsTyped ?? [])
                          .filter((p: { mustBeVisible?: boolean; canonicalName: string }) => p.mustBeVisible !== false)
                          .map((p: { canonicalName: string }) => p.canonicalName);
                        if (propsForChar.length > 0) {
                          baseParts.push(`carrying/wearing: ${propsForChar.join(", ")}`);
                        }
                        return baseParts.length > 0 ? baseParts.join(", ") : null;
                      })(),
                      hardTraits,
                      softTraits,
                      fingerprint: fingerprint as never,
                      visualSignatureText:
                        c.canonSignatureText ??
                        [promptBundle.visualPrompt, promptBundle.continuityPrompt, promptBundle.canonConstraintLine, fingerprintVisualHints]
                          .filter(Boolean)
                          .join(", "),
                    };
                  });

                const composed = composeMangaPanelPrompt({
                  stylePack: stylePack
                    ? {
                        name: stylePack.renderFamily,
                        description: `${stylePack.lineWeight} lines, ${stylePack.shadingMode} shading, ${stylePack.contrastProfile} contrast`,
                        visualStyle: project?.visualStyle ?? null,
                        anatomyBias: stylePack.anatomyBias,
                        backgroundDensity: stylePack.backgroundDensity,
                        cameraLanguage: stylePack.cameraLanguage,
                        negativeConstraints: Array.isArray(stylePack.negativeConstraints)
                          ? (stylePack.negativeConstraints as string[])
                          : [],
                      }
                    : { visualStyle: project?.visualStyle ?? null },
                  sceneBlueprint,
                  characters: promptCharacters,
              location: scene.location,
              action: [
                sceneBlueprint.promptBridge.actionLine,
                panel.narration ?? panel.caption ?? (panel as { turn?: string }).turn ?? scene.summary.slice(0, 120),
                panelContract.mustShow.length > 0 ? `must show: ${panelContract.mustShow.join(", ")}` : "",
                panelContract.backgroundExtras.length > 0 ? `background extras: ${panelContract.backgroundExtras.join(", ")}` : "",
                combatDirection ? `combat framing: ${combatDirection.framing}. ${combatDirection.impactCue}. ${combatDirection.environmentReaction}` : "",
                // Phase 7 : romance visual grammar
                romanceDirectionByScene.get(index)?.visualPromptConstraints.slice(0, 2).join(". ") ?? "",
              ].filter(Boolean).join(". "),
              camera: combatDirection ? `${panel.camera}, ${combatDirection.framing}` : panel.camera,
              mood: panel.mood,
              contentIntensityLayer: intensityLayer,
              dialogueHint: panel.dialogues?.length
                ? panel.dialogues.slice(0, 2).map((d) => `${d.speaker}: ${d.text}`).join(" / ")
                : panel.dialogue ? `${panel.dialogue.speaker}: ${panel.dialogue.text}` : undefined,
              sceneContext: [
                sceneBlueprint.promptBridge.sceneContextLine,
                scene.summary,
                scene.purpose ? `purpose: ${scene.purpose}` : "",
                `panel purpose: ${panelContract.purpose}`,
                `shot: ${panelContract.shotType}`,
                panelContract.continuityFromPanelId ? "keep continuity with previous panel" : "",
              ].filter(Boolean).join(" · ").slice(0, 320),
              environmentHint: [
                sceneBlueprint.promptBridge.environmentLine,
                // DECOR-1 : ancre visuelle du lieu si déjà établi dans un chapitre précédent
                (() => {
                  const locationName = scene.location?.trim().toLowerCase();
                  if (!locationName) return null;
                  const locationRecord = knownLocations.find(
                    (loc) => loc.name.toLowerCase() === locationName || locationName.includes(loc.name.toLowerCase()),
                  );
                  return locationRecord?.establishedVisualBrief
                    ? `ESTABLISHED VISUAL ANCHOR [${locationRecord.name}]: ${locationRecord.establishedVisualBrief}`
                    : null;
                })(),
                composeEnvironment({
                location: scene.location,
                mood: panel.mood,
                genre: context.project.primaryGenre ?? "fantasy",
                tone: context.project.tone ?? "dramatique",
                visualStyle: context.project.visualStyle ?? "manga",
                lore: typeof context.storyBible?.lore === "string" ? context.storyBible.lore : null,
                worldRules: context.storyBible?.worldRules,
                glossary: context.storyBible?.glossary,
                knownLocations: knownLocations,
                sceneCharCount: scene.characters.length,
                panelCharCount: panel.characters.length,
                sceneSummary: scene.summary,
                seed: chapterNumber * 10_000 + (index + 1) * 100 + panel.panelNumber,
                }),
                panelContract.backgroundExtras.length > 0 ? `persistent extras visible: ${panelContract.backgroundExtras.join(", ")}` : "",
                sceneBlueprint.promptBridge.hardConstraintLine,
                sceneBlueprint.promptBridge.softConstraintLine,
              ].filter(Boolean).join(", "),
              chapterLookProfile,
              sceneAnchor: panelSceneAnchor,
              intentCard: panelIntentCard,
              // URGENCE 4 : accessoires requis depuis le prop inference engine
              requiredProps: panelContract.requiredPropsTyped ?? null,
              // URGENCE 5 : PNJ récurrents présents dans cette scène
              npcPresence: (() => {
                const activeNpcDescriptors = npcProfiles
                  .filter(
                    (n) =>
                      typeof n.shortVisualCore === "string" &&
                      (n.importanceLevel === "recurring" || n.importanceLevel === "important"),
                  )
                  .sort((a, b) => b.appearanceCount - a.appearanceCount)
                  .slice(0, 3)
                  .map((n) => {
                    const parts: string[] = [];
                    if (n.shortVisualCore) parts.push(n.shortVisualCore);
                    if (n.outfitSignature) parts.push(`wearing ${n.outfitSignature}`);
                    parts.push("background character");
                    return parts.join(", ");
                  });
                return activeNpcDescriptors.length > 0 ? activeNpcDescriptors : null;
              })(),
              // IMG-1 : type de plan pour les framing directives manga
              shotType: panelContract.shotType ?? null,
              cutawayType: (panelContract as Record<string, unknown>).cutawayType as string | null ?? null,
              subjectFocus: (panelContract as Record<string, unknown>).subjectFocus as string | null ?? null,
              cameraAngle: null,
              // IMG-3 : phrase d'ancrage de style figée pour cohérence cross-panels
              chapterStyleAnchor: stylePack
                ? [
                    stylePack.renderFamily ?? null,
                    `${stylePack.lineWeight ?? ""} line weight`,
                    stylePack.shadingMode ?? null,
                    "manga panel style",
                  ].filter(Boolean).join(", ")
                : "manga art style, clean ink lines, screen tone shading, Japanese manga aesthetics",
              // IMG-4 : type de beat pour les effets manga
              beatType: (revisedBundle.outline.beats[index]?.pageRole as string | undefined) ?? null,
            });
            composedPositive = [
              composed.positive,
              panelContract.mustNotShow.length > 0 ? `avoid showing: ${panelContract.mustNotShow.join(", ")}` : "",
            ].filter(Boolean).join(", ");
            composedNegative = composed.negative;
            promptDebug = composed.debug ?? null;
          } catch {
            // fallback sur le prompt du storyboard
          }

            const baseMetadata = {
              caption: panel.caption,
              camera: panel.camera,
              characters: panel.characters,
              sceneId: createdScene.id,
              sceneKeyframeId: sceneKeyframe.id,
              pageNumber: storyboardPage.pageNumber,
              pagePanelCount: storyboardPage.panels.length,
              mood: panel.mood,
              combatDirection,
              textScale: panel.textScale ?? "normal",
              sfx: panel.sfx,
              dialogue: panel.dialogue,
              dialogues: panel.dialogues,
              narration: panel.narration,
              layout: storyboardPage.layout,
              // A2 : enrichir panelContract avec les fingerprints des personnages du panel
              panelContract: (() => {
                const panelFingerprintMap: Record<string, unknown> = {};
                for (const charName of panel.characters ?? []) {
                  const raw = rawCharacters.find((rc) => rc.name === charName);
                  if (raw?.id && raw.characterFingerprint && typeof raw.characterFingerprint === "object" && Object.keys(raw.characterFingerprint as object).length > 0) {
                    panelFingerprintMap[raw.id] = raw.characterFingerprint;
                  }
                }
                return Object.keys(panelFingerprintMap).length > 0
                  ? { ...panelContract, characterFingerprints: panelFingerprintMap }
                  : panelContract;
              })(),
              panelCharacterPlan,
              sceneBlueprint,
              effectiveCreativeControls,
              visualPriority: panelContract.purpose === "reveal" ? "critical" : panelContract.shotType === "closeup" ? "high" : "medium",
              // Phase 2 : look profile autoritaire
              chapterLookProfileMode: chapterLookProfile.mode,
              // Phase 5 : intent card
              intentCard: panelIntentCard,
              // Phase 4 : scene anchor
              sceneAnchor: panelSceneAnchor,
              // Phase 1 : debug trace (activé si MANGA_DEBUG_PANEL=true)
              ...(debugPanel ? {
                panelDebugTrace: {
                  sourceBeat: panel.caption ?? scene.summary.slice(0, 80),
                  panelIntent: panelIntentCard.beatEventType,
                  promptDigest: composedPositive?.slice(0, 120) ?? "",
                  refsRequested: [],
                  refsUsed: [],
                  refsIgnored: [],
                  charactersExpected: panel.characters,
                  styleProfileExpected: chapterLookProfile.styleFamily,
                },
              } : {}),
              // Continuité objets : état des props pour ce beat
              ...(objectStateTimeline.length > 0 ? {
                objectStateBeat: objectStateTimeline.filter((frame) => {
                  const bpBeatIndex = parseInt(frame.beatId?.split("_")[1] ?? "0", 10) - 1;
                  return bpBeatIndex === index;
                }),
              } : {}),
              // Blueprint premium résolu pour ce panel
              ...(panelPremiumBlueprint ? {
                premiumBlueprint: {
                  subjectFocus: panelPremiumBlueprint.subjectFocus,
                  cutawayType: panelPremiumBlueprint.cutawayType,
                  mustShowEnemy: panelPremiumBlueprint.mustShowEnemy,
                  requiredNpcCount: panelPremiumBlueprint.requiredNpcCount,
                  speakerAnchorCharacterId: panelPremiumBlueprint.speakerAnchorCharacterId,
                  requiredProps: panelPremiumBlueprint.requiredProps.map((p) => ({
                    canonicalName: p.canonicalName,
                    mustBeVisible: p.mustBeVisible,
                    narrativeRole: p.narrativeRole,
                  })),
                },
              } : {}),
              stylePack: stylePack
                ? {
                    renderFamily: stylePack.renderFamily,
                    lineWeight: stylePack.lineWeight,
                    shadingMode: stylePack.shadingMode,
                    contrastProfile: stylePack.contrastProfile,
                    anatomyBias: stylePack.anatomyBias,
                    backgroundDensity: stylePack.backgroundDensity,
                    cameraLanguage: stylePack.cameraLanguage,
                    negativeConstraints: Array.isArray(stylePack.negativeConstraints)
                      ? stylePack.negativeConstraints
                      : [],
                  }
                : null,
              renderMeta: {
                cropMode: panelContract.renderHints.cropMode,
                focalPoint: panelContract.renderHints.focalPoint,
                reservedTextZones: panelContract.textBoxPlan.reservedZones,
              },
              promptDebug,
              layoutMeta: {
                slotType:
                  panelContract.shotType === "wide"
                    ? "wide"
                    : panelContract.shotType === "closeup" || panelContract.shotType === "extreme_closeup"
                      ? "closeup"
                      : panelContract.purpose === "dialogue"
                        ? "dialogue"
                        : "square",
                targetAspectRatio: panelContract.renderHints.targetAspectRatio,
                layoutTemplate: storyboardPage.layout,
              },
            };

            const created = await tx.sceneImage.create({
              data: {
                sceneId: createdScene.id,
                panelNumber: panel.panelNumber,
                renderingMode: "PANEL_DRAFT",
                sceneKeyframeId: sceneKeyframe.id,
                prompt: composedPositive,
                negativePrompt: composedNegative,
                status: "planned",
                width: PANEL_DRAFT_SIZE.width,
                height: PANEL_DRAFT_SIZE.height,
                referenceImageIds: panelCanonRefs as unknown as Prisma.InputJsonValue,
                metadata: baseMetadata as unknown as Prisma.InputJsonValue,
              },
            });

            plannedImages.push({
              sceneImageId: created.id,
              panel: { ...panel, prompt: composedPositive, negativePrompt: composedNegative },
              sceneIndex: index,
              baseMetadata,
            });
          }
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
    await setJobProgress(
      jobId,
      { key: "persist_chapter", label: "Persistance chapitre" },
      "completed",
    );

    // ── Construire et persister les scene states (continuity engine) ───────
    console.log(`[pipeline] Building scene states for ${revisedBundle.script.scenes.length} scenes`);
    const validatedSceneSnapshots = [];
    const kernelValidationWarnings: string[] = [];
    for (let index = 0; index < revisedBundle.script.scenes.length; index++) {
      const scene = revisedBundle.script.scenes[index];
      if (!scene) continue;

      const beat = revisedBundle.outline.beats[index];
      const sceneDbRecord = await prisma.chapterScene.findFirst({
        where: { chapterId, sceneNumber: index + 1 },
      });

      if (sceneDbRecord) {
        const sceneStateData = await buildSceneState(prisma, {
          projectId,
          chapterId,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          scene: {
            title: scene.title,
            summary: scene.summary,
            location: scene.location,
            characters: scene.characters,
            beat: {
              location: beat?.location,
              characters: beat?.characters,
              turn: (beat as { turn?: string })?.turn,
            },
          },
          characterStatesFromCanon: previousCharacterStates,
        });

        await persistSceneState(prisma, {
          projectId,
          chapterId,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          sceneStateData,
        });
        const sceneSnapshot = buildSceneSnapshot({
          kernel: continuityKernel,
          chapterId,
          chapterNumber,
          sceneId: sceneDbRecord.id,
          sceneNumber: index + 1,
          title: scene.title,
          summary: scene.summary,
          dramaticGoal: sceneStateData.dramaticGoal,
          location: scene.location,
          sceneStateData,
          sceneBlueprints: sceneBlueprintsByScene.get(index) ?? [],
          continuityPayload: scene.continuityPayload,
          participantNames: scene.characters,
        });
        const continuityValidation = validateSceneSnapshotAgainstKernel({
          kernel: continuityKernel,
          sceneSnapshot,
        });
        const sceneEvents = continuityValidation.accepted
          ? deriveSceneEvents({ kernel: continuityKernel, sceneSnapshot })
          : [];
        if (continuityValidation.issues.length > 0) {
          console.warn(
            `[continuity-kernel] scene=${sceneDbRecord.id} accepted=${continuityValidation.accepted} issues=${continuityValidation.issues.map((issue) => issue.message).join(" | ")}`,
          );
        }
        kernelValidationWarnings.push(
          ...continuityValidation.issues.map((issue) => issue.message),
          ...continuityValidation.warnings,
        );
        const sceneMeta = asRecord(sceneDbRecord.metadata);
        await prisma.chapterScene.update({
          where: { id: sceneDbRecord.id },
          data: {
            metadata: ({
              ...sceneMeta,
              sceneSnapshot,
              continuityValidation,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        if (continuityValidation.accepted) {
          await persistValidatedSceneContinuity(prisma, {
            projectId,
            chapterId,
            chapterNumber,
            sceneId: sceneDbRecord.id,
            sceneNumber: index + 1,
            sceneSnapshot,
            validation: continuityValidation,
            events: sceneEvents,
          });
          continuityKernel = applySceneEventsToKernel(continuityKernel, sceneSnapshot, sceneEvents);
        }
        validatedSceneSnapshots.push(sceneSnapshot);
      }
    }

    // ── Étape 3b : Index refs canon et LoRA par personnage ────────────────
    // (les keyframes images ont été supprimées : elles polluaient la fidélité des persos)
    // La cohérence décor est assurée par composeEnvironment dans les prompts de panels.
    const canonRefByName = new Map<string, StableImageReference>();
    for (const c of rawCharacters) {
      const ref =
        (c as { canonicalReference?: StableImageReference | null }).canonicalReference
        ?? ((c.canonicalImageUrl
          ? buildStableImageReference({
              publicUrl: c.canonicalImageUrl,
              sourceUrl: c.canonicalImageUrl,
              sourceType: "legacy_url",
            })
          : null));
      if (ref) canonRefByName.set(c.name, ref);
    }
    const loraByCharId = new Map<string, { url: string; triggerWord: string; scale: number }>();
    for (const att of loraAttachments) {
      const meta = att.lora.weightsMeta as Record<string, unknown>;
      const loraUrl = typeof meta.loraUrl === "string" ? meta.loraUrl : null;
      const triggerWord = typeof meta.triggerWord === "string" ? meta.triggerWord : att.lora.name;
      if (loraUrl && att.characterId && att.enabled && att.lora.status === "active") {
        loraByCharId.set(att.characterId, { url: loraUrl, triggerWord, scale: att.weight });
      }
    }
    const loraByCharName = new Map<string, { url: string; triggerWord: string; scale: number }>();
    for (const c of rawCharacters) {
      const lora = loraByCharId.get(c.id);
      if (lora) loraByCharName.set(c.name, lora);
    }

    // ── Étape 4 : Génération des images réelles via FAL ────────────────────
    await setJobProgress(
      jobId,
      { key: "generate_images", label: `Génération images (0/${plannedImages.length})` },
      "running",
    );

    let generatedCount = 0;
    let failedCount = 0;
    const sceneKeyframeUrlCache = new Map<string, Promise<string | null>>();

    async function persistFalTraceEntry(input: {
      sceneId: string;
      panelId?: string;
      sceneKeyframeId?: string;
      characterId?: string | null;
      provider: string;
      model: string;
      mode: "text2img" | "img2img" | "lora_training";
      status: "completed" | "failed";
      requestId?: string | null;
      jobId?: string | null;
      requestPayload: Record<string, unknown>;
      responsePayload: unknown;
      refsUsed?: string[];
      lorasUsed?: Array<{ url: string; triggerWord: string; scale?: number }>;
      timings?: Record<string, unknown>;
      error?: Record<string, unknown> | null;
    }) {
      return prisma.falTrace.create({
        data: {
          projectId,
          chapterId,
          sceneId: input.sceneId,
          panelId: input.panelId ?? null,
          sceneKeyframeId: input.sceneKeyframeId ?? null,
          characterId: input.characterId ?? null,
          provider: input.provider,
          model: input.model,
          mode: input.mode,
          status: input.status,
          requestId: input.requestId ?? null,
          jobId: input.jobId ?? null,
          requestPayload: input.requestPayload as Prisma.InputJsonValue,
          responsePayload: (input.responsePayload ?? {}) as Prisma.InputJsonValue,
          refsUsed: (input.refsUsed ?? []) as Prisma.InputJsonValue,
          lorasUsed: (input.lorasUsed ?? []) as Prisma.InputJsonValue,
          timings: (input.timings ?? {}) as Prisma.InputJsonValue,
          error: input.error ? (input.error as Prisma.InputJsonValue) : undefined,
        },
      });
    }

    async function ensureSceneKeyframeUrl(item: PlannedImage): Promise<string | null> {
      const sceneKeyframeId =
        typeof item.baseMetadata.sceneKeyframeId === "string"
          ? item.baseMetadata.sceneKeyframeId
          : null;
      if (!sceneKeyframeId) return null;
      const existingPromise = sceneKeyframeUrlCache.get(sceneKeyframeId);
      if (existingPromise) return existingPromise;

      const promise = (async () => {
        const keyframe = await prisma.sceneKeyframe.findUnique({
          where: { id: sceneKeyframeId },
          include: {
            imageAsset: {
              select: {
                id: true,
                storageProvider: true,
                bucket: true,
                storageKey: true,
                publicUrl: true,
                signedUrl: true,
                falCdnUrl: true,
                sha256: true,
              },
            },
          },
        });
        if (!keyframe) return null;
        if (keyframe.imageUrl) {
          const existingKeyframeRef = buildStableImageReference({
            assetId: keyframe.imageAsset?.id ?? keyframe.imageAssetId ?? null,
            storageProvider: keyframe.imageAsset?.storageProvider ?? null,
            bucket: keyframe.imageAsset?.bucket ?? null,
            storageKey: keyframe.imageAsset?.storageKey ?? null,
            publicUrl: keyframe.imageAsset?.publicUrl ?? keyframe.imageUrl,
            signedUrl: keyframe.imageAsset?.signedUrl ?? null,
            falCdnUrl: keyframe.imageAsset?.falCdnUrl ?? null,
            sourceUrl: keyframe.imageUrl,
            sourceType: keyframe.imageAssetId ? "media_asset" : "scene_keyframe",
            checksum: keyframe.imageAsset?.sha256 ?? null,
          });
          if (!existingKeyframeRef) return keyframe.imageUrl;
          const existingResolution = await resolveStableImageReferences([existingKeyframeRef], {
            logPrefix: "[pipeline:keyframe-existing]",
          });
          return existingResolution.urls[0] ?? keyframe.imageUrl;
        }

        const metadata =
          keyframe.metadata && typeof keyframe.metadata === "object"
            ? (keyframe.metadata as Record<string, unknown>)
            : {};
        const sceneCharacterNames = Array.isArray(metadata.involvedCharacterNames)
          ? metadata.involvedCharacterNames.filter((value): value is string => typeof value === "string")
          : [];
        const keyframeReferenceResolution = await resolveStableImageReferences(
          sceneCharacterNames
            .map((name) => canonRefByName.get(name))
            .filter((value): value is StableImageReference => Boolean(value))
            .slice(0, 2),
          { logPrefix: "[pipeline:keyframe-ref]" },
        );
        const keyframeRefs = keyframeReferenceResolution.urls;
        const keyframeLoras = sceneCharacterNames
          .map((name) => loraByCharName.get(name))
          .filter((value): value is { url: string; triggerWord: string; scale: number } => Boolean(value))
          .slice(0, 2);
        const size = getFalImageSizePreset("panel_establishing");
        const generation = await runRoutedImageGeneration(
          {
            mode: "SCENE_KEYFRAME",
            contentIntensityLayer: intensityLayer,
            adultEngine,
            isNewCharacter: false,
            hasCanonReferences: keyframeRefs.length > 0 || keyframeLoras.length > 0,
            characterCountInScene: sceneCharacterNames.length,
            purpose: "establishing",
            shotType: "wide",
            environmentPriority: "high",
            locationComplexity: 80,
            environmentDensityRequired: "high",
            continuityWeight: 85,
            scenePurpose: "scene_keyframe",
            needsInpaint: false,
            needsPoseVariation: false,
            preferPhotorealCover: false,
            explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
            goreStylizedMature:
              intensityLayer === "MATURE_DRAMA" ||
              intensityLayer === "MATURE_VISUAL" ||
              intensityLayer === "ADULT_EXPLICIT",
          },
          {
            mode: "SCENE_KEYFRAME",
            positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
            negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
            width: size.width,
            height: size.height,
            referenceImageUrls: keyframeRefs.length > 0 ? keyframeRefs : undefined,
            loras: keyframeLoras.length > 0 ? keyframeLoras : undefined,
            providerParams: {
              contentIntensityLayer: intensityLayer,
              mode: "SCENE_KEYFRAME",
              referencePolicy: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "LIGHT" : "NONE",
              panelCategory: "ESTABLISHING_ENVIRONMENT",
              scenePass: "scene_base",
            },
          },
        );
        if (!generation.ok) {
          await persistFalTraceEntry({
            sceneId: keyframe.sceneId,
            sceneKeyframeId,
            provider: "fal",
            model: "fal-ai/flux/dev",
            mode: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "img2img" : "text2img",
            status: "failed",
            requestId: null,
            jobId: null,
            requestPayload: {
              positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
              negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
              width: size.width,
              height: size.height,
              referenceTrace: keyframeReferenceResolution.trace,
            },
            responsePayload: generation.log,
            refsUsed: keyframeRefs,
            lorasUsed: keyframeLoras,
            error: { reason: generation.reason },
          });
          return null;
        }
        await persistFalTraceEntry({
          sceneId: keyframe.sceneId,
          sceneKeyframeId,
          provider: generation.result.provider,
          model: generation.result.model,
          mode: keyframeRefs.length > 0 || keyframeLoras.length > 0 ? "img2img" : "text2img",
          status: "completed",
          requestId: generation.result.requestId ?? null,
          jobId: generation.result.jobId ?? null,
          requestPayload: {
            positivePrompt: typeof metadata.positivePrompt === "string" ? metadata.positivePrompt : item.panel.prompt,
            negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : STD_NEGATIVE,
            width: size.width,
            height: size.height,
            referenceTrace: keyframeReferenceResolution.trace,
          },
          responsePayload: generation.result.raw ?? generation.log,
          refsUsed: keyframeRefs,
          lorasUsed: keyframeLoras,
          timings: generation.result.timings,
        });

        const persisted = await persistImageIfNeeded({
          imageUrl: generation.result.imageUrl,
          projectId,
          chapterId,
          sceneImageId: `scene_keyframe_${sceneKeyframeId}`,
        });
        if (!persisted.ok) {
          return null;
        }

        const mediaAsset = await prisma.mediaAsset.create({
          data: {
            projectId,
            chapterId,
            sceneId: keyframe.sceneId,
            type: "scene_keyframe",
            origin: "generated",
            ownerType: "scene_keyframe",
            ownerId: sceneKeyframeId,
            storageProvider: persisted.persisted ? "supabase" : "fal",
            bucket: persisted.persisted ? (process.env.STORAGE_BUCKET ?? "mymanga-images") : null,
            publicUrl: persisted.url,
            storageKey: `scene-keyframes/${sceneKeyframeId}`,
            metadata: ({
              requestId: generation.result.requestId ?? null,
              jobId: generation.result.jobId ?? null,
              generationLog: generation.log,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        await prisma.sceneKeyframe.update({
          where: { id: sceneKeyframeId },
          data: {
            imageUrl: persisted.url,
            imageAssetId: mediaAsset.id,
            metadata: ({
              ...metadata,
              generatedAt: new Date().toISOString(),
              persisted: persisted.persisted,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        return persisted.url;
      })();

      sceneKeyframeUrlCache.set(sceneKeyframeId, promise);
      return promise;
    }

    // COST-2 : cache des décors purs (environment panels) pour éviter de regénérer le même décor
    const environmentImageCache = new Map<string, string>(); // key: location+mood → imageUrl

    async function processOneImage(item: PlannedImage): Promise<"ok" | "fail"> {
      const panelCharacterNames: string[] = item.panel.characters ?? [];
      const canonRef = panelCharacterNames.map((n) => canonRefByName.get(n)).find(Boolean) ?? null;
      const sceneKeyframeUrl = await ensureSceneKeyframeUrl(item);

      const panelLoras = panelCharacterNames
        .map((n) => loraByCharName.get(n))
        .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
        .slice(0, 2);

      const sceneRefs: string[] = sceneKeyframeUrl ? [sceneKeyframeUrl] : [];
      const sceneReferenceTrace = sceneKeyframeUrl
        ? {
            requested: [{
              assetId: null,
              storageKey: null,
              sourceType: "scene_keyframe" as const,
              sourceUrl: sceneKeyframeUrl,
              resolvedUrl: sceneKeyframeUrl,
              checksum: null,
              ignoredReason: null,
            }],
            used: [{
              assetId: null,
              storageKey: null,
              sourceType: "scene_keyframe" as const,
              sourceUrl: sceneKeyframeUrl,
              resolvedUrl: sceneKeyframeUrl,
              checksum: null,
              ignoredReason: null,
            }],
            ignored: [],
          }
        : { requested: [], used: [], ignored: [] };
      const characterReferenceResolution = canonRef
        ? await resolveStableImageReferences([canonRef], { logPrefix: "[pipeline:canon-ref]" })
        : { urls: [], trace: { requested: [], used: [], ignored: [] } };
      const characterRefs = characterReferenceResolution.urls;
      const panelReferenceTrace = {
        requested: [...sceneReferenceTrace.requested, ...characterReferenceResolution.trace.requested],
        used: [...sceneReferenceTrace.used, ...characterReferenceResolution.trace.used],
        ignored: [...sceneReferenceTrace.ignored, ...characterReferenceResolution.trace.ignored],
      };
      const refs = [...sceneRefs, ...characterRefs];
      const hasCanonRef = characterRefs.length > 0 || panelLoras.length > 0;
      const panelContractMeta = item.baseMetadata.panelContract as {
        purpose?: string;
        shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
        cameraAngle?: string;
        npcPresence?: string[];
        npcGroupPresence?: string[];
        creaturePresence?: string[];
        mustShowLocationSignals?: string[];
      } | undefined;
      const stylePackMeta = item.baseMetadata.stylePack as {
        renderFamily?: string | null;
        lineWeight?: string | null;
        shadingMode?: string | null;
        contrastProfile?: string | null;
        anatomyBias?: string | null;
        backgroundDensity?: string | null;
        cameraLanguage?: string | null;
        negativeConstraints?: string[];
      } | undefined;
      const panelCharDetails = panelCharacterNames.map((name) => {
        const c = rawCharacters.find((rc) => rc.name === name);
        return {
          name,
          gender: c?.gender ?? null,
          hairColor: c?.hairColor ?? null,
          eyeColor: c?.eyeColor ?? null,
          bodyDetails: c?.bodyDetails ?? null,
          appearance: c?.appearance ?? null,
          outfitDefault: c?.outfitDefault ?? null,
          wardrobeDetails: c?.wardrobeDetails ?? null,
          canonSignatureText: c?.canonSignatureText ?? null,
          forbiddenVisualDrift:
            Array.isArray(c?.forbiddenVisualDrift)
              ? c.forbiddenVisualDrift.filter((item): item is string => typeof item === "string")
              : null,
          canonicalReferenceAvailable: Boolean(c?.canonicalReference || c?.canonicalImageUrl),
          paletteSignature:
            c?.visualProfile && typeof c.visualProfile === "object" && "paletteSignature" in c.visualProfile
              ? String(c.visualProfile.paletteSignature ?? "")
              : null,
          accessorySignature:
            c?.wardrobeProfile && typeof c.wardrobeProfile === "object" && "accessories" in c.wardrobeProfile
              ? String(c.wardrobeProfile.accessories ?? "")
              : null,
        };
      });
      const charactersWithFingerprints = panelCharacterNames
        .map((name) => {
          const c = rawCharacters.find((rc) => rc.name === name);
          if (!c) return null;
          const fingerprintRaw = (c as { characterFingerprint?: unknown }).characterFingerprint;
          const fingerprint = fingerprintRaw && typeof fingerprintRaw === "object"
            ? fingerprintRaw as Record<string, unknown>
            : null;
          if (!fingerprint || Object.keys(fingerprint).length === 0) return null;
          return {
            characterId: c.id,
            characterName: c.name,
            fingerprint: fingerprint as never,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      const panelCharacterRoles = panelCharacterNames
        .map((name) => {
          const c = rawCharacters.find((rc) => rc.name === name);
          return typeof c?.roleType === "string" ? c.roleType : null;
        })
        .filter((role): role is string => Boolean(role));
      const panelCharacterIds = panelCharacterNames
        .map((name) => rawCharacters.find((rc) => rc.name === name)?.id ?? null)
        .filter((characterId): characterId is string => Boolean(characterId));
      const panelCharacterTiers = panelCharacterNames.map((name) => {
        const character = rawCharacters.find((rc) => rc.name === name);
        return resolveCharacterImportanceTier({
          roleType: typeof character?.roleType === "string" ? character.roleType : null,
          recurrencePolicy: typeof character?.recurrencePolicy === "string" ? character.recurrencePolicy : null,
        });
      });
      const panelRequiresStrictQa = panelCharacterTiers.some((tier) => getCharacterTierPolicy(tier).qaExpectation === "strict");

      try {
        const preflight = validatePreflightPanel({
          panelId: item.sceneImageId,
          positivePrompt: item.panel.prompt,
          negativePrompt: item.panel.negativePrompt,
          shotType: typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.shotType === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).shotType)
            : null,
          purpose: typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.purpose === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).purpose)
            : null,
          mustShow: Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.mustShow)
            ? ((item.baseMetadata.panelContract as Record<string, unknown>).mustShow as string[])
            : [],
          backgroundExtras: Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.backgroundExtras)
            ? ((item.baseMetadata.panelContract as Record<string, unknown>).backgroundExtras as string[])
            : [],
          hasSceneKeyframe: Boolean(sceneKeyframeUrl),
          hasCharacterLock: hasCanonRef,
          characterCount: panelCharacterNames.length,
        });
        if (!preflight.ok) {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              metadata: ({
                ...item.baseMetadata,
                preflight,
                blockedReason: preflight.reasons.join(","),
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }
        const itemIntentCardMeta = item.baseMetadata.intentCard as { beatEventType?: string } | undefined;
        const routingCtx = buildRoutingContext(
          intensityLayer,
          item.panel,
          panelContractMeta,
          stylePackMeta,
          hasCanonRef,
          adultEngine,
          panelCharacterRoles,
          panelCharacterTiers,
          typeof item.baseMetadata.chapterLookProfileMode === "string" ? item.baseMetadata.chapterLookProfileMode : chapterLookProfile.mode,
          itemIntentCardMeta?.beatEventType ?? null,
        );
        const strategy = computeFalSceneAssessment(routingCtx);
        const panelCriticality = classifyPanelCriticality({
          shotType: panelContractMeta?.shotType,
          purpose: panelContractMeta?.purpose,
          panelCategory: strategy.panelCategory,
          pageNumber: typeof item.baseMetadata.pageNumber === "number" ? item.baseMetadata.pageNumber : null,
          panelNumber: item.panel.panelNumber,
          pagePanelCount: typeof item.baseMetadata.pagePanelCount === "number" ? item.baseMetadata.pagePanelCount : null,
          characterIds: panelCharacterIds,
          characterTiers: panelCharacterTiers,
          visualPriority:
            typeof item.baseMetadata.visualPriority === "string"
              ? item.baseMetadata.visualPriority
              : panelRequiresStrictQa
                ? "critical"
                : null,
        });

        // COST-2 : réutiliser les décors purs déjà générés dans ce chapitre (économie ~15%)
        const panelCategoryStr = strategy.panelCategory as string | null;
        const isEnvironmentPanel =
          panelCategoryStr === "ESTABLISHING_ENVIRONMENT" ||
          panelCategoryStr === "ENVIRONMENT_ONLY" ||
          (panelContractMeta?.purpose === "environment" && (panelCharacterNames.length === 0));
        if (isEnvironmentPanel) {
          const envLocation = typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.environmentPrimary === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).environmentPrimary)
            : (item.panel.prompt.split(" ").slice(0, 3).join("_") ?? "generic");
          const envMood = item.panel.mood ?? "neutral";
          const envCacheKey = `${envLocation}_${envMood}`.toLowerCase().replace(/\s+/g, "_");
          const cachedEnvUrl = environmentImageCache.get(envCacheKey);
          if (cachedEnvUrl) {
            await prisma.sceneImage.update({
              where: { id: item.sceneImageId },
              data: {
                status: "completed",
                imageUrl: cachedEnvUrl,
                persistedUrl: cachedEnvUrl,
                provider: "cache",
                failureReason: null,
                metadata: ({ ...item.baseMetadata, cachedFrom: envCacheKey } as unknown) as Prisma.InputJsonValue,
              },
            });
            console.log(`[pipeline] env_cache_hit sceneImageId=${item.sceneImageId} key=${envCacheKey}`);
            return "ok";
          }
        }

        const isEnvironmentSufficientForNarrativePanel = (validation: Awaited<ReturnType<typeof validateGeneratedPanel>>) => {
          if (strategy.panelCategory === "CHARACTER_LOCK" || strategy.panelCategory === "LOCAL_FIX") return true;
          const scores = validation.qualityScores;
          if (!scores) return false;
          const schoolScene = /school|lycée|lycee|école|ecole|campus|cour du lycée/i.test(item.panel.prompt);
          const visionFindings = validation.visionAnalysis?.findings.join(" | ").toLowerCase() ?? "";
          return !(
            scores.backgroundPresenceScore < 0.62
            || scores.environmentReadabilityScore < 0.6
            || (strategy.interactionCritical && scores.interactionScore < 0.58)
            || (schoolScene && /missing school architecture|generic background|fond vide/.test(visionFindings))
          );
        };

        const pickRerollKind = (
          validation: Awaited<ReturnType<typeof validateGeneratedPanel>>,
          driftPass: boolean,
        ): "REROLL_ENVIRONMENT" | "REROLL_CHARACTER_FIDELITY" | "REROLL_INTERACTION" | "REROLL_STYLE" | "REROLL_COMPOSITION" => {
          const scores = validation.qualityScores;
          if (!scores) return "REROLL_COMPOSITION";
          if (scores.backgroundPresenceScore < 0.62 || scores.environmentReadabilityScore < 0.6) return "REROLL_ENVIRONMENT";
          if (strategy.interactionCritical && scores.interactionScore < 0.58) return "REROLL_INTERACTION";
          if (!driftPass || validation.issues.some((issue) => issue.type === "missing_character" || issue.type === "wrong_hair" || issue.type === "wrong_outfit")) {
            return "REROLL_CHARACTER_FIDELITY";
          }
          if (validation.issues.some((issue) => issue.type === "style_drift")) return "REROLL_STYLE";
          return "REROLL_COMPOSITION";
        };

        const rankCandidate = (
          validation: Awaited<ReturnType<typeof validateGeneratedPanel>>,
          drift: ReturnType<typeof detectVisualDrift>,
        ) => {
          const scores = validation.qualityScores;
          const release = scores?.releaseScore ?? validation.score;
          return release
            + (scores?.backgroundPresenceScore ?? 0) * 0.2
            + (scores?.interactionScore ?? 0) * 0.15
            + (drift.pass ? 0.05 : -0.08);
        };

        const generateAttempt = async (params: {
          scenePass: "scene_base" | "character_reinforcement" | "reroll";
          referencePolicy: "NONE" | "LIGHT" | "STRONG";
          positivePrompt: string;
          negativePrompt: string;
          sizePreset: "character_ref" | "panel_story" | "panel_establishing" | "reroll_local" | "reroll_scene";
          rerollKind?: "REROLL_ENVIRONMENT" | "REROLL_CHARACTER_FIDELITY" | "REROLL_INTERACTION" | "REROLL_STYLE" | "REROLL_COMPOSITION";
          seed?: number;
        }) => {
          const size = getFalImageSizePreset(params.sizePreset);
          const requestPayload = {
            positivePrompt: params.positivePrompt,
            negativePrompt: params.negativePrompt,
            width: size.width,
            height: size.height,
            loras: params.referencePolicy === "NONE" ? [] : panelLoras,
            referenceImageUrls:
              params.referencePolicy === "NONE"
                ? sceneRefs
                : refs,
            referenceTrace: panelReferenceTrace,
            providerParams: {
              contentIntensityLayer: intensityLayer,
              mode: "PANEL_DRAFT",
              seed: params.seed,
              referencePolicy: params.referencePolicy,
              panelCategory: strategy.panelCategory,
              scenePass: params.scenePass,
              rerollKind: params.rerollKind,
              // COST-1 : injecter la criticité pour le choix schnell vs dev
              panelCriticality: panelCriticality.level,
            },
          };
          const generation = await runRoutedImageGeneration(routingCtx, {
            mode: "PANEL_DRAFT",
            positivePrompt: params.positivePrompt,
            negativePrompt: params.negativePrompt,
            width: size.width,
            height: size.height,
            loras: params.referencePolicy === "NONE" ? undefined : (panelLoras.length > 0 ? panelLoras : undefined),
            referenceImageUrls:
              params.referencePolicy === "NONE"
                ? (sceneRefs.length > 0 ? sceneRefs : undefined)
                : (refs.length > 0 ? refs : undefined),
            providerParams: requestPayload.providerParams,
          });
          await persistFalTraceEntry({
            sceneId: String(item.baseMetadata.sceneId ?? ""),
            panelId: item.sceneImageId,
            sceneKeyframeId: typeof item.baseMetadata.sceneKeyframeId === "string" ? item.baseMetadata.sceneKeyframeId : undefined,
            characterId: charactersWithFingerprints[0]?.characterId ?? undefined,
            provider: generation.ok ? generation.result.provider : "fal",
            model: generation.ok ? generation.result.model : String(routingCtx.mode),
            mode: params.referencePolicy === "NONE" && panelLoras.length === 0 ? "text2img" : "img2img",
            status: generation.ok ? "completed" : "failed",
            requestId: generation.ok ? generation.result.requestId ?? null : null,
            jobId: generation.ok ? generation.result.jobId ?? null : null,
            requestPayload,
            responsePayload: generation.ok ? (generation.result.raw ?? generation.log) : generation.log,
            refsUsed: requestPayload.referenceImageUrls as string[],
            lorasUsed: requestPayload.loras as Array<{ url: string; triggerWord: string; scale?: number }>,
            timings: generation.ok ? generation.result.timings : undefined,
            error: generation.ok ? null : { reason: generation.reason },
          });
          return generation;
        };

        const validateAttempt = async (
          generation: Awaited<ReturnType<typeof generateAttempt>>,
          referencePolicy: "NONE" | "LIGHT" | "STRONG",
        ) => {
          if (!generation.ok) return null;
          const validation = await validateGeneratedPanel({
            panelId: item.sceneImageId,
            imageUrl: generation.result.imageUrl,
            requiredCharacters: charactersWithFingerprints,
            metadata: {
              prompt: item.panel.prompt,
              negativePrompt: item.panel.negativePrompt,
              model: generation.result.model,
              sceneBlueprint: item.baseMetadata.sceneBlueprint as SceneBlueprint,
              panelContract: item.baseMetadata.panelContract as {
                shotType?: string;
                purpose?: string;
                mustShow?: string[];
                backgroundExtras?: string[];
              },
              stylePack: stylePackMeta,
              panelQa: {
                pageNumber: typeof item.baseMetadata.pageNumber === "number" ? item.baseMetadata.pageNumber : null,
                panelNumber: item.panel.panelNumber,
                pagePanelCount: typeof item.baseMetadata.pagePanelCount === "number" ? item.baseMetadata.pagePanelCount : null,
                panelCategory: strategy.panelCategory,
                visualPriority: typeof item.baseMetadata.visualPriority === "string" ? item.baseMetadata.visualPriority : null,
                characterRoles: panelCharacterRoles,
                characterIds: panelCharacterIds,
                explicitCriticality: panelCriticality,
              },
            },
          });
          const panelItemLookProfile = typeof (item.baseMetadata.chapterLookProfileMode) === "string"
            ? resolveChapterLookProfile(item.baseMetadata.chapterLookProfileMode as Parameters<typeof resolveChapterLookProfile>[0])
            : chapterLookProfile;
          const panelItemIntentCard = item.baseMetadata.intentCard as Parameters<typeof detectVisualDrift>[0]["intentCard"] | undefined;
          const panelItemSceneAnchor = item.baseMetadata.sceneAnchor as Parameters<typeof detectVisualDrift>[0]["sceneAnchor"] | undefined;
          const panelCharDetailsWithTraits = panelCharDetails.map((charDetail) => {
            const raw = rawCharacters.find((rc) => rc.name === charDetail.name);
            const fp = raw?.characterFingerprint && typeof raw.characterFingerprint === "object"
              ? raw.characterFingerprint as Record<string, unknown>
              : null;
            return {
              ...charDetail,
              hardTraits: Array.isArray(fp?.hardTraits)
                ? (fp!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
                : null,
              softTraits: Array.isArray(fp?.softTraits)
                ? (fp!.softTraits as string[]).filter((t): t is string => typeof t === "string")
                : null,
            };
          });
          const drift = detectVisualDrift({
            prompt: item.panel.prompt,
            characters: panelCharDetailsWithTraits,
            usedLoras: referencePolicy !== "NONE" && panelLoras.length > 0,
            usedRefs: referencePolicy !== "NONE" && characterRefs.length > 0,
            panelCategory: strategy.panelCategory ?? null,
            beatEventType: panelItemIntentCard?.beatEventType ?? (typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.purpose === "string"
              ? String((item.baseMetadata.panelContract as Record<string, unknown>).purpose)
              : null),
            chapterLookProfile: panelItemLookProfile,
            sceneAnchor: panelItemSceneAnchor ?? null,
            intentCard: panelItemIntentCard ?? null,
          });
          return {
            generation,
            validation,
            drift,
            validationScore: validation.score,
            validationDetails: buildSharedValidationDetails(validation),
            rerollKind: pickRerollKind(validation, drift.pass),
          };
        };

        const baseReferencePolicy = strategy.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "NONE" : (strategy.referencePolicy ?? "LIGHT");
        let bestAttempt = await validateAttempt(
          await generateAttempt({
            scenePass: strategy.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "scene_base" : "character_reinforcement",
            referencePolicy: baseReferencePolicy,
            positivePrompt: item.panel.prompt,
            negativePrompt: item.panel.negativePrompt,
            sizePreset: strategy.sizePreset,
          }),
          baseReferencePolicy,
        );

        if (!bestAttempt) {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              failureReason: "initial_generation_failed",
              metadata: ({
                ...item.baseMetadata,
                blockedReason: "initial_generation_failed",
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }

        const sceneFirstEligible =
          strategy.panelCategory === "ESTABLISHING_ENVIRONMENT"
          || strategy.crowdCritical
          || strategy.interactionCritical;
        let rerollCount = 0;

        if (
          sceneFirstEligible
          && strategy.continuityCritical
          && hasCanonRef
          && isEnvironmentSufficientForNarrativePanel(bestAttempt.validation)
        ) {
          const reinforcementAttempt = await validateAttempt(
            await generateAttempt({
              scenePass: "character_reinforcement",
              referencePolicy: "LIGHT",
              positivePrompt: `${item.panel.prompt}, preserve character continuity while keeping full scene composition and readable environment`,
              negativePrompt: item.panel.negativePrompt,
              sizePreset: "reroll_scene",
            }),
            "LIGHT",
          );
          if (
            reinforcementAttempt
            && rankCandidate(reinforcementAttempt.validation, reinforcementAttempt.drift) >= rankCandidate(bestAttempt.validation, bestAttempt.drift) - 0.04
          ) {
            bestAttempt = reinforcementAttempt;
            rerollCount++;
          }
        }

        // B1-2 : MAX_REROLL basé sur la criticité du panel (pas hardcodé)
        const MAX_REROLL = getMaxRerolls(panelCriticality.level, strategy.retryPolicy);
        const shouldReroll =
          bestAttempt.validation.requiredReroll
          || !bestAttempt.drift.pass
          || !isEnvironmentSufficientForNarrativePanel(bestAttempt.validation);

        if (shouldReroll && MAX_REROLL > 0) {
          console.warn(`[pipeline] reroll required panel=${item.sceneImageId} kind=${bestAttempt.rerollKind} score=${bestAttempt.validationScore.toFixed(2)}`);
          for (let attempt = 0; attempt < MAX_REROLL; attempt++) {
            const strongerEnvironmentPrompt =
              bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                ? [
                    "wide manga panel with readable environment",
                    "clear foreground midground background separation",
                    ...(Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.mustShow)
                      ? ((item.baseMetadata.panelContract as Record<string, unknown>).mustShow as string[])
                      : []
                    ).slice(0, 5),
                  ].join(", ")
                : "";
            const strongerInteractionPrompt =
              bestAttempt.rerollKind === "REROLL_INTERACTION"
                ? "social interaction must be obvious, body language and environment reaction clearly readable"
                : "";
            const strongerCharacterPrompt =
              bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY"
                ? "same hero face, same hair, same outfit, same silhouette, preserve character continuity"
                : "";
            const rerollPolicy =
              bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY"
                ? "STRONG"
                : bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                  ? "NONE"
                  : "LIGHT";
            const rerollAttempt = await validateAttempt(
              await generateAttempt({
                scenePass: "reroll",
                referencePolicy: rerollPolicy,
                positivePrompt: [item.panel.prompt, strongerEnvironmentPrompt, strongerInteractionPrompt, strongerCharacterPrompt].filter(Boolean).join(", "),
                negativePrompt: [
                  item.panel.negativePrompt,
                  bestAttempt.rerollKind === "REROLL_ENVIRONMENT" ? "empty background, studio backdrop, flat grey backdrop, blurry environment" : "",
                  bestAttempt.rerollKind === "REROLL_INTERACTION" ? "weak social interaction, disconnected characters" : "",
                  bestAttempt.rerollKind === "REROLL_CHARACTER_FIDELITY" ? "wrong hair color, wrong outfit, inconsistent face" : "",
                ].filter(Boolean).join(", "),
                sizePreset:
                  bestAttempt.rerollKind === "REROLL_ENVIRONMENT" || bestAttempt.rerollKind === "REROLL_COMPOSITION"
                    ? "reroll_scene"
                    : "reroll_local",
                rerollKind: bestAttempt.rerollKind,
                seed: Date.now() + attempt,
              }),
              rerollPolicy,
            );
            rerollCount++;
            if (rerollAttempt && rankCandidate(rerollAttempt.validation, rerollAttempt.drift) > rankCandidate(bestAttempt.validation, bestAttempt.drift)) {
              bestAttempt = rerollAttempt;
              if (!bestAttempt.validation.requiredReroll && bestAttempt.drift.pass && isEnvironmentSufficientForNarrativePanel(bestAttempt.validation)) {
                break;
              }
            }
          }
        }

        const persisted = await persistImageIfNeeded({
          imageUrl: bestAttempt.generation.result.imageUrl,
          projectId,
          chapterId,
          sceneImageId: item.sceneImageId,
        });

        if (!persisted.ok) {
          const persistError = (persisted as { error?: string }).error ?? "persist_failed";
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "failed",
              failureReason: `persist_failed: ${persistError}`,
              metadata: ({
                ...item.baseMetadata,
                error: persistError,
                sourceUrl: bestAttempt.generation.result.imageUrl,
                generationLog: bestAttempt.generation.log,
                referenceTrace: panelReferenceTrace,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }

        const finalLog = bestAttempt.generation.log;
        const finalRouting = bestAttempt.generation.routing;
        const finalProvider = bestAttempt.generation.result.provider;
        const finalModel = bestAttempt.generation.result.model;
        const primaryCharacterId =
          charactersWithFingerprints[0]?.characterId
          ?? rawCharacters.find((character) => character.name === item.panel.characters[0])?.id;
        const visualConsistency =
          primaryCharacterId
            ? await scoreVisualConsistency(prisma, {
                imageId: item.sceneImageId,
                characterId: primaryCharacterId,
                generatedMetadata: {
                  prompt: item.panel.prompt,
                },
              })
            : null;
        const combinedConsistencyScore =
          bestAttempt.validationDetails?.qualityScores?.releaseScore != null
            ? visualConsistency
              ? (bestAttempt.validationDetails.qualityScores.releaseScore + visualConsistency.overall) / 2
              : bestAttempt.validationDetails.qualityScores.releaseScore
            : bestAttempt.drift.score;
        const shouldBlockForReview =
          bestAttempt.validation.requiredReroll
          || (bestAttempt.validation.qaWasRequired === true && bestAttempt.validation.qaWasExecuted !== true);

        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            imageUrl: persisted.url,
            // B1-3 : stocker l'URL persistée (Supabase) séparément de l'URL temporaire fal.ai
            persistedUrl: persisted.persisted ? persisted.url : null,
            provider: finalProvider,
            model: finalModel,
            status: shouldBlockForReview ? "blocked" : "completed",
            consistencyScore: combinedConsistencyScore,
            routingDecision: finalRouting as unknown as Prisma.InputJsonValue,
            metadata: ({
              ...item.baseMetadata,
              generationLog: finalLog,
              falStrategy: finalRouting,
              persisted: persisted.persisted,
              temporary: "temporary" in persisted ? (persisted.temporary as boolean) : undefined,
              storageWarning: "warning" in persisted ? (persisted.warning as string) : undefined,
              sourceUrl: bestAttempt.generation.result.imageUrl,
              requestedCanonicalRef: canonRef?.sourceUrl ?? canonRef?.publicUrl ?? canonRef?.signedUrl ?? canonRef?.falCdnUrl ?? null,
              canonRefUsed: characterReferenceResolution.trace.used[0]?.resolvedUrl ?? null,
              referenceTrace: panelReferenceTrace,
              driftScore: bestAttempt.drift.score,
              driftPass: bestAttempt.drift.pass,
              driftSeverity: bestAttempt.drift.severity,
              driftIssues: bestAttempt.drift.issues.slice(0, 5),
              driftReasons: bestAttempt.drift.reasons.slice(0, 8),
              driftMissingTraits: bestAttempt.drift.missingTraits.slice(0, 6),
              driftConflictingTraits: bestAttempt.drift.conflictingTraits.slice(0, 6),
              // Phase 8 : sous-scores drift 2.0
              styleDriftScore: bestAttempt.drift.styleDriftScore,
              characterDriftScore: bestAttempt.drift.characterDriftScore,
              beatAlignmentScore: bestAttempt.drift.beatAlignmentScore,
              sceneContinuityScore: bestAttempt.drift.sceneContinuityScore,
              chapterLookMismatch: bestAttempt.drift.chapterLookMismatch,
              driftRecommendedAction: bestAttempt.drift.recommendedAction,
              driftConfidence: bestAttempt.drift.confidence,
              // Phase 12 : panel quality gate
              panelQualityGate: (() => {
                const intentMeta = item.baseMetadata.intentCard as { beatEventType?: string; motionLevel?: number; sfxForbiddenTypes?: string[]; mustShow?: string[] } | undefined;
                const panelSfxRaw = Array.isArray(item.baseMetadata.sfx) ? item.baseMetadata.sfx as string[] : (typeof item.baseMetadata.sfx === "string" ? [item.baseMetadata.sfx] : null);
                return runPanelQualityGate({
                  panelPrompt: item.panel.prompt,
                  beatEventType: intentMeta?.beatEventType ?? null,
                  motionLevel: intentMeta?.motionLevel ?? undefined,
                  sfx: panelSfxRaw,
                  chapterLookProfileMode: chapterLookProfile.mode,
                  sfxForbiddenTypes: intentMeta?.sfxForbiddenTypes ?? null,
                  mustShow: intentMeta?.mustShow ?? null,
                });
              })(),
              promptVisualConsistency: visualConsistency,
              validationScore: bestAttempt.validationScore,
              validationDetails: bestAttempt.validationDetails,
              panelCriticality: bestAttempt.validation.panelCriticality,
              qaWasRequired: bestAttempt.validation.qaWasRequired,
              qaWasExecuted: bestAttempt.validation.qaWasExecuted,
              qaFailureReason: bestAttempt.validation.qaFailureReason,
              qaBypassReason: bestAttempt.validation.qaBypassReason,
              criticalQaBlocked: shouldBlockForReview,
              panelCharacterRoles,
              characterIds: panelCharacterIds,
              rerollCount,
              rerollKind: bestAttempt.rerollKind,
              scenePass: finalRouting.panelCategory === "ESTABLISHING_ENVIRONMENT" ? "scene_first" : "single_or_light_ref",
            } as unknown) as Prisma.InputJsonValue,
          },
        });

        // COST-2 : stocker dans le cache si c'est un environment panel réussi
        if (isEnvironmentPanel && persisted.url) {
          const envLocation = typeof (item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.environmentPrimary === "string"
            ? String((item.baseMetadata.panelContract as Record<string, unknown>).environmentPrimary)
            : (item.panel.prompt.split(" ").slice(0, 3).join("_") ?? "generic");
          const envMood = item.panel.mood ?? "neutral";
          const envCacheKey = `${envLocation}_${envMood}`.toLowerCase().replace(/\s+/g, "_");
          environmentImageCache.set(envCacheKey, persisted.url);
        }

        return "ok";
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        console.error(`[pipeline] image failed sceneImageId=${item.sceneImageId} error=${msg}`);
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            status: "failed",
            failureReason: msg,
            retryCount: { increment: 1 },
            metadata: ({
              ...item.baseMetadata,
              error: msg,
            } as unknown) as Prisma.InputJsonValue,
          },
        });
        return "fail";
      }
    }

    // Round-robin : séquentiel intra-scène, parallèle inter-scènes.
    // IMPORTANT: FAL limite à 10 requêtes concurrentes; on reste bien en dessous
    // pour éviter les 429 + cascades de timeouts/aborts.
    const maxParallelImageGenerations = Math.max(
      1,
      Number.parseInt(process.env.IMAGE_GEN_MAX_PARALLEL ?? "4", 10) || 4,
    );
    const imagesByScene = new Map<number, PlannedImage[]>();
    for (const img of plannedImages) {
      const arr = imagesByScene.get(img.sceneIndex) ?? [];
      arr.push(img);
      imagesByScene.set(img.sceneIndex, arr);
    }
    const sceneIndexes = [...imagesByScene.keys()].sort((a, b) => a - b);
    const maxPanelsPerScene = Math.max(...sceneIndexes.map((s) => imagesByScene.get(s)?.length ?? 0), 0);

    for (let round = 0; round < maxPanelsPerScene; round++) {
      const roundBatch: PlannedImage[] = [];
      for (const scIdx of sceneIndexes) {
        const sceneImages = imagesByScene.get(scIdx);
        if (sceneImages && round < sceneImages.length) {
          roundBatch.push(sceneImages[round]!);
        }
      }
      if (roundBatch.length === 0) continue;

      for (let start = 0; start < roundBatch.length; start += maxParallelImageGenerations) {
        const chunk = roundBatch.slice(start, start + maxParallelImageGenerations);
        const results = await Promise.all(chunk.map(processOneImage));
        for (const r of results) {
          if (r === "ok") generatedCount++;
          else failedCount++;
        }
      }
      await setJobProgress(
        jobId,
        {
          key: "generate_images",
          label: `Génération images (${generatedCount}/${plannedImages.length})`,
          detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
        },
        "running",
      );
    }

    await setJobProgress(
      jobId,
      {
        key: "generate_images",
        label: `Images générées (${generatedCount}/${plannedImages.length})`,
        detail: failedCount > 0 ? `${failedCount} échec(s)` : undefined,
      },
      failedCount === plannedImages.length ? "failed" : "completed",
    );

    // ── Couverture de chapitre (hero shot) ────────────────────────────────
    let coverUrl: string | null = null;
    try {
      const { composeCoverPrompt, inferCoverMood } = await import("@manga-ai-studio/ai");
      const coverMood = inferCoverMood(context.project.tone ?? "dramatique", context.project.primaryGenre ?? "fantasy");
      const coverPrompt = composeCoverPrompt({
        chapterTitle: revisedBundle.outline.chapter_title ?? `Chapitre ${chapterNumber}`,
        chapterNumber,
        chapterSummary: revisedBundle.memory.narrativeSummary,
        cliffhanger: revisedBundle.outline.cliffhanger,
        genre: context.project.primaryGenre ?? "fantasy",
        tone: context.project.tone ?? "dramatique",
        visualStyle: context.project.visualStyle ?? "manga",
        mood: coverMood,
        characters: rawCharacters.slice(0, 2).map((c) => ({
          name: c.name,
          gender: c.gender,
          appearance: c.appearance,
          hairColor: c.hairColor,
          eyeColor: c.eyeColor,
          outfitDefault: c.outfitDefault,
        })),
        stylePack: stylePacks[0] ? { name: stylePacks[0].renderFamily, visualStyle: project?.visualStyle ?? null } : null,
        contentIntensityLayer: intensityLayer,
      });

      const coverResult = await runRoutedImageGeneration(
        { mode: "PANEL_DRAFT", contentIntensityLayer: intensityLayer, isNewCharacter: false, hasCanonReferences: false, characterCountInScene: 2, needsInpaint: false, needsPoseVariation: false, preferPhotorealCover: false, explicitBlocked: false, goreStylizedMature: false },
        { mode: "PANEL_DRAFT", positivePrompt: coverPrompt.positive, negativePrompt: coverPrompt.negative, width: coverPrompt.width, height: coverPrompt.height, providerParams: { contentIntensityLayer: intensityLayer, mode: "COVER_ART" } },
      );
      if (coverResult.ok) {
        const persisted = await persistImageIfNeeded({ imageUrl: coverResult.result.imageUrl, projectId, chapterId, sceneImageId: `cover_${chapterId}` });
        if (persisted.ok) {
          coverUrl = persisted.url;
          await prisma.chapter.update({ where: { id: chapterId }, data: { coverImageUrl: coverUrl } });
        }
      }
    } catch (e) {
      console.warn("[pipeline] cover generation skipped:", e instanceof Error ? e.message : e);
    }

    const chapterQualityRows = await prisma.sceneImage.findMany({
      where: {
        scene: {
          chapterId,
        },
      },
      select: {
        consistencyScore: true,
        metadata: true,
      },
    });
    const chapterQualityReport = computeChapterQualityReport(chapterQualityRows);
    console.log(
      `[pipeline] quality average=${chapterQualityReport.averageReleaseScore.toFixed(2)} accepted=${chapterQualityReport.premiumReleaseAccepted} weakPanels=${chapterQualityReport.weakPanels.length}`
    );
    const persistedRuntime = buildPersistedChapterRuntimeState({
      studioSnapshot,
      chapterId,
      chapterNumber,
      jobId,
      totalPlannedImages: plannedImages.length,
      generatedCount,
      failedCount,
      qualityReport: chapterQualityReport,
    });
    const generationRunSummary = buildRuntimeDebugSummary({
      generationRunSummary: persistedRuntime.generationRunSummary,
      productionSource,
    });

    // Mettre à jour le statut du chapitre
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: persistedRuntime.persistedChapterStatus,
        ...(persistedRuntime.structuredRuntimeFields
          ? {
              studioStatus: persistedRuntime.structuredRuntimeFields.studioStatus,
              studioCurrentStep: persistedRuntime.structuredRuntimeFields.studioCurrentStep,
              studioUpdatedAt: persistedRuntime.structuredRuntimeFields.studioUpdatedAt
                ? new Date(persistedRuntime.structuredRuntimeFields.studioUpdatedAt)
                : null,
              studioAutosaveVersion: persistedRuntime.structuredRuntimeFields.studioAutosaveVersion,
              minimumImages: persistedRuntime.structuredRuntimeFields.minimumImages,
              generatedImages: persistedRuntime.structuredRuntimeFields.generatedImages,
              acceptedImages: persistedRuntime.structuredRuntimeFields.acceptedImages,
              rejectedImages: persistedRuntime.structuredRuntimeFields.rejectedImages,
              missingImages: persistedRuntime.structuredRuntimeFields.missingImages,
              criticalPanelsCount: persistedRuntime.structuredRuntimeFields.criticalPanelsCount,
              criticalPanelsBlocked: persistedRuntime.structuredRuntimeFields.criticalPanelsBlocked,
              criticalPanelsMissingQa: persistedRuntime.structuredRuntimeFields.criticalPanelsMissingQa,
              reviewBlockedReason: persistedRuntime.structuredRuntimeFields.reviewBlockedReason,
            }
          : {}),
        outline: ({
          ...revisedBundle.outline,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.outline,
          generationRunSummary,
          imageStats: {
            total: plannedImages.length,
            generated: generatedCount,
            failed: failedCount,
            accepted: chapterQualityReport.acceptedImages,
            rejected: chapterQualityReport.rejectedImages,
            minimumAcceptedImages: chapterQualityReport.minimumAcceptedImages,
            missingImages: chapterQualityReport.missingImages,
          },
          runtimeSources: {
            outlineSource: productionSource.source,
            fallbackUsed: productionSource.fallbackUsed,
            legacyBridgeUsed: productionSource.legacyBridgeUsed,
          },
          qualityReport: chapterQualityReport,
        } as unknown) as Prisma.InputJsonValue,
        script: ({
          ...revisedBundle.script,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
          generationRunSummary,
          imageStats: {
            total: plannedImages.length,
            generated: generatedCount,
            failed: failedCount,
            accepted: chapterQualityReport.acceptedImages,
            rejected: chapterQualityReport.rejectedImages,
            minimumAcceptedImages: chapterQualityReport.minimumAcceptedImages,
            missingImages: chapterQualityReport.missingImages,
          },
          runtimeSources: {
            outlineSource: productionSource.source,
            fallbackUsed: productionSource.fallbackUsed,
            legacyBridgeUsed: productionSource.legacyBridgeUsed,
          },
          qualityReport: chapterQualityReport,
        } as unknown) as Prisma.InputJsonValue,
      },
    });

    // ── Étape 5 : Mémoire et timeline ─────────────────────────────────────
    await setJobProgress(
      jobId,
      { key: "update_memory", label: "Mémoire et timeline" },
      "running",
    );

    const canonWarnings = detectCanonWarnings({
      characterStatuses: context.characters.map((c) => ({ name: c.name, status: c.status })),
      scriptText: JSON.stringify(revisedBundle.script),
    });
    const chapterSnapshot = buildChapterSnapshot({
      kernel: continuityKernel,
      chapterId,
      chapterNumber,
      title: revisedBundle.outline.chapter_title,
      summary: revisedBundle.memory.narrativeSummary,
      sceneSnapshots: validatedSceneSnapshots,
      continuityWarnings: [...canonWarnings, ...kernelValidationWarnings],
    });

    const snapshot = await persistChapterMemory(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      title: revisedBundle.outline.chapter_title,
      summary: revisedBundle.memory.narrativeSummary,
      structuredState: {
        ...revisedBundle.memory.structuredState,
        canonWarnings,
        continuityNotes: continuity.notes,
        qualityReport: chapterQualityReport,
        chapterSnapshot,
        continuityKernel: {
          storyBible: continuityKernel.storyBible,
          worldState: continuityKernel.worldState,
          characterStates: continuityKernel.characterStates,
          locationStates: continuityKernel.locationStates,
          relationshipGraph: continuityKernel.relationshipGraph,
          eventLog: continuityKernel.eventLog.slice(0, 40),
          arcRegistry: continuityKernel.arcRegistry,
        },
      },
      timelineEvents: revisedBundle.memory.timelineEvents,
      openLoops: revisedBundle.memory.openLoops,
      characterSnapshots: continuityKernel.characterStates as unknown as Prisma.InputJsonValue,
      wardrobeSnapshots: continuityKernel.characterStates.map((state) => ({
        characterId: state.characterId,
        outfit: state.currentState.outfit,
        allowedOutfitVariations: state.physicalCanon.allowedOutfitVariations,
      })) as unknown as Prisma.InputJsonValue,
      relationshipSnapshots: continuityKernel.relationshipGraph as unknown as Prisma.InputJsonValue,
      visualContinuityWarnings: [...canonWarnings, ...kernelValidationWarnings] as unknown as Prisma.InputJsonValue,
    });

    await setJobProgress(
      jobId,
      { key: "update_memory", label: "Mémoire et timeline" },
      "completed",
    );

    // ── Continuity Diff : analyse de cohérence avant publication ────────────
    console.log(`[pipeline] Running continuity diff for chapter ${chapterNumber}`);
    const continuityReport = await runContinuityDiff(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      outline: revisedBundle.outline,
      script: revisedBundle.script,
      generatedImages: plannedImages.map((img) => ({
        id: img.sceneImageId,
        sceneId: String(img.sceneIndex),
        metadata: img.baseMetadata,
      })),
    });

    console.log(`[pipeline] Continuity score: ${continuityReport.score.toFixed(2)}`);
    if (continuityReport.issues.length > 0) {
      console.warn(`[pipeline] Continuity issues detected:`, continuityReport.issues);
    }

    // ── Construire et persister le nouveau canon state ───────────────────────
    console.log(`[pipeline] Building chapter canon state`);
    const canonStateData = await buildChapterCanonState(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      outline: revisedBundle.outline,
      script: revisedBundle.script,
      summary: revisedBundle.memory.narrativeSummary,
      cliffhanger: revisedBundle.outline.cliffhanger,
    });
    const materializedCanonState = materializeCanonStateFromChapterSnapshot(
      canonStateData,
      chapterSnapshot,
    );

    // Enrichir avec les warnings du continuity diff
    materializedCanonState.continuityWarnings = uniq([
      ...materializedCanonState.continuityWarnings,
      ...continuityReport.issues.map((issue) => issue.message),
    ]);

    await persistChapterCanonState(prisma, {
      projectId,
      chapterId,
      chapterNumber,
      canonStateData: materializedCanonState,
    });

    console.log(`[pipeline] Canon state persisted with ${continuityReport.issues.length} warnings`);

    // ── Finalisation ───────────────────────────────────────────────────────
    const hasDegradedFallback = revisedBundle.generationDiagnostics.degradedModes.length > 0;
    const finalStatus =
      failedCount === plannedImages.length
        ? "failed"
        : canonWarnings.length > 0
          || kernelValidationWarnings.length > 0
          || failedCount > 0
          || hasDegradedFallback
          || !chapterQualityReport.premiumReleaseAccepted
          ? "partial_success"
          : "completed";

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        output: {
          currentStep: "done",
          steps: [
            { key: "build_context", label: "Contexte projet", status: "completed" },
            {
              key: "generate_bundle",
              label: "Direction, outline, script, storyboard",
              status: "completed",
            },
            { key: "continuity_pass", label: "Continuité IA avant images", status: "completed" },
            { key: "story_coherence_pass", label: "Cohérence narrative", status: "completed" },
            { key: "persist_chapter", label: "Persistance chapitre", status: "completed" },
            {
              key: "generate_images",
              label: `Images : ${generatedCount}/${plannedImages.length}`,
              status: failedCount === plannedImages.length ? "failed" : "completed",
            },
            { key: "update_memory", label: "Mémoire et timeline", status: "completed" },
          ],
          plotOptions: revisedBundle.plotOptions,
          creativeDirection: revisedBundle.creativeDirection,
          creativityControls: effectiveCreativeControls,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics,
          memorySnapshotId: snapshot.id,
          canonWarnings,
          continuityKernelWarnings: kernelValidationWarnings,
          continuityNotes: continuity.notes,
          narrativeNotes: narrative.notes,
          imageStats: { total: plannedImages.length, generated: generatedCount, failed: failedCount },
          qualityReport: chapterQualityReport,
          continuityReport: {
            score: continuityReport.score,
            issuesCount: continuityReport.issues.length,
            criticalIssues: continuityReport.issues.filter((i) => i.severity === "critical").length,
            majorIssues: continuityReport.issues.filter((i) => i.severity === "major").length,
            suggestedRepairs: continuityReport.suggestedRepairs,
          },
        },
      },
    });

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pipeline_failed";
    const stack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    console.error(`[pipeline] FAILED jobId=${jobId} error=${message}`, stack ?? "");
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: { message, stack },
        },
      });
    } catch (dbErr) {
      console.error(`[pipeline] Cannot update job status:`, dbErr instanceof Error ? dbErr.message : dbErr);
    }
    return { ok: false as const, error: message };
  }
}
