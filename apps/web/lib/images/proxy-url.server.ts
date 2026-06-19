/**
 * Helpers server-only pour fabriquer une URL destinée au proxy image.
 *
 * P0.4 — point d'entrée unique pour toutes les routes API / server actions
 * qui renvoient des URLs d'image à afficher côté client. Le reste du code
 * applicatif n'a plus le droit de construire des chaînes
 * `/api/images/proxy?url=...` à la main.
 *
 * Ce module :
 *   1. Réutilise l'allowlist STRICTE de `proxy-url.ts` (hosts FAL/BFL connus
 *      + host Supabase du projet) — pas de `endsWith(".supabase.co")`.
 *   2. Signe optionnellement l'URL (`IMAGE_PROXY_SIGN_SECRET`).
 *   3. Expose `toProxiedServerUrl` pour remplacer les IIFE dupliqués dans
 *      les routes GET qui réécrivent les `imageUrl` sortants.
 */
import "server-only";
import { createHmac } from "crypto";
import { toProxiedUrl } from "./proxy-url";

/**
 * Signe `targetUrl` avec HMAC-SHA256 si le secret est disponible. Renvoie
 * l'URL proxy complète `/api/images/proxy?url=<enc>&sig=<hmac>`.
 *
 * Si aucun secret n'est configuré, retombe sur `toProxiedUrl` (le proxy
 * route accepte alors les requêtes non signées tant que le host est
 * autorisé).
 */
export function signProxyUrl(url: string | null | undefined): string | null {
  const base = toProxiedUrl(url);
  if (!base || !url) return base;
  const secret = process.env.IMAGE_PROXY_SIGN_SECRET;
  if (!secret) return base;
  const sig = createHmac("sha256", secret).update(url).digest("hex");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}sig=${sig}`;
}

export function resolveSignedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return signProxyUrl(url) ?? url;
}

/**
 * Adapte une URL (typiquement déjà signée via `signSupabaseUrlIfNeeded`) en
 * URL rendable côté client :
 *   - `null`/`undefined` → `null`
 *   - déjà proxifiée (`/api/images/proxy...`) → inchangée
 *   - URL interne / relative → inchangée
 *   - URL externe dans l'allowlist → proxifiée (+ signée si secret présent)
 *   - URL externe hors allowlist → inchangée (pas de proxy ouvert)
 *
 * Remplace les blocs IIFE dupliqués dans les routes API qui construisaient
 * chacun leur propre liste de hosts.
 */
export function toProxiedServerUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/images/proxy")) return url;
  return signProxyUrl(url) ?? url;
}
