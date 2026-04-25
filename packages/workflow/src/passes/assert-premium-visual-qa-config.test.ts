import { afterEach, describe, expect, it } from "vitest";
import { assertPremiumVisualQaConfig } from "./assert-premium-visual-qa-config";

describe("assertPremiumVisualQaConfig", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.OPENAI_API_KEY = prev.OPENAI_API_KEY;
    process.env.FAL_KEY = prev.FAL_KEY;
    process.env.FAL_API_KEY = prev.FAL_API_KEY;
    process.env.ENABLE_IMAGE_MOCKS = prev.ENABLE_IMAGE_MOCKS;
    process.env.VISUAL_PANEL_QA_VISION = prev.VISUAL_PANEL_QA_VISION;
    process.env.ENABLE_PREMIUM_VISION_QA = prev.ENABLE_PREMIUM_VISION_QA;
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
