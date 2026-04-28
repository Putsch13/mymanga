/**
 * persist-temporary-image-for-qa.ts
 *
 * P0 — Persiste une image temporaire (provider URL) vers un stockage stable
 * avant de lancer la Vision QA.
 *
 * Ordre obligatoire:
 *   1. generate image with FAL
 *   2. persist temporary image to stable storage/proxy
 *   3. run Vision QA on stable URL
 *   4. persist final SceneImage status
 *   5. expose stable URL to reader
 *
 * Ce fichier gère l'étape 2.
 */

import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseServerConfig } from "../config/resolve-supabase-server-config";

export interface PersistTemporaryImageInput {
  projectId: string;
  chapterId: string;
  panelId: string;
  generationRunId: string;
  temporaryUrl: string;
}

export interface PersistTemporaryImageResult {
  stableUrl: string;
  storageKey: string;
  byteSize: number;
  mimeType: string;
}

function getSupabaseClient() {
  const cfg = resolveSupabaseServerConfig();
  if (!cfg) {
    throw new Error(
      "supabase_config_missing: besoin de url (SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL) " +
        "et clé service (SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE|SUPABASE_SERVICE_KEY)",
    );
  }
  return createClient(cfg.url, cfg.serviceRoleKey);
}

function bucketCandidates(): string[] {
  const cfg = resolveSupabaseServerConfig();
  const primary = cfg?.bucket?.trim();
  return [...new Set([primary, "MyManga", "panel-images", "mymanga-images", "manga-images"].filter(Boolean))] as string[];
}

function buildStorageKey(input: PersistTemporaryImageInput): string {
  const timestamp = Date.now();
  return `projects/${input.projectId}/chapters/${input.chapterId}/panels/${input.panelId}/${input.generationRunId}_${timestamp}.webp`;
}

export async function persistTemporaryImageForQa(
  input: PersistTemporaryImageInput
): Promise<PersistTemporaryImageResult> {
  const supabase = getSupabaseClient();

  const response = await fetch(input.temporaryUrl);
  if (!response.ok) {
    throw new Error(`fetch_temporary_image_failed:${response.status}:${input.temporaryUrl}`);
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const storageKey = buildStorageKey(input);
  const mimeType = blob.type || "image/webp";

  let lastError = "no_bucket_tried";
  for (const bucket of bucketCandidates()) {
    try {
      await supabase.storage.createBucket(bucket, { public: false });
    } catch {
      /* existe déjà */
    }
    const { error: uploadError } = await supabase.storage.from(bucket).upload(storageKey, uint8Array, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploadError) {
      lastError = uploadError.message;
      continue;
    }
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storageKey);
    if (!publicUrlData?.publicUrl) {
      lastError = `public_url_empty:${bucket}`;
      continue;
    }
    return {
      stableUrl: publicUrlData.publicUrl,
      storageKey,
      byteSize: uint8Array.length,
      mimeType,
    };
  }

  throw new Error(`supabase_upload_failed:${lastError}`);
}

export function isTemporaryProviderUrl(url: string): boolean {
  const temporaryPatterns = [
    /fal\.media/i,
    /fal-cdn\.media/i,
    /storage\.fal\.ai/i,
    /oaidalleapiprodscus/i,
    /replicate\.delivery/i,
  ];
  return temporaryPatterns.some(pattern => pattern.test(url));
}

export function isStableStorageUrl(url: string): boolean {
  const cfg = resolveSupabaseServerConfig();
  const supabaseUrl = cfg?.url || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const proxyUrl = process.env.IMAGE_PROXY_BASE_URL || "";

  if (supabaseUrl && url.includes(supabaseUrl)) {
    return true;
  }

  if (proxyUrl && url.includes(proxyUrl)) {
    return true;
  }

  if (url.includes("/api/images/proxy")) {
    return true;
  }

  return false;
}

export async function ensureStableImageUrl(
  input: Omit<PersistTemporaryImageInput, "temporaryUrl"> & { currentUrl: string },
): Promise<{ url: string; wasTemporary: boolean; storageKey?: string }> {
  if (isStableStorageUrl(input.currentUrl)) {
    return { url: input.currentUrl, wasTemporary: false };
  }

  if (!isTemporaryProviderUrl(input.currentUrl)) {
    return { url: input.currentUrl, wasTemporary: false };
  }

  const result = await persistTemporaryImageForQa({
    projectId: input.projectId,
    chapterId: input.chapterId,
    panelId: input.panelId,
    generationRunId: input.generationRunId,
    temporaryUrl: input.currentUrl,
  });

  return {
    url: result.stableUrl,
    wasTemporary: true,
    storageKey: result.storageKey,
  };
}
