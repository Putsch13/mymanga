import { afterEach, describe, expect, it } from "vitest";
import {
  assertPremiumVisualQaConfig,
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
} from "./assert-premium-visual-qa-config";

describe("assertPremiumVisualQaConfig", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.OPENAI_API_KEY = prev.OPENAI_API_KEY;
    process.env.FAL_KEY = prev.FAL_KEY;
    process.env.FAL_API_KEY = prev.FAL_API_KEY;
    process.env.ENABLE_IMAGE_MOCKS = prev.ENABLE_IMAGE_MOCKS;
    process.env.VISUAL_PANEL_QA_VISION = prev.VISUAL_PANEL_QA_VISION;
    process.env.ENABLE_PREMIUM_VISION_QA = prev.ENABLE_PREMIUM_VISION_QA;
    process.env.PREMIUM_VISUAL_QA_REQUIRED = prev.PREMIUM_VISUAL_QA_REQUIRED;
  });

  it("passe quand toutes les variables prod premium sont correctes", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.FAL_KEY = "fal-test";
    process.env.ENABLE_IMAGE_MOCKS = "false";
    process.env.VISUAL_PANEL_QA_VISION = "true";
    process.env.ENABLE_PREMIUM_VISION_QA = "true";
    expect(() => assertPremiumVisualQaConfig()).not.toThrow();
  });

  it("échoue si VISUAL_PANEL_QA_VISION n'est pas true", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.FAL_KEY = "fal-test";
    process.env.ENABLE_IMAGE_MOCKS = "false";
    process.env.VISUAL_PANEL_QA_VISION = "";
    process.env.ENABLE_PREMIUM_VISION_QA = "true";
    expect(() => assertPremiumVisualQaConfig()).toThrow(/VISUAL_PANEL_QA_VISION/);
  });
});

describe("getPremiumVisualQaConfigStatus", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env.OPENAI_API_KEY = prev.OPENAI_API_KEY;
    process.env.FAL_KEY = prev.FAL_KEY;
    process.env.FAL_API_KEY = prev.FAL_API_KEY;
    process.env.ENABLE_IMAGE_MOCKS = prev.ENABLE_IMAGE_MOCKS;
    process.env.VISUAL_PANEL_QA_VISION = prev.VISUAL_PANEL_QA_VISION;
    process.env.ENABLE_PREMIUM_VISION_QA = prev.ENABLE_PREMIUM_VISION_QA;
    process.env.PREMIUM_VISUAL_QA_REQUIRED = prev.PREMIUM_VISUAL_QA_REQUIRED;
  });

  it("retourne ok quand la config est complète", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.FAL_KEY = "fal-test";
    process.env.ENABLE_IMAGE_MOCKS = "false";
    process.env.VISUAL_PANEL_QA_VISION = "true";
    process.env.ENABLE_PREMIUM_VISION_QA = "true";
    expect(getPremiumVisualQaConfigStatus()).toEqual({ ok: true, missing: [] });
  });

  it("liste les clés manquantes", () => {
    process.env.OPENAI_API_KEY = "";
    process.env.FAL_KEY = "";
    process.env.ENABLE_IMAGE_MOCKS = "true";
    process.env.VISUAL_PANEL_QA_VISION = "";
    process.env.ENABLE_PREMIUM_VISION_QA = "";
    const st = getPremiumVisualQaConfigStatus();
    expect(st.ok).toBe(false);
    expect(st.missing).toContain("OPENAI_API_KEY");
    expect(st.missing).toContain("FAL_KEY");
    expect(st.missing).toContain("ENABLE_IMAGE_MOCKS_OFF");
    expect(st.missing).toContain("VISUAL_PANEL_QA_VISION");
    expect(st.missing).toContain("ENABLE_PREMIUM_VISION_QA");
  });
});

describe("isPremiumVisualQaStrictlyRequired", () => {
  const prev = process.env.PREMIUM_VISUAL_QA_REQUIRED;
  afterEach(() => {
    process.env.PREMIUM_VISUAL_QA_REQUIRED = prev;
  });

  it("true par défaut ou si valeur != false", () => {
    delete process.env.PREMIUM_VISUAL_QA_REQUIRED;
    expect(isPremiumVisualQaStrictlyRequired()).toBe(true);
    process.env.PREMIUM_VISUAL_QA_REQUIRED = "true";
    expect(isPremiumVisualQaStrictlyRequired()).toBe(true);
  });

  it("false uniquement pour PREMIUM_VISUAL_QA_REQUIRED=false", () => {
    process.env.PREMIUM_VISUAL_QA_REQUIRED = "false";
    expect(isPremiumVisualQaStrictlyRequired()).toBe(false);
  });
});
