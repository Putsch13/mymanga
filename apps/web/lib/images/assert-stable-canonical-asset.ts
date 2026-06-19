/**
 * P0.7 — Guard centralisé à appeler AVANT toute écriture DB canonique.
 *
 * Étend `assertStableImageUrl` en imposant aussi la présence d'un
 * `storageKey` quand on écrit un `mediaAsset` Supabase. Sans `storageKey`,
 * impossible de re-signer ou re-downloader de façon fiable.
 *
 * À utiliser dans :
 *   - `tx.mediaAsset.create`
 *   - `tx.characterVisualLock.create` (canonicalRefUrls[])
 *   - `tx.characterVisualRef.create`
 *   - writes `Location.visualRefs` (quand on matérialisera le décor P3.x)
 */

import { checkStableImageUrl } from "@/lib/images/assert-stable-image-url";

export type StableCanonicalAssetInput = {
  url: string | null | undefined;
  storageProvider?: string | null | undefined;
  storageKey?: string | null | undefined;
};

export type StableCanonicalAssetCheck =
  | { ok: true }
  | { ok: false; reason: "unstable_url" | "missing_storage_key_for_supabase" | "invalid"; detail: string };

export function checkStableCanonicalAsset(input: StableCanonicalAssetInput): StableCanonicalAssetCheck {
  const urlCheck = checkStableImageUrl(input.url);
  if (!urlCheck.ok) {
    return { ok: false, reason: "unstable_url", detail: `${urlCheck.reason}:${urlCheck.detail}` };
  }
  if (input.storageProvider === "supabase" && !input.storageKey) {
    return {
      ok: false,
      reason: "missing_storage_key_for_supabase",
      detail: "Supabase mediaAsset requires a storageKey for re-sign/re-download",
    };
  }
  return { ok: true };
}

export function assertStableCanonicalAsset(
  input: StableCanonicalAssetInput,
  context?: string,
): void {
  const res = checkStableCanonicalAsset(input);
  if (!res.ok) {
    const ctx = context ? `[${context}] ` : "";
    throw new Error(
      `${ctx}assertStableCanonicalAsset failed: reason=${res.reason} detail=${res.detail} url=${(input.url ?? "").slice(0, 120)} storageKey=${input.storageKey ?? "null"}`,
    );
  }
}
