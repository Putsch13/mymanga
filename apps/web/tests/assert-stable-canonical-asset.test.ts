/**
 * P0.3 — Guard `assertStableCanonicalAsset`.
 *
 * Vérifie la sémantique du guard centralisé qu'on branche désormais avant
 * toute écriture canonique (mediaAsset, characterVisualLock.canonicalRefUrls,
 * characterVisualRef). Le guard doit refuser :
 *   - les URLs instables (signée, provider-temporaire, malformées, null)
 *   - les mediaAssets Supabase sans storageKey
 * Et accepter les URLs stables avec storageKey cohérent.
 */
import { describe, it, expect } from "vitest";
import {
  assertStableCanonicalAsset,
  checkStableCanonicalAsset,
} from "../lib/images/assert-stable-canonical-asset";

const STABLE_SUPABASE = "https://demo.supabase.co/storage/v1/object/public/bucket/file.png";
const SIGNED_SUPABASE = "https://demo.supabase.co/storage/v1/object/sign/bucket/file.png?token=abc";
const FAL_TEMP = "https://v3b.fal.media/files/x.png";

describe("checkStableCanonicalAsset (P0.3)", () => {
  it("accepte une URL Supabase stable avec storageKey", () => {
    const res = checkStableCanonicalAsset({
      url: STABLE_SUPABASE,
      storageProvider: "supabase",
      storageKey: "bucket/file.png",
    });
    expect(res.ok).toBe(true);
  });

  it("refuse une URL Supabase signée (token)", () => {
    const res = checkStableCanonicalAsset({
      url: SIGNED_SUPABASE,
      storageProvider: "supabase",
      storageKey: "bucket/file.png",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unstable_url");
  });

  it("refuse un host provider temporaire (fal.media files)", () => {
    const res = checkStableCanonicalAsset({
      url: FAL_TEMP,
      storageProvider: "external",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unstable_url");
  });

  it("refuse un mediaAsset Supabase sans storageKey", () => {
    const res = checkStableCanonicalAsset({
      url: STABLE_SUPABASE,
      storageProvider: "supabase",
      storageKey: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing_storage_key_for_supabase");
  });

  it("refuse URL null / undefined / vide", () => {
    expect(checkStableCanonicalAsset({ url: null }).ok).toBe(false);
    expect(checkStableCanonicalAsset({ url: undefined }).ok).toBe(false);
    expect(checkStableCanonicalAsset({ url: "" }).ok).toBe(false);
  });

  it("accepte une URL stable sans storageProvider (cas canonicalRefUrls[])", () => {
    const res = checkStableCanonicalAsset({ url: STABLE_SUPABASE });
    expect(res.ok).toBe(true);
  });
});

describe("assertStableCanonicalAsset throws (P0.3)", () => {
  it("throw avec message explicite quand URL instable", () => {
    expect(() =>
      assertStableCanonicalAsset(
        { url: SIGNED_SUPABASE, storageProvider: "supabase", storageKey: "k" },
        "test",
      ),
    ).toThrow(/assertStableCanonicalAsset failed/);
  });

  it("throw quand storageKey manque pour Supabase", () => {
    expect(() =>
      assertStableCanonicalAsset(
        { url: STABLE_SUPABASE, storageProvider: "supabase" },
        "test",
      ),
    ).toThrow(/missing_storage_key_for_supabase/);
  });

  it("no-op quand asset stable", () => {
    expect(() =>
      assertStableCanonicalAsset(
        { url: STABLE_SUPABASE, storageProvider: "supabase", storageKey: "k" },
      ),
    ).not.toThrow();
  });
});
