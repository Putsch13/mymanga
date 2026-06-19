/**
 * Pure utility helpers for the chapter pipeline.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */

export function extractSceneFactions(text: string) {
  const normalized = text.toLowerCase();
  const factions = [
    "guilde", "guild", "armée", "army", "rebelles", "rebels",
    "survivors", "survivants", "corporation", "ordre", "clan",
  ];
  return factions.filter((item) => normalized.includes(item));
}

export function inferSceneWeather(text: string) {
  const normalized = text.toLowerCase();
  if (/(pluie|rain|orage|storm)/.test(normalized)) return "rain";
  if (/(neige|snow|blizzard)/.test(normalized)) return "snow";
  if (/(poussière|dust|cendres|ash)/.test(normalized)) return "dust";
  if (/(brouillard|mist|fog)/.test(normalized)) return "mist";
  return null;
}

export function inferSceneTimeOfDay(text: string) {
  const normalized = text.toLowerCase();
  if (/(nuit|night|moon)/.test(normalized)) return "night";
  if (/(aube|dawn|sunrise)/.test(normalized)) return "dawn";
  if (/(soir|sunset|crépuscule|coucher du soleil)/.test(normalized)) return "sunset";
  return "day";
}

export function isHttpImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isAlreadyStableStorageUrl(url: string) {
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseBase && url.startsWith(supabaseBase)) return true;
  return false;
}

export function isDataUrl(url: string) {
  return url.startsWith("data:image/");
}

export function looksLikeBflDelivery(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.startsWith("delivery-") && u.hostname.endsWith(".bfl.ai");
  } catch {
    return false;
  }
}

export function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Guard : refuse toute URL qui ne peut pas être considérée comme canonique
 * (i.e. éligible à figurer dans `MediaAsset.publicUrl`, `SceneImage.imageUrl`,
 * `Chapter.coverImageUrl`, etc.).
 *
 * Aligné avec `apps/web/lib/images/assert-stable-image-url.ts` — dupliqué ici
 * car le package workflow ne dépend pas du webapp.
 *
 * Règles :
 *   - Refuse les data-URLs.
 *   - Refuse les URLs signées (présence de `/object/sign/` ou `?token=`).
 *   - Refuse les hosts temporaires provider (FAL, BFL).
 *   - Refuse les URLs malformées.
 */
export type StableImageUrlReason =
  | "empty_url"
  | "malformed_url"
  | "data_url"
  | "signed_url"
  | "provider_temporary_host";

export function checkStableImageUrl(url: string | null | undefined):
  | { ok: true }
  | { ok: false; reason: StableImageUrlReason; detail: string } {
  if (!url || typeof url !== "string") {
    return { ok: false, reason: "empty_url", detail: "empty" };
  }
  if (url.startsWith("data:")) {
    return { ok: false, reason: "data_url", detail: "data_url" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "malformed_url", detail: "malformed" };
  }
  if (parsed.pathname.includes("/object/sign/")) {
    return { ok: false, reason: "signed_url", detail: "supabase_signed_path" };
  }
  if (parsed.searchParams.has("token")) {
    return { ok: false, reason: "signed_url", detail: "token_query" };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "v3b.fal.media" || host === "fal.media" || host.endsWith(".fal.media")) {
    return { ok: false, reason: "provider_temporary_host", detail: host };
  }
  if (host === "cdn.fal.ai") {
    return { ok: false, reason: "provider_temporary_host", detail: host };
  }
  if (host.startsWith("delivery-") && host.endsWith(".bfl.ai")) {
    return { ok: false, reason: "provider_temporary_host", detail: host };
  }
  return { ok: true };
}

export function assertStableImageUrl(
  url: string | null | undefined,
  context?: string,
): asserts url is string {
  const res = checkStableImageUrl(url);
  if (!res.ok) {
    const ctx = context ? `[${context}] ` : "";
    throw new Error(
      `${ctx}assertStableImageUrl failed: reason=${res.reason} detail=${res.detail} url=${(url ?? "").slice(0, 120)}`,
    );
  }
}
