import JSZip from "jszip";
import type { PrismaClient, Prisma } from "@manga-ai-studio/db";
import { createFalJobClient } from "./fal-job-client";
import { createFalStorageService } from "./fal-storage-service";

const FAL_LORA_TRAINING_MODEL = "fal-ai/flux-lora-fast-training";

type TxLike = PrismaClient | Prisma.TransactionClient;

export interface LoraTrainingInput {
  prisma: TxLike;
  projectId: string;
  characterId: string;
  characterName: string;
  triggerWord: string;
  imageUrls: string[];
  imageTypes?: string[];
  /** Nombre de steps d'entraînement (200-1000, défaut 300 pour speed) */
  steps?: number;
}

export interface LoraReadinessReport {
  score: number;
  minImagesOk: boolean;
  diversityOk: boolean;
  ratioOk: boolean;
  consistencyOk: boolean;
  portraitRatio: number;
  fullBodyRatio: number;
  reasons: string[];
  /** MOAT-3 : true si on entraîne avec un dataset minimaliste (3-4 refs).
   *  Le mode low-data augmente automatiquement steps et caption augmentation. */
  lowDataMode: boolean;
}

export interface LoraTrainingResult {
  ok: boolean;
  loraUrl?: string;
  configUrl?: string;
  requestId?: string;
  jobId?: string;
  previewImages?: string[];
  trainingAssetId?: string;
  readiness?: LoraReadinessReport;
  raw?: unknown;
  error?: string;
}

function buildAugmentedCaption(
  triggerWord: string,
  characterName: string,
  imageType: string | undefined,
  index: number,
): string {
  const lowerType = (imageType ?? "").toLowerCase();
  const isPortrait = /portrait|face|closeup|head/.test(lowerType);
  const isFullBody = /full|body|three_quarter|pose|outfit/.test(lowerType);
  const viewHint = isPortrait
    ? "portrait shot, face visible, expressive eyes"
    : isFullBody
      ? "full body shot, full outfit visible, character pose"
      : "manga character shot";
  // Léger jitter de phrasing pour éviter overfitting sur la même phrase de caption
  const variants = [
    "manga character, consistent design, clean lineart",
    "manga style, model sheet quality, consistent character",
    "anime/manga character, official artwork style, consistent design",
  ];
  const phrasing = variants[index % variants.length];
  return `${triggerWord}, ${characterName}, ${viewHint}, ${phrasing}`;
}

