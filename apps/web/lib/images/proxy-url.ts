/**
 * Utilitaires pour le proxy d'image côté client.
 * Transforme une URL externe (FAL, Supabase, etc.) en URL proxifiée via /api/images/proxy.
 * Compatible browser ET Node.js (pas de Buffer.from base64url).
 */

const FAL_HOSTS = ["v3b.fal.media", "fal.media", "cdn.fal.ai"];

function isFalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FAL_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("supabase.co");
  } catch {
    return false;
  }
}

/**
 * Retourne une URL proxifiée si l'URL est une URL FAL ou Supabase.
 * Les URLs FAL expirent → on les proxifie pour cacher l'expiration côté navigateur.
 * Les URLs Supabase avec bucket privé → on les proxifie pour éviter les 403.
 */
export function toProxiedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isFalUrl(url) && !isSupabaseUrl(url)) return url;
  // encodeURIComponent est universel (browser + Node), contrairement à Buffer base64url
  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Retourne l'URL directe ou proxifiée selon le contexte.
 * Préférer toujours la version proxifiée pour les images générées.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return toProxiedUrl(url) ?? url;
}
