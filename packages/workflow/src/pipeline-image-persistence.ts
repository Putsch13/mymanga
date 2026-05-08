/**
 * Image persistence helpers — Supabase storage upload with multi-bucket fallback.
 *
 * P0.1 / P0.2 — Contrat de retour strict :
 *   - `persisted: true`  → l'image est dans Supabase avec `bucket`, `storageKey`,
 *     `url`, `mimeType` exacts. L'appelant DOIT persister ces valeurs telles
 *     quelles (sans fallback hardcodé) et peut marquer le panel `completed`.
 *   - `persisted: false` → rien n'a été écrit côté storage canonique. L'image
 *     source (fournie pour debug via `debugSourceUrl`) n'est **pas** une URL
 *     canonique et ne doit jamais finir dans une colonne DB "canonique"
 *     (`publicUrl`, `imageUrl`, etc.). L'appelant DOIT marquer le panel
 *     `failed`/`blocked` (pas `completed`).
 *   - `ok: false` → échec explicite (téléchargement, data-url mal formée, etc.).
 *
 * Il n'y a plus de mode "fallback silencieux vers URL temporaire persistée" :
 * c'était la cause principale des `imageUrl` FAL/BFL expirées stockées en base.
 */
import { createClient } from "@supabase/supabase-js";
import { logPipelineError, logPipelineInfo, logPipelineWarn } from "./lib/pipeline-logger";
import {
  isHttpImageUrl,
  isAlreadyStableStorageUrl,
  isDataUrl,
  looksLikeBflDelivery,
  assertStableImageUrl,
} from "./pipeline-helpers";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type PersistedImageResult =
  | {
      ok: true;
      persisted: true;
      /** URL canonique Supabase (stable). */
      url: string;
      /** Bucket Supabase réellement utilisé pour l'upload. */
      bucket: string;
      /** Chemin exact dans le bucket (avec extension dérivée du content-type). */
      storageKey: string;
      /** Content-type effectif (après inspection data-url ou HTTP headers). */
      mimeType: string;
      /** URL d'origine conservée en debug uniquement — jamais à persister comme canonique. */
      debugSourceUrl: string;
    }
  | {
      ok: true;
      persisted: false;
      /**
       * URL déjà stable (ex: Supabase) — aucun upload nécessaire.
       * L'appelant peut l'écrire en DB, mais NE PEUT PAS inférer de `storageKey`.
       */
      url: string;
      bucket: null;
      storageKey: null;
      mimeType: null;
      debugSourceUrl: string;
    }
  | {
      ok: false;
      persisted: false;
      /** Code machine-readable pour la télémétrie / le statut panel. */
      reason:
        | "no_storage_configured"
        | "all_buckets_failed"
        | "data_url_invalid"
        | "download_failed";
      message: string;
      /** URL d'origine (debug uniquement — ne PAS persister comme canonique). */
      debugSourceUrl: string;
    };

/**
 * P2.1 — Impl canonique unifiée. `persistImageIfNeeded` (3-tuple
 * project/chapter/sceneImageId) et la variante webapp (`objectPath` libre)
 * partagent désormais cette logique pour éviter la double maintenance.
 *
 * Accepte soit :
 *   - `objectPath` : chemin sans extension fourni par l'appelant (l'extension
 *     est ajoutée ici selon le content-type réel),
 *   - soit le triplet `projectId/chapterId/sceneImageId` historique.
 */
export async function persistImageIfNeeded(
  opts:
    | {
        imageUrl: string;
        objectPath: string;
        logContext?: string;
      }
    | {
        imageUrl: string;
        projectId: string;
        chapterId: string;
        sceneImageId: string;
        logContext?: string;
      },
): Promise<PersistedImageResult> {
  const client = getStorageClient();

  const canPersistHttp =
    isHttpImageUrl(opts.imageUrl) && !looksLikeBflDelivery(opts.imageUrl) && !isAlreadyStableStorageUrl(opts.imageUrl);
  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl) || canPersistHttp;

  const contextLabel =
    "logContext" in opts && opts.logContext
      ? opts.logContext
      : "sceneImageId" in opts
        ? opts.sceneImageId
        : "objectPath" in opts
          ? opts.objectPath
          : "unknown";

  if (!mustPersist) {
    return {
      ok: true,
      persisted: false,
      url: opts.imageUrl,
      bucket: null,
      storageKey: null,
      mimeType: null,
      debugSourceUrl: opts.imageUrl,
    };
  }

  if (!client) {
    logPipelineWarn(
      "persist.no_supabase_client",
      {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        context: contextLabel,
      },
      { ns: "pipeline:persist" },
    );
    return {
      ok: false,
      persisted: false,
      reason: "no_storage_configured",
      message: "Stockage Supabase non configuré — refus de persister une URL temporaire en base.",
      debugSourceUrl: opts.imageUrl,
    };
  }

  let bytes: Uint8Array;
  let contentType = "image/jpeg";

  if (isDataUrl(opts.imageUrl)) {
    const commaIdx = opts.imageUrl.indexOf(",");
    if (commaIdx <= 0) {
      return {
        ok: false,
        persisted: false,
        reason: "data_url_invalid",
        message: "data URL invalide (virgule séparatrice absente).",
        debugSourceUrl: opts.imageUrl,
      };
    }
    const header = opts.imageUrl.slice(0, commaIdx);
    const b64 = opts.imageUrl.slice(commaIdx + 1);
    const ct = header.split(";")[0]?.slice("data:".length);
    if (ct?.startsWith("image/")) contentType = ct;
    bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  } else {
    const res = await fetch(opts.imageUrl);
    if (!res.ok) {
      return {
        ok: false,
        persisted: false,
        reason: "download_failed",
        message: `download failed ${res.status}`,
        debugSourceUrl: opts.imageUrl,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    bytes = buf;
    const ct = res.headers.get("content-type");
    if (ct?.startsWith("image/")) contentType = ct;
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const baseObjectPath =
    "objectPath" in opts
      ? opts.objectPath
      : `projects/${opts.projectId}/chapters/${opts.chapterId}/panels/${opts.sceneImageId}`;
  const filePath = `${baseObjectPath}.${ext}`;

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
      logPipelineWarn(
        "persist.bucket_upload_failed",
        { bucket, message: up.error.message },
        { ns: "pipeline:persist" },
      );
      continue;
    }

    const publicUrl = client.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
    try {
      assertStableImageUrl(publicUrl, "pipeline:persist");
    } catch (err) {
      logPipelineError(
        "persist.bucket_unstable_url",
        { bucket, error: err instanceof Error ? err.message : String(err) },
        { ns: "pipeline:persist" },
      );
      continue;
    }
    logPipelineInfo(
      "persist.ok",
      { bucket, storageKey: filePath, urlPreview: publicUrl.slice(0, 80) },
      { ns: "pipeline:persist" },
    );
    return {
      ok: true,
      persisted: true,
      url: publicUrl,
      bucket,
      storageKey: filePath,
      mimeType: contentType,
      debugSourceUrl: opts.imageUrl,
    };
  }

  logPipelineError(
    "persist.all_buckets_failed",
    { context: contextLabel, attemptedBuckets: uniqueBuckets },
    { ns: "pipeline:persist" },
  );
  return {
    ok: false,
    persisted: false,
    reason: "all_buckets_failed",
    message: "Upload impossible dans tous les buckets Supabase candidats.",
    debugSourceUrl: opts.imageUrl,
  };
}
