import { createClient } from "@supabase/supabase-js";

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
}) {
  const bucket = process.env.STORAGE_BUCKET ?? "mymanga-images";
  const client = getStorageClient();
  const canPersistHttp =
    isHttpImageUrl(opts.imageUrl) &&
    !looksLikeBflDelivery(opts.imageUrl) &&
    !isAlreadyStableStorageUrl(opts.imageUrl);
  const mustPersist = isDataUrl(opts.imageUrl) || looksLikeBflDelivery(opts.imageUrl) || canPersistHttp;

  if (!mustPersist) {
    return { ok: true as const, url: opts.imageUrl, persisted: false as const };
  }

  if (!client) {
    // On n'échoue pas pour une URL http(s) externe : mieux vaut afficher un aperçu
    // temporaire que bloquer la génération complète.
    if (canPersistHttp) {
      return { ok: true as const, url: opts.imageUrl, persisted: false as const };
    }
    return {
      ok: false as const,
      error:
        "Image generee mais non persistable sans NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + STORAGE_BUCKET.",
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
    return { ok: false as const, error: `upload_failed:${upload.error.message}` };
  }

  const publicUrl = client.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
  return { ok: true as const, url: publicUrl, persisted: true as const };
}
