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

async function buildTrainingZip(input: LoraTrainingInput) {
  const zip = new JSZip();
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
    zip.file(
      `captions/${baseName}.txt`,
      `${input.triggerWord}, ${input.characterName}, manga character, consistent design`,
    );
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
  const minImagesOk = count >= 4;
  const diversityOk = distinctBuckets.size >= 2;
  const ratioOk = portraitRatio <= 0.8 && fullBodyRatio >= 0.15;
  const consistencyOk = count >= 6 || (portraitCount >= 2 && fullBodyCount >= 1);
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
  if (readiness.score < 0.6) {
    return {
      ok: false,
      readiness,
      error: `LoRA readiness trop faible (${readiness.score.toFixed(2)})`,
    };
  }

  try {
    const zipBuffer = await buildTrainingZip(input);
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
    const result = await falClient.submitAndPoll({
      model: FAL_LORA_TRAINING_MODEL,
      mode: "lora_training",
      timeoutMs: 900_000,
      pollIntervalMs: 5_000,
      networkRetries: 2,
      input: {
        images_data_url: trainingAsset.falCdnUrl ?? trainingAsset.publicUrl,
        trigger_word: input.triggerWord,
        steps: input.steps ?? 300,
        learning_rate: 0.0001,
        rank: 16,
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