async function buildTrainingZip(input: LoraTrainingInput, lowDataMode: boolean) {
  const zip = new JSZip();
  const types = input.imageTypes ?? [];
  for (const [index, url] of input.imageUrls.slice(0, 20).entries()) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`lora_dataset_fetch_failed_${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
    const baseName = String(index + 1).padStart(3, "0");
    zip.file(`images/${baseName}.${ext}`, bytes);
    const caption = buildAugmentedCaption(
      input.triggerWord,
      input.characterName,
      types[index],
      index,
    );
    zip.file(`captions/${baseName}.txt`, caption);
  }
  // MOAT-3 low-data mode : on duplique chaque image avec une caption alternative
  // pour artificiellement enrichir le signal de training quand le dataset est <= 4 refs.
  if (lowDataMode) {
    const refs = input.imageUrls.slice(0, 20);
    for (const [index, url] of refs.entries()) {
      const response = await fetch(url);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      const ext =
        contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : "jpg";
      const dupName = `${String(index + 1).padStart(3, "0")}_aug`;
      zip.file(`images/${dupName}.${ext}`, bytes);
      const caption = buildAugmentedCaption(
        input.triggerWord,
        input.characterName,
        types[index],
        index + 1,
      );
      zip.file(`captions/${dupName}.txt`, caption);
    }
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export function computeLoraReadiness(input: Pick<LoraTrainingInput, "imageUrls" | "imageTypes">): LoraReadinessReport {
  const types = input.imageTypes ?? [];
  const lowerTypes = types.map((type) => type.toLowerCase());
  const portraitCount = lowerTypes.filter((type) => /portrait|face|closeup|head/.test(type)).length;
  const fullBodyCount = lowerTypes.filter((type) => /full|body|three_quarter|pose|outfit/.test(type)).length;
  const distinctBuckets = new Set(lowerTypes.map((type) => {
    if (/portrait|face|closeup|head/.test(type)) return "portrait";
    if (/full|body|three_quarter|pose|outfit/.test(type)) return "full_body";
    return "other";
  }));
  const count = input.imageUrls.length;
  const portraitRatio = count > 0 ? portraitCount / count : 0;
  const fullBodyRatio = count > 0 ? fullBodyCount / count : 0;
  // MOAT-3 : abaissement du seuil minimal de 4 → 3 refs.
  // Le mode low-data compense via training steps boostés et caption augmentation.
  const minImagesOk = count >= 3;
  const lowDataMode = count >= 3 && count <= 4;
  // En low-data on EXIGE quand même 2 vues distinctes (sinon le LoRA overfit
  // sur le visage et ne sait plus dessiner le corps, ou inversement).
  const diversityOk = distinctBuckets.size >= 2;
  // En low-data, on exige au moins 1 portrait ET 1 full-body (le ratio classique est trop strict pour 3 refs).
  const ratioOk = lowDataMode
    ? portraitCount >= 1 && fullBodyCount >= 1
    : portraitRatio <= 0.8 && fullBodyRatio >= 0.15;
  const consistencyOk = lowDataMode
    ? portraitCount >= 1 && fullBodyCount >= 1
    : count >= 6 || (portraitCount >= 2 && fullBodyCount >= 1);
  const score = [
    minImagesOk ? 0.3 : 0,
    diversityOk ? 0.25 : 0,
    ratioOk ? 0.2 : 0,
    consistencyOk ? 0.25 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const reasons = [
    minImagesOk ? null : "minimum_images_not_met",
    diversityOk ? null : "view_diversity_too_low",
    ratioOk ? null : "portrait_full_body_ratio_unbalanced",
    consistencyOk ? null : "dataset_visual_consistency_too_low",
    lowDataMode ? "low_data_mode_compensation_active" : null,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    score,
    minImagesOk,
    diversityOk,
    ratioOk,
    consistencyOk,
    portraitRatio,
    fullBodyRatio,
    reasons,
    lowDataMode,
  };
}

/**
 * Lance un entraînement LoRA via le client officiel FAL avec ZIP uploadé au CDN.
 */
export async function trainCharacterLora(input: LoraTrainingInput): Promise<LoraTrainingResult> {
  const apiKey = process.env.FAL_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "FAL_KEY absente — impossible de lancer l'entraînement LoRA" };
  }

  const readiness = computeLoraReadiness(input);
  // MOAT-3 : seuil de score abaissé à 0.55 pour permettre l'entraînement low-data
  // (3 refs peuvent atteindre score 0.6-0.8 si bien réparties portrait/full-body).
  if (readiness.score < 0.55) {
    return {
      ok: false,
      readiness,
      error: `LoRA readiness trop faible (${readiness.score.toFixed(2)})`,
    };
  }

  try {
    const zipBuffer = await buildTrainingZip(input, readiness.lowDataMode);
    const storage = createFalStorageService(input.prisma, apiKey);
    const trainingAsset = await storage.uploadReferenceZip({
      projectId: input.projectId,
      characterId: input.characterId,
      ownerType: "character_lora_training",
      ownerId: input.characterId,
      buffer: zipBuffer,
      fileName: `${input.triggerWord}-dataset.zip`,
    });
    const falClient = createFalJobClient(apiKey);
    // MOAT-3 : low-data mode → steps boostés (700 vs 300), learning_rate diminué
    // pour compenser le risque d'overfitting sur un dataset minuscule.
    const effectiveSteps = input.steps ?? (readiness.lowDataMode ? 700 : 300);
    const effectiveLearningRate = readiness.lowDataMode ? 0.00006 : 0.0001;
    const effectiveRank = readiness.lowDataMode ? 12 : 16;
    if (readiness.lowDataMode) {
      console.log(
        `[lora-training] low_data_mode active char=${input.characterId} refs=${input.imageUrls.length} steps=${effectiveSteps} lr=${effectiveLearningRate} rank=${effectiveRank}`,
      );
    }
    const result = await falClient.submitAndPoll({
      model: FAL_LORA_TRAINING_MODEL,
      mode: "lora_training",
      timeoutMs: 900_000,
      pollIntervalMs: 5_000,
      networkRetries: 2,
      input: {
        images_data_url: trainingAsset.falCdnUrl ?? trainingAsset.publicUrl,
        trigger_word: input.triggerWord,
        steps: effectiveSteps,
        learning_rate: effectiveLearningRate,
        rank: effectiveRank,
        is_style: false,
        is_input_format_already_preprocessed: false,
      },
    });

    if (!result.ok) {
      return {
        ok: false,
        readiness,
        trainingAssetId: trainingAsset.id,
        error: result.error ?? "fal_lora_training_failed",
      };
    }

    const rawRecord = result.raw && typeof result.raw === "object"
      ? (result.raw as Record<string, unknown>)
      : {};
    const dataRecord = rawRecord.data && typeof rawRecord.data === "object"
      ? (rawRecord.data as Record<string, unknown>)
      : rawRecord;
    const loraUrl =
      dataRecord.diffusers_lora_file && typeof dataRecord.diffusers_lora_file === "object"
        ? (dataRecord.diffusers_lora_file as Record<string, unknown>).url
        : null;
    const configUrl =
      dataRecord.config_file && typeof dataRecord.config_file === "object"
        ? (dataRecord.config_file as Record<string, unknown>).url
        : null;
    const previewImages = Array.isArray(dataRecord.images)
      ? dataRecord.images
          .map((image) => (image && typeof image === "object" ? (image as Record<string, unknown>).url : null))
          .filter((url): url is string => typeof url === "string")
      : [];

    if (typeof loraUrl !== "string" || loraUrl.length === 0) {
      return {
        ok: false,
        readiness,
        trainingAssetId: trainingAsset.id,
        requestId: result.requestId,
        jobId: result.jobId,
        raw: result.raw,
        error: "Pas d'URL LoRA dans la réponse FAL",
      };
    }

    return {
      ok: true,
      readiness,
      trainingAssetId: trainingAsset.id,
      requestId: result.requestId,
      jobId: result.jobId,
      loraUrl,
      configUrl: typeof configUrl === "string" ? configUrl : undefined,
      previewImages,
      raw: result.raw,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "lora_training_failed";
    console.error(`[lora-training] error: ${msg}`);
    return { ok: false, readiness: computeLoraReadiness(input), error: msg };
  }
}

/**
 * Construit le trigger word unique pour un personnage.
 */
export function buildTriggerWord(characterName: string, projectId: string): string {
  const clean = characterName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const hash = projectId.slice(-4);
  return `${clean}_${hash}`;
}
