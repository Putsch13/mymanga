/**
 * P0.4 — Helper serveur central `toProxiedServerUrl`.
 *
 * Valide que le helper unifie la fabrication d'URL proxy côté SSR :
 *   - null / undefined → null
 *   - URL déjà proxifiée (`/api/images/proxy...`) → inchangée
 *   - host externe dans l'allowlist (FAL, Supabase du projet) → proxifié
 *   - host hors allowlist → inchangé (pas d'open proxy)
 *   - secret HMAC configuré → URL signée (`&sig=<hex>`)
 *
 * Les modules sont rechargés via `vi.resetModules()` car l'allowlist est
 * figée à l'import (lecture `process.env.NEXT_PUBLIC_SUPABASE_URL`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function load() {
  vi.resetModules();
  return import("../lib/images/proxy-url.server");
}

describe("toProxiedServerUrl (P0.4)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://abcdef.supabase.co" };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("null / undefined → null", async () => {
    const { toProxiedServerUrl } = await load();
    expect(toProxiedServerUrl(null)).toBeNull();
    expect(toProxiedServerUrl(undefined)).toBeNull();
  });

  it("URL déjà proxifiée → inchangée (pas de double-proxy)", async () => {
    const { toProxiedServerUrl } = await load();
    const u = "/api/images/proxy?url=%2Fstuff";
    expect(toProxiedServerUrl(u)).toBe(u);
  });

  it("host Supabase du projet → proxifié", async () => {
    const { toProxiedServerUrl } = await load();
    const src = "https://abcdef.supabase.co/storage/v1/object/public/x/y.png";
    const out = toProxiedServerUrl(src);
    expect(out).not.toBeNull();
    expect(out!.startsWith("/api/images/proxy?url=")).toBe(true);
    expect(decodeURIComponent(out!.split("url=")[1]!)).toBe(src);
  });

  it("host FAL temporaire → proxifié", async () => {
    const { toProxiedServerUrl } = await load();
    const src = "https://v3b.fal.media/files/xyz.png";
    expect(toProxiedServerUrl(src)!.startsWith("/api/images/proxy?url=")).toBe(true);
  });

  it("host hors allowlist → renvoyé tel quel (pas d'open proxy)", async () => {
    const { toProxiedServerUrl } = await load();
    const src = "https://evil.example.com/image.png";
    expect(toProxiedServerUrl(src)).toBe(src);
  });

  it("host Supabase tiers (autre projet) → PAS proxifié", async () => {
    const { toProxiedServerUrl } = await load();
    const src = "https://other-project.supabase.co/storage/v1/object/public/x/y.png";
    expect(toProxiedServerUrl(src)).toBe(src);
  });

  it("secret HMAC configuré → URL signée", async () => {
    process.env.IMAGE_PROXY_SIGN_SECRET = "topsecret";
    const { toProxiedServerUrl } = await load();
    const src = "https://abcdef.supabase.co/storage/v1/object/public/x/y.png";
    const out = toProxiedServerUrl(src)!;
    expect(out).toMatch(/^\/api\/images\/proxy\?url=[^&]+&sig=[0-9a-f]{64}$/);
  });

  it("sans secret → pas de sig dans l'URL", async () => {
    delete process.env.IMAGE_PROXY_SIGN_SECRET;
    const { toProxiedServerUrl } = await load();
    const src = "https://abcdef.supabase.co/storage/v1/object/public/x/y.png";
    const out = toProxiedServerUrl(src)!;
    expect(out.includes("sig=")).toBe(false);
  });
});
