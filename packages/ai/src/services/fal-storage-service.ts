import { createHash } from "node:crypto";
import { fal } from "@fal-ai/client";
import type { MediaAssetType, PrismaClient, Prisma } from "@manga-ai-studio/db";

type TxLike = PrismaClient | Prisma.TransactionClient;

type AssetOwnership = {
  projectId: string;
  chapterId?: string | null;
  sceneId?: string | null;
  characterId?: string | null;
  ownerType?: string | null;
  ownerId?: string | null;
};

type UploadImageInput = AssetOwnership & {
  buffer?: Buffer | Uint8Array;
  url?: string;
  mimeType?: string;
  fileName?: string;
  assetType?: MediaAssetType;
};

type UploadZipInput = AssetOwnership & {
  buffer: Buffer | Uint8Array;
  fileName?: string;
};

function ensureConfigured(apiKey: string | undefined) {
  if (!apiKey?.trim()) {
    throw new Error("FAL_KEY absente");
  }
  fal.config({
    credentials: apiKey.trim(),
  });
}

function toBuffer(value: Buffer | Uint8Array) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

async function fetchRemoteBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fal_storage_fetch_failed_${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  return { bytes, mimeType };
}

function sha256(input: Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

function buildFileName(input: { fallbackPrefix: string; sha: string; mimeType: string; fileName?: string }) {
  if (input.fileName) return input.fileName;
  const ext =
    input.mimeType.includes("png")
      ? "png"
      : input.mimeType.includes("webp")
        ? "webp"
        : input.mimeType.includes("zip")
          ? "zip"
          : "jpg";
  return `${input.fallbackPrefix}-${input.sha.slice(0, 12)}.${ext}`;
}

export function createFalStorageService(prisma: TxLike, apiKey: string | undefined) {
  ensureConfigured(apiKey);
  const uploader = fal.storage as unknown as { upload: (file: Blob) => Promise<string> };

  async function persistAsset(input: {
    bytes: Buffer;
    mimeType: string;
    fileName?: string;
    ownership: AssetOwnership;
    type: MediaAssetType;
    origin: "user_upload" | "generated" | "fal_upload" | "fal_output" | "derived_crop" | "system";
  }) {
    const fileSha = sha256(input.bytes);
    const existing = await prisma.mediaAsset.findFirst({
      where: {
        projectId: input.ownership.projectId,
        sha256: fileSha,
        type: input.type,
        falCdnUrl: { not: null },
      },
    });
    if (existing) {
      return existing;
    }

    const blobBytes = new Uint8Array(input.bytes);
    const blob = new Blob([blobBytes], { type: input.mimeType });
    const falCdnUrl = await uploader.upload(blob);
    return prisma.mediaAsset.create({
      data: {
        projectId: input.ownership.projectId,
        chapterId: input.ownership.chapterId ?? null,
        sceneId: input.ownership.sceneId ?? null,
        characterId: input.ownership.characterId ?? null,
        ownerType: input.ownership.ownerType ?? null,
        ownerId: input.ownership.ownerId ?? null,
        type: input.type,
        origin: input.origin,
        storageProvider: "fal",
        falCdnUrl,
        publicUrl: falCdnUrl,
        storageKey: buildFileName({
          fallbackPrefix: input.type,
          sha: fileSha,
          mimeType: input.mimeType,
          fileName: input.fileName,
        }),
        sha256: fileSha,
        mimeType: input.mimeType,
        bytes: input.bytes.byteLength,
      },
    });
  }

  return {
    async uploadReferenceImage(input: UploadImageInput) {
      const payload = input.buffer
        ? {
            bytes: toBuffer(input.buffer),
            mimeType: input.mimeType ?? "image/jpeg",
          }
        : input.url
          ? await fetchRemoteBuffer(input.url)
          : null;
      if (!payload) {
        throw new Error("fal_reference_image_missing_source");
      }
      return persistAsset({
        bytes: payload.bytes,
        mimeType: payload.mimeType,
        fileName: input.fileName,
        ownership: input,
        type: input.assetType ?? "character_ref",
        origin: input.url ? "fal_upload" : "user_upload",
      });
    },

    async uploadReferenceZip(input: UploadZipInput) {
      return persistAsset({
        bytes: toBuffer(input.buffer),
        mimeType: "application/zip",
        fileName: input.fileName,
        ownership: input,
        type: "training_zip",
        origin: "fal_upload",
      });
    },
  };
}
