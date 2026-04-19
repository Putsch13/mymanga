/**
 * Helpers server-only pour signer une URL destinée au proxy image.
 * À utiliser depuis des RSC / server actions / route handlers lorsque
 * `IMAGE_PROXY_SIGN_SECRET` est configuré.
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
