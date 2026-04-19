import { describe, expect, it } from "vitest";
import { assertStableImageUrl, checkStableImageUrl } from "./pipeline-helpers";

/**
 * P0.1 — Tests contractuels sur `persistImageIfNeeded`.
 *
 * Note : on ne peut pas mocker Supabase proprement sans DI ici sans ajouter
 * une dépendance de test. On couvre donc :
 *   1. Le garde `assertStableImageUrl` (invariant appliqué avant tout
 *      `ok:true + persisted:true`).
 *   2. Les branches synchrones de `persistImageIfNeeded` qui refusent de
 *      retourner un succès :
 *      - pas de client Supabase configuré.
 *      - data-URL invalide.
 *
 * Les tests couvrant l'upload réel sont couverts via les snapshots d'eval
 * existants et l'intégration e2e hors CI.
 */
describe("assertStableImageUrl", () => {
  it("refuse une URL FAL temporaire", () => {
    expect(checkStableImageUrl("https://v3b.fal.media/files/abc.jpg").ok).toBe(false);
    expect(() => assertStableImageUrl("https://v3b.fal.media/files/abc.jpg")).toThrow(/provider_temporary_host/);
  });

  it("refuse une URL BFL delivery", () => {
    expect(checkStableImageUrl("https://delivery-1.bfl.ai/out.png").ok).toBe(false);
  });

  it("refuse une URL signée Supabase", () => {
    expect(checkStableImageUrl("https://proj.supabase.co/storage/v1/object/sign/bucket/path?token=xyz").ok).toBe(false);
  });

  it("refuse une data URL", () => {
    expect(checkStableImageUrl("data:image/png;base64,AAAA").ok).toBe(false);
  });

  it("accepte une URL Supabase publique", () => {
    expect(checkStableImageUrl("https://proj.supabase.co/storage/v1/object/public/mymanga-images/path.jpg").ok).toBe(true);
  });

  it("refuse une URL vide ou absente", () => {
    expect(checkStableImageUrl(null).ok).toBe(false);
    expect(checkStableImageUrl(undefined).ok).toBe(false);
    expect(checkStableImageUrl("").ok).toBe(false);
  });
});

describe("persistImageIfNeeded — contrat strict", () => {
  const originalEnv = { ...process.env };

  async function importFresh() {
    // Import paresseux pour que l'absence des env vars soit vue par getStorageClient.
    const mod = await import("./pipeline-image-persistence");
    return mod.persistImageIfNeeded;
  }

  it("refuse de persister une URL FAL si Supabase n'est pas configuré", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const persistImageIfNeeded = await importFresh();
    const result = await persistImageIfNeeded({
      imageUrl: "https://v3b.fal.media/files/temp.jpg",
      projectId: "proj",
      chapterId: "chap",
      sceneImageId: "panel-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_storage_configured");
      expect(result.persisted).toBe(false);
      expect(result.debugSourceUrl).toBe("https://v3b.fal.media/files/temp.jpg");
    }

    process.env = { ...originalEnv };
  });

  it("retourne persisted:false (pas d'upload) pour une URL Supabase déjà stable", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "key";

    const persistImageIfNeeded = await importFresh();
    const result = await persistImageIfNeeded({
      imageUrl: "https://proj.supabase.co/storage/v1/object/public/bucket/path.jpg",
      projectId: "proj",
      chapterId: "chap",
      sceneImageId: "panel-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.persisted).toBe(false);
      expect(result.bucket).toBeNull();
      expect(result.storageKey).toBeNull();
    }

    process.env = { ...originalEnv };
  });

  it("refuse une data-URL invalide (pas de virgule)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "key";

    const persistImageIfNeeded = await importFresh();
    const result = await persistImageIfNeeded({
      imageUrl: "data:image/png;base64NOCOMMA",
      projectId: "proj",
      chapterId: "chap",
      sceneImageId: "panel-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("data_url_invalid");
    }

    process.env = { ...originalEnv };
  });
});
