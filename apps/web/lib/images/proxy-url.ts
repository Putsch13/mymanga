/**
 * Utilitaires pour générer les URLs proxifiées.
 *
 * Deux variantes :
 *   - `toProxiedUrl` / `resolveImageUrl` : safe pour browser + Node. Produit
 *     une URL `/api/images/proxy?url=...` encodée (PAS de base64). Utilisée
 *     quand `IMAGE_PROXY_SIGN_SECRET` n'est pas configuré.
 *   - `signProxyUrl` / `resolveSignedImageUrl` : server-only. Si le secret
 *     HMAC est configuré, signe l'URL et ajoute `&sig=<hmac>` pour passer le
 *     contrôle de la route proxy.
 *
 * Allowlist côté client : on matche uniquement les hosts provider connus et
 * le host Supabase du projet (tiré de `NEXT_PUBLIC_SUPABASE_URL`). Plus de
 * `endsWith(".supabase.co")` générique.
 */

const FAL_TEMPORARY_HOSTS = ["v3b.fal.media", "cdn.fal.ai"];

function getSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isFalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname.toLowerCase();
    if (FAL_TEMPORARY_HOSTS.includes(h)) return true;
    return /^[a-z0-9-]+\.fal\.media$/.test(h);
  } catch {
    return false;
  }
}

function isBflUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const h = parsed.hostname.toLowerCase();
    return /^delivery-[a-z0-9]+\.bfl\.ai$/.test(h);
  } catch {
    return false;
  }
}

function isProjectSupabaseUrl(url: string): boolean {
  const supabaseHost = getSupabaseHost();
  if (!supabaseHost) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === supabaseHost;
  } catch {
    return false;
  }
}

/**
 * Retourne une URL proxifiée si l'URL appartient à l'allowlist (FAL, BFL,
 * Supabase du projet). Retourne l'URL telle quelle sinon.
 *
 * NOTE : si `IMAGE_PROXY_SIGN_SECRET` est défini, la route proxy exigera
 * une signature — utiliser `signProxyUrl` côté serveur.
 */
export function toProxiedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isFalUrl(url) && !isBflUrl(url) && !isProjectSupabaseUrl(url)) return url;
  return `/api/images/proxy?url=${encodeURIComponent(url)}`;
}

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return toProxiedUrl(url) ?? url;
}
