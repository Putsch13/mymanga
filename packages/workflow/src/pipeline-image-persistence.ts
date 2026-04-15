/**
 * Image persistence helpers — Supabase storage upload with multi-bucket fallback.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */
import { createClient } from "@supabase/supabase-js";
import {
  isHttpImageUrl,
  isAlreadyStableStorageUrl,
  isDataUrl,
  looksLikeBflDelivery,
} from "./pipeline-helpers";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function persistImageIfNeeded(opts: {
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

  const bucketsToTry = [
    process.env.STORAGE_BUCKET,
    "MyManga",
    "mymanga-images",
    "manga-images",
  ].filter(Boolean) as string[];

  const uniqueBuckets = [...new Set(bucketsToTry)];

  for (const bucket of uniqueBuckets) {
    try {
      await client.storage.createBucket(bucket, { public: false });
    } catch { /* bucket exists */ }

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

  console.error(`[pipeline:persist] All buckets failed for ${opts.sceneImageId} – using temporary FAL URL`);
  return { ok: true as const, url: opts.imageUrl, persisted: false as const, temporary: true as const, warning: "all_buckets_failed" };
}
