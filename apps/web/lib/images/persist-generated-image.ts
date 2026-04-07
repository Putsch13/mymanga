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

export async function persistGeneratedImageIfNeeded(opts: {
  imageUrl: string;
  objectPath: string;
  /** Si true : retourner ok:true avec l'URL originale si Supabase n'est pas configuré (image temporaire) */
  allowTemporary?: boolean;
}) {
  const bucket = process.env.STORAGE_BUCKET ?? "mymanga-images";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = getStorageClient();

  // Log de diagnostic pour débugger les problèmes de persistance
  if (!client) {
    console.warn(`[persist-image] Supabase client NULL — url=${!!supabaseUrl} serviceKey=${!!serviceKey} anonKey=${!!anonKey} bucket=${bucket}`);
  }

  const canPersistHttp =
    isHttpImageUrl(opts.imageUrl) &&
    !looksLikeBflDelivery(opts.imageUrl) &&
    !isAlreadyStableStorageUrl(opts.imageUrl);
  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl) || canPersistHttp;

  if (!mustPersist) {
    return { ok: true as const, url: opts.imageUrl, persisted: false as const };
  }

  if (!client) {
    console.warn(`[persist-image] No storage client, returning temporary URL for: ${opts.imageUrl.slice(0, 60)}...`);
    if (opts.allowTemporary) {
      // Mode dégradé : pas de Supabase, on retourne l'URL temporaire avec un flag
      return { ok: true as const, url: opts.imageUrl, persisted: false as const, temporary: true as const };
    }
    return {
      ok: false as const,
      error:
        "Stockage non configuré (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). L'image a été générée mais ne peut pas être sauvegardée de façon permanente.",
    };
  }

  let bytes: Uint8Array;
  let contentType = "image/jpeg";

  if (isDataUrl(opts.imageUrl)) {
    const commaIndex = opts.imageUrl.indexOf(",");
    if (commaIndex <= 0) return { ok: false as const, error: "data_url_invalide" };
    const header = opts.imageUrl.slice(0, commaIndex);
    const base64 = opts.imageUrl.slice(commaIndex + 1);
    const ct = header.split(";")[0]?.slice("data:".length);
    if (ct?.startsWith("image/")) contentType = ct;
    bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  } else {
    const res = await fetch(opts.imageUrl);
    if (!res.ok) return { ok: false as const, error: `download_failed_${res.status}` };
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
      // Upload échoué mais on a allowTemporary → retourner l'URL originale plutôt que bloquer
      return { ok: true as const, url: opts.imageUrl, persisted: false as const, temporary: true as const, warning: `upload_failed:${upload.error.message}` };
    }
    return { ok: false as const, error: `upload_failed:${upload.error.message}` };
  }

  // Stocker l'URL publique stable en DB.
  // Si le bucket est privé, le chapter route génère des signed URLs à la lecture.
  const publicUrl = client.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
  console.log(`[persist-image] OK persisted → ${publicUrl.slice(0, 80)}`);
  return { ok: true as const, url: publicUrl, persisted: true as const };
}
