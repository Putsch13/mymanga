import { afterEach, describe, expect, it, vi } from "vitest";

describe("premiumVisualQaPreflightResponse", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("retourne null hors production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    vi.stubEnv("PREMIUM_VISUAL_QA_REQUIRED", "true");
    const { premiumVisualQaPreflightResponse } = await import("@/lib/generation/premium-visual-qa-preflight");
    expect(premiumVisualQaPreflightResponse()).toBeNull();
  });

  it("retourne null si PREMIUM_ONLY inactif", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "");
    vi.stubEnv("PREMIUM_VISUAL_QA_REQUIRED", "true");
    const { premiumVisualQaPreflightResponse } = await import("@/lib/generation/premium-visual-qa-preflight");
    expect(premiumVisualQaPreflightResponse()).toBeNull();
  });

  it("retourne null si PREMIUM_VISUAL_QA_REQUIRED=false", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    vi.stubEnv("PREMIUM_VISUAL_QA_REQUIRED", "false");
    vi.stubEnv("VISUAL_PANEL_QA_VISION", "");
    const { premiumVisualQaPreflightResponse } = await import("@/lib/generation/premium-visual-qa-preflight");
    expect(premiumVisualQaPreflightResponse()).toBeNull();
  });

  it("retourne 400 PREMIUM_VISUAL_QA_CONFIG_MISSING en prod premium-only stricte", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PIPELINE_V3_PREMIUM_ONLY", "true");
    vi.stubEnv("PREMIUM_VISUAL_QA_REQUIRED", "true");
    vi.stubEnv("OPENAI_API_KEY", "sk-x");
    vi.stubEnv("FAL_KEY", "fal-x");
    vi.stubEnv("ENABLE_IMAGE_MOCKS", "false");
    vi.stubEnv("VISUAL_PANEL_QA_VISION", "");
    vi.stubEnv("ENABLE_PREMIUM_VISION_QA", "true");
    const { premiumVisualQaPreflightResponse } = await import("@/lib/generation/premium-visual-qa-preflight");
    const res = premiumVisualQaPreflightResponse();
    expect(res).not.toBeNull();
    expect(res?.status).toBe(400);
    const body = await res!.json();
    expect(body.code).toBe("PREMIUM_VISUAL_QA_CONFIG_MISSING");
    expect(body.missing).toContain("VISUAL_PANEL_QA_VISION");
  });
});
