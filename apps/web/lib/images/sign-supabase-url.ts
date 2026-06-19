/**
 * Utilitaire serveur pour signer les URLs Supabase Storage.
 * Le bucket MyManga est privé → toutes les URLs publiques retournent 403.
 * On génère des signed URLs valides 1h à chaque lecture.
 */
import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null | undefined = undefined;

function getStorageClient() {
  if (_client !== undefined) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

const STORAGE_MARKER = "/storage/v1/object/public/";
const SIGNED_MARKER = "/storage/v1/object/sign/";

function parseSupabaseObjectUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!parsed.href.startsWith(supabaseBase)) return null;

    // URL publique: /storage/v1/object/public/<bucket>/<path>
    const pubIdx = parsed.pathname.indexOf(STORAGE_MARKER);
    if (pubIdx >= 0) {
      const rest = parsed.pathname.slice(pubIdx + STORAGE_MARKER.length);
      const [bucket, ...parts] = rest.split("/");
      if (bucket && parts.length > 0) return { bucket, path: decodeURIComponent(parts.join("/")) };
    }
    return null;
  } catch {
    return null;
  }
}

function isAlreadySignedUrl(url: string): boolean {
  return url.includes(SIGNED_MARKER) || url.includes("token=");
}

/**
 * Si l'URL est une URL Supabase Storage publique, retourne une signed URL valide 1h.
 * Sinon retourne l'URL d'origine.
 */
export async function signSupabaseUrlIfNeeded(
  url: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!url) return null;
  if (isAlreadySignedUrl(url)) return url; // déjà signée

  const ref = parseSupabaseObjectUrl(url);
  if (!ref) return url; // pas une URL Supabase → retourner telle quelle

  const client = getStorageClient();
  if (!client) return url; // pas de client → retourner l'URL (peut être 403)

  const { data, error } = await client.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.warn(`[sign-url] Impossible de signer ${url.slice(0, 80)}: ${error?.message}`);
    return url;
  }
  return data.signedUrl;
}

/**
 * Signe un tableau d'URLs en parallèle.
 */
export async function signSupabaseUrlsIfNeeded(
  urls: (string | null | undefined)[],
  expiresInSeconds = 3600,
): Promise<(string | null)[]> {
  return Promise.all(urls.map((u) => signSupabaseUrlIfNeeded(u, expiresInSeconds)));
}
