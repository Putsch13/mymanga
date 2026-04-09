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
  getPremiumImageSize,
  type StoryboardPanel,
  type RoutingContext,
  type ProjectContextForChapter,
} from "@manga-ai-studio/ai";
import { parseApprovedOutline } from "@manga-ai-studio/core";
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
};

type PipelineBundle = Awaited<ReturnType<typeof generateChapterBundle>>;

const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";
const PANEL_DRAFT_SIZE = getPremiumImageSize("PANEL_DRAFT");

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

function parseSupabasePublicObjectUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    const rest = parsed.pathname.slice(idx + marker.length); // bucket/path...
    const [bucket, ...pathParts] = rest.split("/");
    if (!bucket || pathParts.length === 0) return null;
    return { bucket, path: decodeURIComponent(pathParts.join("/")) };
  } catch {
    return null;
  }
}

async function signIfSupabaseStorageUrl(originalUrl: string): Promise<string> {
  const ref = parseSupabasePublicObjectUrl(originalUrl);
  if (!ref) return originalUrl;
  const client = getStorageClient();
  if (!client) return originalUrl;
  const signed = await client.storage.from(ref.bucket).createSignedUrl(ref.path, 60 * 30); // 30 minutes
  if (signed.error || !signed.data?.signedUrl) return originalUrl;
  return signed.data.signedUrl;
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
    purpose?: "establishing" | "reaction" | "dialogue" | "action" | "reveal" | "aftermath";
    shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
    mustShowLocationSignals?: string[];
    backgroundElements?: string[];
    npcGroupPresence?: string[];
    mustAvoidPortraitIsolation?: boolean;
  },
  hasCanonRef: boolean,
  adultEngine?: "realistic" | "fantasy",
): RoutingContext {
  const text = `${panel.camera} ${panel.caption} ${panel.prompt}`.toLowerCase();
  const environmentCritical =
    panelContract.mustAvoidPortraitIsolation === true
    || panelContract.shotType === "wide"
    || panelContract.purpose === "establishing"
    || panel.characters.length >= 2
    || (panelContract.mustShowLocationSignals?.length ?? 0) > 0
    || (panelContract.backgroundElements?.length ?? 0) >= 2
    || (panelContract.npcGroupPresence?.length ?? 0) > 0;
  return {
    mode: "PANEL_DRAFT",
    contentIntensityLayer: intensityLayer,
    adultEngine,
    isNewCharacter: false,
    hasCanonReferences: hasCanonRef,
    characterCountInScene: panel.characters.length,
    purpose: panelContract.purpose,
    npcCount: /(crowd|guard|merchant|passant|client|audience|foule|garde)/.test(text) ? 1 : 0,
    creatureCount: /(creature|monster|spirit|dragon|familiar|beast|mutant)/.test(text) ? 1 : 0,
    shotType: panelContract.shotType ?? (/(wide|establishing|panorama|vue d'ensemble)/.test(text)
      ? "wide"
      : /(over shoulder|over-shoulder|par-dessus l'épaule)/.test(text)
        ? "over_shoulder"
        : /(extreme close)/.test(text)
          ? "extreme_closeup"
          : /(close-up|closeup|gros plan)/.test(text)
            ? "closeup"
            : "medium"),
    environmentPriority: environmentCritical
      ? "high"
      : /(environment|decor|décor|background|ruins|city|forest|garden|lab|arena|crowd)/.test(text)
        ? "high"
        : panel.characters.length >= 2
          ? "medium"
          : "low",
    environmentCritical,
    styleReferenceRequired: hasCanonRef || /(style|render family|ink|shading)/.test(text),
    needsInpaint: false,
    needsPoseVariation: false,
    preferPhotorealCover: false,
    explicitBlocked: intensityLayer === "RESTRICTED_BLOCKED_VISUAL",
    goreStylizedMature:
      intensityLayer === "MATURE_VISUAL" || intensityLayer === "ADULT_EXPLICIT",
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
  const releaseThreshold = Number(process.env.PREMIUM_RELEASE_SCORE_THRESHOLD ?? "0.72");
  const completed = rows.filter((row) => typeof row.consistencyScore === "number");
  const averageReleaseScore =
    completed.length > 0
      ? completed.reduce((acc, row) => acc + Number(row.consistencyScore ?? 0), 0) / completed.length
      : 0;
  const weakPanels = rows
    .map((row, index) => {
      const metadata = asRecord(row.metadata);
      const validationDetails = asRecord(metadata.validationDetails);
      const qualityScores = asRecord(validationDetails.qualityScores);
      return {
        panelIndex: index + 1,
        releaseScore:
          typeof qualityScores.releaseScore === "number"
            ? qualityScores.releaseScore
            : row.consistencyScore,
        issues: Array.isArray(validationDetails.issues)
          ? validationDetails.issues.length
          : 0,
      };
    })
    .filter((row) => typeof row.releaseScore === "number" && row.releaseScore < releaseThreshold)
    .slice(0, 8);

  return {
    averageReleaseScore,
    releaseThreshold,
    totalPanels: rows.length,
    passingPanels: rows.length - weakPanels.length,
    weakPanels,
    premiumReleaseAccepted: completed.length > 0 && averageReleaseScore >= releaseThreshold && weakPanels.length === 0,
  };
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
        },
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
        characterName: candidate.name,
        triggerWord,
        imageUrls: seedRefs,
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
              failedAt: new Date().toISOString(),
            },
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
            trainedAt: new Date().toISOString(),
          },
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

  const [chapter, project, stylePacks, loraAttachments, rawCharacters] = await Promise.all([
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
          select: { imageUrl: true, isPrimary: true },
        },
      },
    }).then(async (chars) => {
      // Ref canon par personnage : prendre CharacterVisualRef.isPrimary (ou la plus récente)
      const canonUrls: Record<string, string> = {};
      for (const c of chars) {
        const primaryRef = c.visualRefs.find((v) => v.isPrimary && v.imageUrl);
        const bestRef = primaryRef ?? c.visualRefs.find((v) => v.imageUrl);
        if (bestRef?.imageUrl) {
          canonUrls[c.id] = bestRef.imageUrl;
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
          canonicalImageUrl: canonUrls[c.id] ?? null,
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
  ]);

  if (!chapter) {
    return { ok: false as const, error: "invalid_job" };
  }

  const projectId = job.projectId;
  const chapterId = job.chapterId;
  const chapterNumber = chapter.chapterNumber;
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
    const knownLocations = await prisma.location.findMany({
      where: { projectId },
      select: { name: true, description: true },
      take: 20,
    }).catch(() => [] as Array<{ name: string; description: string | null }>);

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
    const bundle = await generateChapterBundle({
      chapterNumber,
      chapterTitle: chapter.title,
      userIntent: enrichedIntent || chapter.userIntent || `Continuer ${context.project.title}`,
      selectedPlotLabel,
      context,
      approvedOutline: parseApprovedOutline(asRecord(chapter.outline).approvedOutline),
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
    });
    revisedBundle = narrative.bundle;
    const integrity = enforceBundleIntegrity(revisedBundle);
    revisedBundle = integrity.bundle;
    revisedBundle = syncVisualsAfterNarrativePass(revisedBundle);

    // Auto-détection et création des PNJ non-déclarés
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

    if (bundleCharNames.size > 0) {
      console.log(`[pipeline] auto-creating ${bundleCharNames.size} PNJ: ${[...bundleCharNames].join(", ")}`);
      for (const pnjName of bundleCharNames) {
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
              },
            },
          });

          const persistentSceneExtras = await ensureSceneExtras(tx, {
            sceneId: createdScene.id,
            locationId: scene.location,
            projectId,
            requiredExtras: inferRequiredSceneExtras(scene),
          });

          const storyboardPage = revisedBundle.storyboard.pages[index];
          if (!storyboardPage) continue;

          for (const panel of storyboardPage.panels) {
            // Compose le prompt enrichi via le manga-prompt-composer
              const stylePack = stylePacks[0];
              let composedPositive = panel.prompt;
              let composedNegative = panel.negativePrompt;
              const panelCanonRefs = panel.characters
                .map((name) => rawCharacters.find((c) => c.name === name)?.canonicalImageUrl)
                .filter((url): url is string => Boolean(url));
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
              });
              const panelBackgroundExtras = [
                ...(panelContractBase.backgroundElements ?? []),
                ...(panelContractBase.mandatoryLocationSignals ?? []),
                ...(panelContractBase.npcGroupPresence ?? []),
                ...persistentSceneExtras.map((extra) => `${extra.archetype}:${extra.anchorSlot}`),
              ].filter(Boolean).slice(0, 8);
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
                  backgroundExtras: [...panelContractBase.backgroundExtras, ...panelBackgroundExtras].slice(0, 8),
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

              try {
                const promptCharacters = rawCharacters
                  .filter((c) => panel.characters.includes(c.name))
                  .map((c) => {
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
                      bodyDetails: c.bodyDetails,
                      wardrobeDetails: c.wardrobeDetails,
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
              ].filter(Boolean).join(". "),
              camera: panel.camera,
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
            });
            composedPositive = [
              composed.positive,
              panelContract.mustNotShow.length > 0 ? `avoid showing: ${panelContract.mustNotShow.join(", ")}` : "",
            ].filter(Boolean).join(", ");
            composedNegative = composed.negative;
          } catch {
            // fallback sur le prompt du storyboard
          }

            const baseMetadata = {
              caption: panel.caption,
              camera: panel.camera,
              characters: panel.characters,
              mood: panel.mood,
              textScale: panel.textScale ?? "normal",
              sfx: panel.sfx,
              dialogue: panel.dialogue,
              dialogues: panel.dialogues,
              narration: panel.narration,
              layout: storyboardPage.layout,
              panelContract,
              sceneBlueprint,
              effectiveCreativeControls,
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
                prompt: composedPositive,
                negativePrompt: composedNegative,
                status: "planned",
                width: PANEL_DRAFT_SIZE.width,
                height: PANEL_DRAFT_SIZE.height,
                referenceImageIds: panelCanonRefs as unknown as Prisma.InputJsonValue,
                metadata: baseMetadata,
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
    const canonRefByName = new Map<string, string>();
    for (const c of rawCharacters) {
      if (c.canonicalImageUrl) canonRefByName.set(c.name, c.canonicalImageUrl);
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

    async function processOneImage(item: PlannedImage): Promise<"ok" | "fail"> {
      const panelCharacterNames: string[] = item.panel.characters ?? [];
      // Ref canon : prendre la première ref disponible parmi les persos du panel
      const canonRef = panelCharacterNames.map((n) => canonRefByName.get(n)).find(Boolean) ?? null;

      const panelLoras = panelCharacterNames
        .map((n) => loraByCharName.get(n))
        .filter((l): l is { url: string; triggerWord: string; scale: number } => Boolean(l))
        .slice(0, 2);

      // Priorité : LoRA > ref canon perso > txt2img
      // (pas de keyframe image : la cohérence décor passe par composeEnvironment dans le prompt)
      const refs: string[] = [];
      if (canonRef) {
        const signedCanonRef = await signIfSupabaseStorageUrl(canonRef);
        // Vérifier que l'URL de référence est encore accessible avant de la passer à FAL
        // Une URL expirée (FAL CDN temporaire) cause une erreur 422 "Failed to download the file"
        const isAccessible = await fetch(signedCanonRef, { method: "HEAD", signal: AbortSignal.timeout(4000) })
          .then((r) => r.ok)
          .catch(() => false);
        if (isAccessible) {
          refs.push(signedCanonRef);
        } else {
          console.warn(`[pipeline] canonRef URL inaccessible (expirée ?), ignorée pour ce panel: ${canonRef.slice(0, 80)}`);
        }
      }

      const panelContractMeta = item.baseMetadata.panelContract as {
        purpose?: "establishing" | "reaction" | "dialogue" | "action" | "reveal" | "aftermath";
        shotType?: "wide" | "medium" | "closeup" | "extreme_closeup" | "over_shoulder";
        mandatoryLocationSignals?: string[];
        mustShowLocationSignals?: string[];
        backgroundElements?: string[];
        npcGroupPresence?: string[];
        mustAvoidPortraitIsolation?: boolean;
      };
      const hasCanonRef = refs.length > 0 || panelLoras.length > 0;

      try {
        const routingCtx = buildRoutingContext(intensityLayer, item.panel, panelContractMeta, hasCanonRef, adultEngine);
        const effectiveRefs = routingCtx.environmentCritical ? [] : refs;
        const result = await runRoutedImageGeneration(routingCtx, {
          mode: "PANEL_DRAFT",
          positivePrompt: item.panel.prompt,
          negativePrompt: item.panel.negativePrompt,
          width: PANEL_DRAFT_SIZE.width,
          height: PANEL_DRAFT_SIZE.height,
          loras: panelLoras.length > 0 ? panelLoras : undefined,
          referenceImageUrls: effectiveRefs.length > 0 ? effectiveRefs : undefined,
          providerParams: {
            contentIntensityLayer: intensityLayer,
            mode: "PANEL_DRAFT",
            environmentCritical: routingCtx.environmentCritical,
            purpose: routingCtx.purpose,
          },
        });

        if (result.ok) {
          // Drift detection + auto-reroll
          const panelCharDetails = panelCharacterNames.map((name) => {
            const c = rawCharacters.find((rc) => rc.name === name);
            return {
              name,
              gender: c?.gender ?? null,
              hairColor: c?.hairColor ?? null,
              eyeColor: c?.eyeColor ?? null,
              bodyDetails: c?.bodyDetails ?? null,
              appearance: c?.appearance ?? null,
            };
          });
          // ── Validation stricte avec CharacterFingerprint (Bloc 2) ──────────────
          const charactersWithFingerprints = panelCharacterNames
            .map((name) => {
              const c = rawCharacters.find((rc) => rc.name === name);
              if (!c) return null;
              
              const fingerprintRaw = (c as { characterFingerprint?: unknown }).characterFingerprint;
              const fingerprint = fingerprintRaw && typeof fingerprintRaw === "object"
                ? fingerprintRaw as Record<string, unknown>
                : null;

              // Si pas de fingerprint, skip validation stricte
              if (!fingerprint || Object.keys(fingerprint).length === 0) return null;

              return {
                characterId: c.id,
                characterName: c.name,
                fingerprint: fingerprint as never,
              };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);

          let shouldRerollStrict = false;
          let validationScore = 1.0;
          let validationDetails:
            | {
                qualityScores?: {
                  backgroundPresenceScore: number;
                  environmentReadabilityScore: number;
                  interactionScore: number;
                  shotComplianceScore: number;
                  styleConsistencyScore: number;
                  releaseScore: number;
                  visionScore?: number | null;
                };
                visionAnalysis?: {
                  enabled: boolean;
                  model?: string | null;
                  confidence?: number | null;
                  findings: string[];
                };
                issues: Array<{ message: string; severity: string; type: string }>;
                propertyChecks?: Array<{ property: string; ok: boolean; message: string }>;
              }
            | undefined;

          const validation = await validateGeneratedPanel({
            panelId: item.sceneImageId,
            imageUrl: result.result.imageUrl,
            requiredCharacters: charactersWithFingerprints,
            metadata: {
              prompt: item.panel.prompt,
              negativePrompt: item.panel.negativePrompt,
              model: result.result.model,
              sceneBlueprint: item.baseMetadata.sceneBlueprint as SceneBlueprint,
              panelContract: item.baseMetadata.panelContract as {
                shotType?: string;
                purpose?: string;
                mustShow?: string[];
                backgroundExtras?: string[];
              },
              stylePack: (item.baseMetadata.stylePack ?? undefined) as {
                renderFamily?: string | null;
                lineWeight?: string | null;
                shadingMode?: string | null;
                contrastProfile?: string | null;
                anatomyBias?: string | null;
                backgroundDensity?: string | null;
                cameraLanguage?: string | null;
                negativeConstraints?: string[];
              } | undefined,
            },
          });

          validationScore = validation.score;
          const visionFindings = validation.visionAnalysis?.findings.join(" | ").toLowerCase() ?? "";
          const schoolScene =
            (panelContractMeta.mandatoryLocationSignals?.some((signal) => /school|courtyard|campus/i.test(signal)) ?? false)
            || /school|lycée|lycee|école|ecole|campus|cour du lycée/i.test(item.panel.prompt);
          const socialScene =
            (panelContractMeta.npcGroupPresence?.length ?? 0) > 0
            || /humili|ridicul|moque|bullying|crowd|students|élèves|eleves/i.test(item.panel.prompt);
          const environmentCriticalReroll = Boolean(
            (panelContractMeta.shotType === "wide"
              && (
                (validation.qualityScores?.backgroundPresenceScore ?? 1) < 0.68
                || (validation.qualityScores?.environmentReadabilityScore ?? 1) < 0.66
                || /fond vide|fond flou|background empty|generic background|blurry environment/.test(visionFindings)
              ))
            || (schoolScene
              && (
                (validation.qualityScores?.backgroundPresenceScore ?? 1) < 0.66
                || /no school architecture|fond vide|cour du lycée|school courtyard/.test(visionFindings)
              ))
            || (socialScene
              && (
                (validation.qualityScores?.interactionScore ?? 1) < 0.6
                || /interaction faible|no interaction|disconnected/.test(visionFindings)
              ))
            || (panelContractMeta.mustAvoidPortraitIsolation
              && /isolated portrait|floating character|fond vide|background empty/.test(
                `${visionFindings} ${(validationDetails?.issues ?? []).map((issue) => issue.type).join(" ")}`.toLowerCase(),
              )));
          shouldRerollStrict = validation.requiredReroll || environmentCriticalReroll;
          validationDetails = {
            qualityScores: validation.qualityScores
              ? {
                  backgroundPresenceScore: validation.qualityScores.backgroundPresenceScore,
                  environmentReadabilityScore: validation.qualityScores.environmentReadabilityScore,
                  interactionScore: validation.qualityScores.interactionScore,
                  shotComplianceScore: validation.qualityScores.shotComplianceScore,
                  styleConsistencyScore: validation.qualityScores.styleConsistencyScore,
                  releaseScore: validation.qualityScores.releaseScore,
                  visionScore: validation.qualityScores.visionScore ?? null,
                }
              : undefined,
            visionAnalysis: validation.visionAnalysis,
            issues: validation.issues,
            propertyChecks: validation.propertyChecks,
          };

          if (shouldRerollStrict) {
            console.warn(
              `[pipeline] validation failed score=${validation.score.toFixed(2)} panel=${item.sceneImageId} critical_issues=${validation.issues.filter((i) => i.severity === "critical").length} envCritical=${routingCtx.environmentCritical}`
            );
          }

          // Fallback sur ancien drift detector si pas de fingerprint
          const drift = detectVisualDrift({
            prompt: item.panel.prompt,
            characters: panelCharDetails,
            usedLoras: panelLoras.length > 0,
            usedRefs: effectiveRefs.length > 0,
          });

          const MAX_REROLL = 2;
          let finalResult = result;
          let rerollCount = 0;

          const shouldReroll = shouldRerollStrict || !drift.pass;

          if (shouldReroll && MAX_REROLL > 0) {
            const reason = shouldRerollStrict
              ? `validation score=${validationScore.toFixed(2)}`
              : `drift score=${drift.score}`;
            console.warn(`[pipeline] reroll required: ${reason} panel=${item.sceneImageId}`);

            for (let attempt = 0; attempt < MAX_REROLL; attempt++) {
              const boostNeg = drift.issues
                .filter((issue) => issue.includes("absent"))
                .map((issue) => {
                  const match = issue.match(/"([^"]+)" absent/);
                  return match ? `wrong ${match[1]}` : "";
                })
                .filter(Boolean)
                .join(", ");
              const strongerEnvironmentPrompt = validationDetails?.qualityScores
                && (
                  validationDetails.qualityScores.backgroundPresenceScore < 0.62
                  || validationDetails.qualityScores.environmentReadabilityScore < 0.6
                )
                ? [
                    "full environment visible",
                    "readable layered background",
                    "foreground, midground, background all explicit",
                    ...(Array.isArray((item.baseMetadata.panelContract as Record<string, unknown> | undefined)?.mustShow)
                      ? ((item.baseMetadata.panelContract as Record<string, unknown>).mustShow as string[])
                      : []
                    ).slice(0, 4),
                  ].join(", ")
                : "";
              const strongerInteractionPrompt = validationDetails?.qualityScores
                && validationDetails.qualityScores.interactionScore < 0.58
                ? `environment affects action, ${String((item.baseMetadata.sceneBlueprint as Record<string, unknown> | undefined)?.promptBridge && typeof (item.baseMetadata.sceneBlueprint as { promptBridge?: { actionLine?: string } }).promptBridge?.actionLine === "string"
                    ? (item.baseMetadata.sceneBlueprint as { promptBridge?: { actionLine?: string } }).promptBridge?.actionLine
                    : "interaction remains readable")}`
                : "";
              const rerollPositivePrompt = [
                item.panel.prompt,
                strongerEnvironmentPrompt,
                strongerInteractionPrompt,
              ].filter(Boolean).join(", ");
              const strongerNegative = validationDetails?.issues
                .filter((issue) =>
                  issue.type === "empty_background"
                  || issue.type === "weak_environment"
                  || issue.type === "weak_interaction"
                  || issue.type === "style_drift",
                )
                .map((issue) => issue.type)
                .join(", ");

              const rerollResult = await runRoutedImageGeneration(routingCtx, {
                mode: "PANEL_DRAFT",
                positivePrompt: rerollPositivePrompt,
                negativePrompt: [item.panel.negativePrompt, boostNeg, strongerNegative, "empty background, studio background, flat grey backdrop, isolated portrait, weak interaction, blurry environment"]
                  .filter(Boolean)
                  .join(", "),
                width: PANEL_DRAFT_SIZE.width,
                height: PANEL_DRAFT_SIZE.height,
                loras: panelLoras.length > 0 ? panelLoras : undefined,
                referenceImageUrls: effectiveRefs.length > 0 ? effectiveRefs : undefined,
                providerParams: {
                  contentIntensityLayer: intensityLayer,
                  mode: "PANEL_DRAFT",
                  seed: Date.now() + attempt,
                  environmentCritical: routingCtx.environmentCritical,
                  purpose: routingCtx.purpose,
                },
              });
              rerollCount++;

              if (rerollResult.ok) {
                finalResult = rerollResult;
                break;
              }
            }
          }

          const persisted = await persistImageIfNeeded({
            imageUrl: finalResult.ok ? finalResult.result.imageUrl : result.result.imageUrl,
            projectId,
            chapterId,
            sceneImageId: item.sceneImageId,
          });

          if (!persisted.ok) {
            await prisma.sceneImage.update({
              where: { id: item.sceneImageId },
              data: {
                status: "failed",
                metadata: ({
                  ...item.baseMetadata,
                  error: persisted.error,
                  sourceUrl: finalResult.ok ? finalResult.result.imageUrl : result.result.imageUrl,
                  generationLog: finalResult.ok ? finalResult.log : result.log,
                } as unknown) as Prisma.InputJsonValue,
              },
            });
            return "fail";
          }

          const finalLog = finalResult.ok ? finalResult.log : result.log;
          const finalRouting = finalResult.ok ? finalResult.routing : result.routing;
          const finalProvider = finalResult.ok ? finalResult.result.provider : result.result.provider;
          const finalModel = finalResult.ok ? finalResult.result.model : result.result.model;
          const primaryCharacterId =
            charactersWithFingerprints[0]?.characterId
            ?? rawCharacters.find((character) => character.name === item.panel.characters[0])?.id;
          const visualConsistency =
            finalResult.ok && primaryCharacterId
              ? await scoreVisualConsistency(prisma, {
                  imageId: item.sceneImageId,
                  characterId: primaryCharacterId,
                  generatedMetadata: {
                    prompt: item.panel.prompt,
                  },
                })
              : null;
          const combinedConsistencyScore =
            validationDetails?.qualityScores?.releaseScore != null
              ? visualConsistency
                ? (validationDetails.qualityScores.releaseScore + visualConsistency.overall) / 2
                : validationDetails.qualityScores.releaseScore
              : drift.score;

          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              imageUrl: persisted.url,
              provider: finalProvider,
              model: finalModel,
              status: "completed",
              consistencyScore: combinedConsistencyScore,
              routingDecision: finalRouting as unknown as Prisma.InputJsonValue,
              metadata: ({
                ...item.baseMetadata,
                generationLog: finalLog,
                persisted: persisted.persisted,
                temporary: "temporary" in persisted ? (persisted.temporary as boolean) : undefined,
                storageWarning: "warning" in persisted ? (persisted.warning as string) : undefined,
                sourceUrl: finalResult.ok ? finalResult.result.imageUrl : result.result.imageUrl,
                canonRefUsed: canonRef ?? null,
                driftScore: drift.score,
                driftPass: drift.pass,
                driftIssues: drift.issues.slice(0, 5),
                promptVisualConsistency: visualConsistency,
                validationScore,
                validationDetails,
                rerollCount,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "ok";
        } else {
          await prisma.sceneImage.update({
            where: { id: item.sceneImageId },
            data: {
              status: "blocked",
              metadata: ({
                ...item.baseMetadata,
                blockedReason: result.reason,
                generationLog: result.log,
              } as unknown) as Prisma.InputJsonValue,
            },
          });
          return "fail";
        }
      } catch (imgError) {
        const msg = imgError instanceof Error ? imgError.message : "image_error";
        console.error(`[pipeline] image failed sceneImageId=${item.sceneImageId} error=${msg}`);
        await prisma.sceneImage.update({
          where: { id: item.sceneImageId },
          data: {
            status: "failed",
            metadata: ({ ...item.baseMetadata, error: msg } as unknown) as Prisma.InputJsonValue,
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

    // Mettre à jour le statut du chapitre
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        status: generatedCount > 0 ? "published" : "ready_for_render",
        outline: ({
          ...revisedBundle.outline,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.outline,
          qualityReport: chapterQualityReport,
        } as unknown) as Prisma.InputJsonValue,
        script: ({
          ...revisedBundle.script,
          operationalStatus: revisedBundle.generationDiagnostics.operationalStatus,
          degradedModes: revisedBundle.generationDiagnostics.degradedModes,
          generationDiagnostics: revisedBundle.generationDiagnostics.dialogue,
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
