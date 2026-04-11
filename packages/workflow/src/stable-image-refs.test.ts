import { describe, expect, it, vi } from "vitest";
import {
  buildStableImageReference,
  resolveStableImageReference,
  resolveStableImageReferences,
} from "./stable-image-refs";

describe("stable image refs", () => {
  it("réutilise une ref stable même si l'URL source est expirée", async () => {
    const reference = buildStableImageReference({
      assetId: "asset-1",
      storageProvider: "supabase",
      bucket: "mymanga-images",
      storageKey: "characters/hero/ref-1.png",
      sourceUrl: "https://expired.example.com/temp-token",
      sourceType: "media_asset",
      checksum: "sha-1",
    });

    const resolved = await resolveStableImageReference(reference!, {
      signSupabaseObject: vi.fn().mockResolvedValue("https://signed.example.com/hero-ref"),
    });

    expect(resolved.resolvedUrl).toBe("https://signed.example.com/hero-ref");
    expect(resolved.ignoredReason).toBeNull();
    expect(resolved.assetId).toBe("asset-1");
  });

  it("trace les refs réellement utilisées et ignorées", async () => {
    const stable = buildStableImageReference({
      assetId: "asset-hero",
      storageProvider: "supabase",
      bucket: "mymanga-images",
      storageKey: "hero.png",
      sourceType: "media_asset",
    });
    const broken = buildStableImageReference({
      assetId: "asset-broken",
      sourceType: "legacy_url",
    });

    const resolved = await resolveStableImageReferences([stable!, broken!], {
      signSupabaseObject: vi.fn().mockResolvedValue("https://signed.example.com/hero.png"),
    });

    expect(resolved.urls).toEqual(["https://signed.example.com/hero.png"]);
    expect(resolved.trace.used).toHaveLength(1);
    expect(resolved.trace.ignored).toHaveLength(1);
    expect(resolved.trace.ignored[0]?.ignoredReason).toBe("irrecoverable_reference");
  });

  it("retombe proprement quand une ref ne peut pas être reconstruite", async () => {
    const reference = buildStableImageReference({
      assetId: "asset-2",
      storageProvider: "supabase",
      bucket: "mymanga-images",
      storageKey: "characters/support/ref-2.png",
      sourceType: "media_asset",
    });

    const resolved = await resolveStableImageReference(reference!, {
      signSupabaseObject: vi.fn().mockResolvedValue(null),
    });

    expect(resolved.resolvedUrl).toBeNull();
    expect(resolved.ignoredReason).toBe("sign_failed");
  });
});
