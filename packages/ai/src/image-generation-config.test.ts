import { describe, expect, it } from "vitest";
import {
  getPremiumImageSize,
  PREMIUM_IMAGE_SIZES,
  resolvePremiumImageSize,
} from "./image-generation-config";
import { summarizeGenerationStatuses } from "./generation-status";

describe("premium image presets", () => {
  it("uses premium draft panel dimensions", () => {
    expect(getPremiumImageSize("PANEL_DRAFT")).toMatchObject({
      width: 768,
      height: 1024,
    });
  });

  it("keeps all premium presets free of 512x768 legacy sizes", () => {
    for (const preset of Object.values(PREMIUM_IMAGE_SIZES)) {
      expect(`${preset.width}x${preset.height}`).not.toBe("512x768");
    }
  });

  it("falls back to preset size when width or height are missing", () => {
    expect(resolvePremiumImageSize("PANEL_DRAFT", { width: null, height: 1024 })).toEqual({
      width: 768,
      height: 1024,
    });
  });
});

describe("generation status summary", () => {
  it("returns full operational status when nothing degraded", () => {
    expect(summarizeGenerationStatuses([])).toMatchInlineSnapshot(`
      {
        "degradedModes": [],
        "isDegraded": false,
        "operationalStatus": "FULLY_OPERATIONAL",
      }
    `);
  });

  it("prioritizes hard degraded states over soft fallbacks", () => {
    expect(
      summarizeGenerationStatuses([
        "DEGRADED_DIALOGUE_FALLBACK",
        "DEGRADED_OUTLINE_FALLBACK",
        "DEGRADED_NO_OPENAI",
      ]),
    ).toMatchInlineSnapshot(`
      {
        "degradedModes": [
          "DEGRADED_DIALOGUE_FALLBACK",
          "DEGRADED_OUTLINE_FALLBACK",
          "DEGRADED_NO_OPENAI",
        ],
        "isDegraded": true,
        "operationalStatus": "DEGRADED_NO_OPENAI",
      }
    `);
  });
});
