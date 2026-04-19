/**
 * P2.1 — Tests de l'adapter `persistGeneratedImageIfNeeded` (web-side).
 *
 * Ces tests vérifient que l'adapter produit la bonne forme legacy à partir
 * d'un résultat `PersistedImageResult` du contrat partagé, avec un focus
 * particulier sur `allowTemporary` :
 *   - allowTemporary=false + no_storage_configured → ok:false,
 *   - allowTemporary=true  + no_storage_configured → ok:true / temporary:true.
 *
 * On mock le contrat partagé pour ne pas toucher à Supabase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sharedMock = vi.hoisted(() => ({
  persistImageIfNeeded: vi.fn(),
}));

vi.mock("@manga-ai-studio/workflow", () => ({
  persistImageIfNeeded: sharedMock.persistImageIfNeeded,
}));

import { persistGeneratedImageIfNeeded } from "@/lib/images/persist-generated-image";

beforeEach(() => {
  sharedMock.persistImageIfNeeded.mockReset();
});

describe("persistGeneratedImageIfNeeded — adapter", () => {
  it("traduit un result ok/persisted:true → { ok:true, url, storageKey }", async () => {
    sharedMock.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: true,
      url: "https://example.supabase.co/storage/v1/object/public/mymanga/my/path.png",
      bucket: "mymanga",
      storageKey: "my/path.png",
      mimeType: "image/png",
      debugSourceUrl: "data:image/png;base64,xxx",
    });
    const r = await persistGeneratedImageIfNeeded({
      imageUrl: "data:image/png;base64,xxx",
      objectPath: "my/path",
    });
    expect(r).toMatchObject({ ok: true, persisted: true, storageKey: "my/path.png" });
  });

  it("traduit un result ok/persisted:false → { ok:true, persisted:false, storageKey:null }", async () => {
    sharedMock.persistImageIfNeeded.mockResolvedValueOnce({
      ok: true,
      persisted: false,
      url: "https://example.supabase.co/already-stable.png",
      bucket: null,
      storageKey: null,
      mimeType: null,
      debugSourceUrl: "https://example.supabase.co/already-stable.png",
    });
    const r = await persistGeneratedImageIfNeeded({
      imageUrl: "https://example.supabase.co/already-stable.png",
      objectPath: "my/path",
    });
    expect(r).toEqual({
      ok: true,
      persisted: false,
      storageKey: null,
      url: "https://example.supabase.co/already-stable.png",
    });
  });

  it("avec allowTemporary=false + no_storage_configured → ok:false", async () => {
    sharedMock.persistImageIfNeeded.mockResolvedValueOnce({
      ok: false,
      persisted: false,
      reason: "no_storage_configured",
      message: "…",
      debugSourceUrl: "https://v3b.fal.media/foo.png",
    });
    const r = await persistGeneratedImageIfNeeded({
      imageUrl: "https://v3b.fal.media/foo.png",
      objectPath: "my/path",
      allowTemporary: false,
    });
    expect(r.ok).toBe(false);
  });

  it("avec allowTemporary=true + no_storage_configured → ok:true / temporary:true", async () => {
    sharedMock.persistImageIfNeeded.mockResolvedValueOnce({
      ok: false,
      persisted: false,
      reason: "no_storage_configured",
      message: "…",
      debugSourceUrl: "https://v3b.fal.media/foo.png",
    });
    const r = await persistGeneratedImageIfNeeded({
      imageUrl: "https://v3b.fal.media/foo.png",
      objectPath: "my/path",
      allowTemporary: true,
    });
    expect(r).toMatchObject({
      ok: true,
      persisted: false,
      temporary: true,
      url: "https://v3b.fal.media/foo.png",
    });
  });

  it("avec allowTemporary=false + all_buckets_failed → ok:false avec detail reason", async () => {
    sharedMock.persistImageIfNeeded.mockResolvedValueOnce({
      ok: false,
      persisted: false,
      reason: "all_buckets_failed",
      message: "bucket denied",
      debugSourceUrl: "data:image/png;base64,xxx",
    });
    const r = await persistGeneratedImageIfNeeded({
      imageUrl: "data:image/png;base64,xxx",
      objectPath: "my/path",
      allowTemporary: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("all_buckets_failed");
  });
});
