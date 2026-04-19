/**
 * P0.5 — Resolver centralisé côté SERVER pour obtenir une URL d'image
 * rendable par le front.
 *
 * Règles :
 *   - Priorité canon : `persistedUrl` > `imageUrl`
 *   - Si l'URL stable résolue est une URL Supabase publique (bucket privé),
 *     on la signe automatiquement avec `signSupabaseUrlIfNeeded`.
 *   - Si l'URL résolue est un host externe (Supabase signé, fal, bfl),
 *     on peut optionnellement la proxifier via `/api/images/proxy?url=` pour
 *     éviter les soucis CORS/ITP Safari.
 *
 * Usage recommandé :
 *   - `resolveCanonicalStorageUrl` pour les écritures DB (refuse les URLs
 *     signées / temporaires — délègue à assertStableImageUrl en amont).
 *   - `resolveRenderableImageUrl` pour les routes GET / pages SSR.
 *   - `resolveSignedOrProxiedUrl` pour les UI qui ont besoin d'une URL
 *     utilisable immédiatement côté Safari.
 */

import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { getStableImageUrl, type StableUrlInput } from "@/lib/images/get-stable-image-url";
import { isStableImageUrl } from "@/lib/images/assert-stable-image-url";

export type RenderableImageInput = StableUrlInput;

/**
 * Renvoie l'URL stable canonique si elle passe le guard, null sinon.
 * Ne signe PAS, ne proxifie PAS — destiné aux chemins où on veut stocker
 * ou vérifier une identité d'URL.
 */
export function resolveCanonicalStorageUrl(img: RenderableImageInput | null | undefined): string | null {
  const stable = getStableImageUrl(img);
  if (!stable) return null;
  return isStableImageUrl(stable) ? stable : null;
}

/**
 * Renvoie l'URL la plus "utilisable" pour rendre l'image : signe si
 * nécessaire, jamais null tant qu'une URL brute existe.
 */
export async function resolveRenderableImageUrl(
  img: RenderableImageInput | null | undefined,
  opts: { expiresInSeconds?: number } = {},
): Promise<string | null> {
  const stable = getStableImageUrl(img);
  if (!stable) return null;
  const signed = await signSupabaseUrlIfNeeded(stable, opts.expiresInSeconds ?? 3600);
  return signed ?? stable;
}

/**
 * Renvoie une URL soit signée (Supabase), soit proxifiée via
 * `/api/images/proxy` pour les hosts externes qui posent des problèmes
 * CORS/ITP côté navigateur.
 *
 * P0.4 — délègue à `toProxiedServerUrl` : allowlist STRICTE (host Supabase
 * du projet + hosts FAL/BFL connus uniquement, pas de `supabase.co`
 * générique) + signature HMAC optionnelle. Plus de liste de hosts
 * dupliquée ici.
 */
export async function resolveSignedOrProxiedUrl(
  img: RenderableImageInput | null | undefined,
  opts: { expiresInSeconds?: number } = {},
): Promise<string | null> {
  const signed = await resolveRenderableImageUrl(img, opts);
  if (!signed) return null;
  const { toProxiedServerUrl } = await import("./proxy-url.server");
  return toProxiedServerUrl(signed) ?? signed;
}
