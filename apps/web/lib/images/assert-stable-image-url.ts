/**
 * Guard: refuse toute URL qui ne peut PAS être considérée comme canonique
 * (i.e. éligible à figurer dans `mediaAsset.publicUrl`, `characterVisualRef.imageUrl`,
 * `characterVisualLock.canonicalRefUrls`, `Location.visualRefs`, etc.).
 *
 * Règles :
 * - Refuse les URLs signées (TTL limité) : présence de `token=` ou `/object/sign/`.
 * - Refuse les hosts temporaires provider :
 *   - `v3b.fal.media`, `cdn.fal.ai` (FAL)
 *   - `delivery-*.bfl.ai` (Black Forest Labs)
 *
 * Les URLs passant le guard sont :
 * - URLs Supabase publiques (même si le bucket est privé — le chemin reste stable
 *   et peut être re-signé on-read via `signSupabaseUrlIfNeeded`).
 * - URLs user-provided stables.
 */

export type StableImageUrlCheck =
  | { ok: true }
  | { ok: false; reason: "signed_url" | "provider_temporary_host" | "invalid_url"; detail: string };

const TEMPORARY_HOST_MATCHERS: Array<(host: string) => boolean> = [
  (h) => h === "v3b.fal.media",
  (h) => h === "fal.media" || h.endsWith(".fal.media"),
  (h) => h === "cdn.fal.ai",
  (h) => h.startsWith("delivery-") && h.endsWith(".bfl.ai"),
];

export function checkStableImageUrl(url: string | null | undefined): StableImageUrlCheck {
  if (!url || typeof url !== "string") {
    return { ok: false, reason: "invalid_url", detail: "empty" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url", detail: "malformed" };
  }
  if (parsed.pathname.includes("/object/sign/")) {
    return { ok: false, reason: "signed_url", detail: "supabase_signed_path" };
  }
  if (parsed.searchParams.has("token")) {
    return { ok: false, reason: "signed_url", detail: "token_query" };
  }
  const host = parsed.hostname.toLowerCase();
  for (const matcher of TEMPORARY_HOST_MATCHERS) {
    if (matcher(host)) {
      return { ok: false, reason: "provider_temporary_host", detail: host };
    }
  }
  return { ok: true };
}

export function isStableImageUrl(url: string | null | undefined): boolean {
  return checkStableImageUrl(url).ok;
}

/**
 * Version "assert" : throw si l'URL n'est pas stable. À utiliser dans toutes
 * les routes qui écrivent en DB des URLs considérées comme canoniques.
 *
 * @throws Error avec un message actionnable.
 */
export function assertStableImageUrl(url: string | null | undefined, context?: string): asserts url is string {
  const res = checkStableImageUrl(url);
  if (!res.ok) {
    const ctx = context ? `[${context}] ` : "";
    throw new Error(
      `${ctx}assertStableImageUrl failed: reason=${res.reason} detail=${res.detail} url=${(url ?? "").slice(0, 120)}`,
    );
  }
}

/**
 * Filtre un tableau d'URLs en ne conservant que celles qui passent le guard.
 * Émet un warn pour chaque URL rejetée (utile en mode "best-effort" côté DB
 * plutôt qu'un throw strict).
 */
export function filterStableImageUrls(urls: ReadonlyArray<string | null | undefined>, context?: string): string[] {
  const out: string[] = [];
  for (const u of urls) {
    const res = checkStableImageUrl(u);
    if (res.ok) {
      out.push(u as string);
    } else if (u) {
      const ctx = context ? `[${context}] ` : "";
      console.warn(`${ctx}filterStableImageUrls dropped url reason=${res.reason} detail=${res.detail} url=${u.slice(0, 120)}`);
    }
  }
  return out;
}
