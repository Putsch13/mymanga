/**
 * P2.3 — Durcissement du proxy image : allowlist hosts exacte + signature HMAC
 * optionnelle. Ces tests vérifient le filtrage d'hosts et la vérification de
 * signature SANS déclencher de fetch réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const ORIGINAL_ENV = { ...process.env };

async function loadInternals() {
  vi.resetModules();
  return import("../app/api/images/proxy/internals");
}

describe("P2.3 — proxy image allowlist", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("accepte les hosts FAL temporaires connus", async () => {
    const m = await loadInternals();
    expect(m.isHostAllowed("v3b.fal.media")).toBe(true);
    expect(m.isHostAllowed("cdn.fal.ai")).toBe(true);
  });

  it("accepte les sous-domaines FAL au format attendu uniquement", async () => {
    const m = await loadInternals();
    expect(m.isAllowedProviderSubdomain("files-prod-us.fal.media")).toBe(true);
    expect(m.isAllowedProviderSubdomain("storage-eu.fal.media")).toBe(true);
    expect(m.isAllowedProviderSubdomain("evil.example.fal.media")).toBe(false);
    expect(m.isAllowedProviderSubdomain("fal.media")).toBe(false);
  });

  it("accepte uniquement le host Supabase du projet", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdef.supabase.co";
    const m = await loadInternals();
    expect(m.isHostAllowed("abcdef.supabase.co")).toBe(true);
    expect(m.isHostAllowed("evil.supabase.co")).toBe(false);
    expect(m.isHostAllowed("attacker-abcdef.supabase.co.evil.com")).toBe(false);
  });

  it("refuse les hosts hors allowlist", async () => {
    const m = await loadInternals();
    expect(m.isHostAllowed("example.com")).toBe(false);
    expect(m.isHostAllowed("169.254.169.254")).toBe(false);
    expect(m.isHostAllowed("localhost")).toBe(false);
  });

  it("sans secret configuré : verifySignature passe toujours (retro-compat)", async () => {
    delete process.env.IMAGE_PROXY_SIGN_SECRET;
    const m = await loadInternals();
    expect(m.verifySignature("https://example.com/x", null)).toBe(true);
    expect(m.verifySignature("https://example.com/x", "deadbeef")).toBe(true);
  });

  it("avec secret configuré : rejette les requêtes non signées", async () => {
    process.env.IMAGE_PROXY_SIGN_SECRET = "s3cret-test";
    const m = await loadInternals();
    expect(m.verifySignature("https://example.com/x", null)).toBe(false);
    expect(m.verifySignature("https://example.com/x", "notahex")).toBe(false);
    expect(m.verifySignature("https://example.com/x", "00ff00ff")).toBe(false);
  });

  it("avec secret configuré : accepte une signature HMAC valide", async () => {
    const secret = "s3cret-test";
    process.env.IMAGE_PROXY_SIGN_SECRET = secret;
    const url = "https://abcdef.supabase.co/storage/v1/object/public/scene-keyframes/x.jpg";
    const sig = createHmac("sha256", secret).update(url).digest("hex");
    const m = await loadInternals();
    expect(m.verifySignature(url, sig)).toBe(true);
    expect(m.verifySignature(url + "?", sig)).toBe(false);
  });

  it("renvoie un cache-control public quand l'upstream est une image", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })));
    const { GET } = await import("../app/api/images/proxy/route");

    const res = await GET(
      new Request(
        "http://localhost/api/images/proxy?url=" +
          encodeURIComponent("https://v3b.fal.media/files/x.jpg"),
      ),
    );
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});
