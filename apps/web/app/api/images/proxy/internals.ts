/**
 * Internals du proxy image, isolés dans un module voisin car Next.js 15
 * n'accepte aucun export non-standard dans `route.ts` (sinon le type-check
 * Next échoue avec « … is not a valid Route export field »).
 *
 * Ce module contient uniquement de la logique pure (allowlist, HMAC) — pas
 * de handler HTTP. Il est testable directement et réutilisé par `route.ts`.
 */
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Hosts provider temporaires dont l'URL expire — on les proxifie pour cacher
 * l'expiration côté navigateur (Safari ne revalide pas assez vite).
 */
export const PROVIDER_TEMPORARY_HOSTS: ReadonlyArray<string> = [
  "v3b.fal.media",
  "cdn.fal.ai",
];

/**
 * Suffixes acceptés pour les sous-domaines delivery-* des providers (BFL +
 * FAL file servers qui changent d'ID). Plus stricts qu'un simple `endsWith`.
 */
export function isAllowedProviderSubdomain(host: string): boolean {
  if (host.endsWith(".fal.media") && /^[a-z0-9-]+\.fal\.media$/.test(host)) {
    return true;
  }
  if (
    host.startsWith("delivery-") &&
    host.endsWith(".bfl.ai") &&
    /^delivery-[a-z0-9]+\.bfl\.ai$/.test(host)
  ) {
    return true;
  }
  return false;
}

/**
 * Host Supabase du projet, tiré de `NEXT_PUBLIC_SUPABASE_URL`. Seul ce host
 * précis est autorisé — pas tout `*.supabase.co`.
 */
export function getProjectSupabaseHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (PROVIDER_TEMPORARY_HOSTS.includes(h)) return true;
  if (isAllowedProviderSubdomain(h)) return true;
  const supabaseHost = getProjectSupabaseHost();
  if (supabaseHost && h === supabaseHost) return true;
  return false;
}

/**
 * Vérification HMAC optionnelle : si `IMAGE_PROXY_SIGN_SECRET` est configuré,
 * toute requête doit fournir un `sig` valide. Sinon on tombe sur l'allowlist.
 */
export function verifySignature(targetUrl: string, providedSig: string | null): boolean {
  const secret = process.env.IMAGE_PROXY_SIGN_SECRET;
  if (!secret) return true;
  if (!providedSig) return false;
  const expected = createHmac("sha256", secret).update(targetUrl).digest("hex");
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(providedSig, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
