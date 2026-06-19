/**
 * Garde-fou URL « stable » pour refs canon (Location.visualRefs, etc.).
 * Aligné sur apps/web/lib/images/assert-stable-image-url — logique partagée côté core.
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
