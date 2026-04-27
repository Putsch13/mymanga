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

const BUCKET_NAME = "panel-images";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("supabase_config_missing:SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
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

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageKey, uint8Array, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`supabase_upload_failed:${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storageKey);

  if (!publicUrlData?.publicUrl) {
    throw new Error(`supabase_public_url_failed:${storageKey}`);
  }

  return {
    stableUrl: publicUrlData.publicUrl,
    storageKey,
    byteSize: uint8Array.length,
    mimeType,
  };
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
  const supabaseUrl = process.env.SUPABASE_URL || "";
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
  input: PersistTemporaryImageInput & { currentUrl: string }
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
