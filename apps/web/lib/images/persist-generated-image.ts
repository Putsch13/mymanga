import { createClient } from "@supabase/supabase-js";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Préférer le service role key (accès complet), fallback sur anon key (bucket public uniquement)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isDataUrl(url: string) {
  return url.startsWith("data:image/");
}

function looksLikeBflDelivery(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.startsWith("delivery-") && parsed.hostname.endsWith(".bfl.ai");
  } catch {
    return false;
  }
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

/**
 * Résultat unifié. Quand `ok: true` et `persisted: true`, `storageKey` reflète
 * le chemin EXACT uploadé côté Supabase (avec l'extension dérivée du
 * content-type), ce qui permet de re-signer ou re-downloader via le SDK
 * Supabase en s'appuyant sur la colonne `mediaAsset.storageKey`.
 *
 * Quand `persisted: false` (URL déjà stable Supabase ou persistence sautée),
 * `storageKey` est `null` — à l'appelant de ne PAS l'écrire en DB dans ce cas.
 */
export type PersistGeneratedImageResult =
  | { ok: true; url: string; persisted: true; storageKey: string }
  | { ok: true; url: string; persisted: false; storageKey: null }
  | { ok: true; url: string; persisted: false; storageKey: null; temporary: true; warning?: string }
  | { ok: false; error: string };

export async function persistGeneratedImageIfNeeded(opts: {
  imageUrl: string;
  objectPath: string;
  /**
   * Si true : retourner ok:true avec l'URL originale si Supabase n'est pas
   * configuré (image temporaire). Ne PAS activer pour les écritures canoniques
   * (mediaAsset, characterVisualRef, canonicalRefUrls) — cf. assertStableImageUrl.
   */
  allowTemporary?: boolean;
}): Promise<PersistGeneratedImageResult> {
  const bucket = process.env.STORAGE_BUCKET ?? "mymanga-images";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = getStorageClient();

  if (!client) {
    console.warn(`[persist-image] Supabase client NULL — url=${!!supabaseUrl} serviceKey=${!!serviceKey} anonKey=${!!anonKey} bucket=${bucket}`);
  }

  const canPersistHttp =
    isHttpImageUrl(opts.imageUrl) &&
    !looksLikeBflDelivery(opts.imageUrl) &&
    !isAlreadyStableStorageUrl(opts.imageUrl);
  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl) || canPersistHttp;

  if (!mustPersist) {
    // URL déjà stable (ex: déjà hébergée chez Supabase) → on laisse tel quel
    // sans renvoyer de storageKey car on ne peut pas en inférer un chemin fiable.
    return { ok: true, url: opts.imageUrl, persisted: false, storageKey: null };
  }

  if (!client) {
    console.warn(`[persist-image] No storage client, returning temporary URL for: ${opts.imageUrl.slice(0, 60)}...`);
    if (opts.allowTemporary) {
      return { ok: true, url: opts.imageUrl, persisted: false, storageKey: null, temporary: true };
    }
    return {
      ok: false,
      error:
        "Stockage non configuré (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). L'image a été générée mais ne peut pas être sauvegardée de façon permanente.",
    };
  }

  let bytes: Uint8Array;
  let contentType = "image/jpeg";

  if (isDataUrl(opts.imageUrl)) {
    const commaIndex = opts.imageUrl.indexOf(",");
    if (commaIndex <= 0) return { ok: false, error: "data_url_invalide" };
    const header = opts.imageUrl.slice(0, commaIndex);
    const base64 = opts.imageUrl.slice(commaIndex + 1);
    const ct = header.split(";")[0]?.slice("data:".length);
    if (ct?.startsWith("image/")) contentType = ct;
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } else {
    const res = await fetch(opts.imageUrl);
    if (!res.ok) return { ok: false, error: `download_failed_${res.status}` };
    bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type");
    if (ct?.startsWith("image/")) contentType = ct;
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const fullPath = `${opts.objectPath}.${ext}`;
  const upload = await client.storage.from(bucket).upload(fullPath, bytes, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });

  if (upload.error) {
    console.error(`[persist-image] Upload failed: ${upload.error.message} — bucket=${bucket} path=${fullPath}`);
    if (opts.allowTemporary) {
      return {
        ok: true,
        url: opts.imageUrl,
        persisted: false,
        storageKey: null,
        temporary: true,
        warning: `upload_failed:${upload.error.message}`,
      };
    }
    return { ok: false, error: `upload_failed:${upload.error.message}` };
  }

  const publicUrl = client.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
  console.log(`[persist-image] OK persisted → ${publicUrl.slice(0, 80)} (storageKey=${fullPath})`);
  return { ok: true, url: publicUrl, persisted: true, storageKey: fullPath };
}
