/**
 * P2.3 — Durcissement du proxy image : allowlist hosts exacte + signature HMAC
 * optionnelle. Ces tests vérifient le filtrage d'hosts et la vérification de
 * signature SANS déclencher de fetch réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const ORIGINAL_ENV = { ...process.env };

async function loadProxy() {
  vi.resetModules();
  return import("../app/api/images/proxy/route");
}

describe("P2.3 — proxy image allowlist", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("accepte les hosts FAL temporaires connus", async () => {
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.isHostAllowed("v3b.fal.media")).toBe(true);
    expect(__proxyInternals.isHostAllowed("cdn.fal.ai")).toBe(true);
  });

  it("accepte les sous-domaines FAL au format attendu uniquement", async () => {
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.isAllowedProviderSubdomain("files-prod-us.fal.media")).toBe(true);
    expect(__proxyInternals.isAllowedProviderSubdomain("storage-eu.fal.media")).toBe(true);
    expect(__proxyInternals.isAllowedProviderSubdomain("evil.example.fal.media")).toBe(false);
    expect(__proxyInternals.isAllowedProviderSubdomain("fal.media")).toBe(false);
  });

  it("accepte uniquement le host Supabase du projet", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdef.supabase.co";
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.isHostAllowed("abcdef.supabase.co")).toBe(true);
    expect(__proxyInternals.isHostAllowed("evil.supabase.co")).toBe(false);
    expect(__proxyInternals.isHostAllowed("attacker-abcdef.supabase.co.evil.com")).toBe(false);
  });

  it("refuse les hosts hors allowlist", async () => {
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.isHostAllowed("example.com")).toBe(false);
    expect(__proxyInternals.isHostAllowed("169.254.169.254")).toBe(false);
    expect(__proxyInternals.isHostAllowed("localhost")).toBe(false);
  });

  it("sans secret configuré : verifySignature passe toujours (retro-compat)", async () => {
    delete process.env.IMAGE_PROXY_SIGN_SECRET;
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.verifySignature("https://example.com/x", null)).toBe(true);
    expect(__proxyInternals.verifySignature("https://example.com/x", "deadbeef")).toBe(true);
  });

  it("avec secret configuré : rejette les requêtes non signées", async () => {
    process.env.IMAGE_PROXY_SIGN_SECRET = "s3cret-test";
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.verifySignature("https://example.com/x", null)).toBe(false);
    expect(__proxyInternals.verifySignature("https://example.com/x", "notahex")).toBe(false);
    expect(__proxyInternals.verifySignature("https://example.com/x", "00ff00ff")).toBe(false);
  });

  it("avec secret configuré : accepte une signature HMAC valide", async () => {
    const secret = "s3cret-test";
    process.env.IMAGE_PROXY_SIGN_SECRET = secret;
    const url = "https://abcdef.supabase.co/storage/v1/object/public/scene-keyframes/x.jpg";
    const sig = createHmac("sha256", secret).update(url).digest("hex");
    const { __proxyInternals } = await loadProxy();
    expect(__proxyInternals.verifySignature(url, sig)).toBe(true);
    // Moindre altération → invalide
    expect(__proxyInternals.verifySignature(url + "?", sig)).toBe(false);
  });
});
