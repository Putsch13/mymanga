import { describe, expect, it } from "vitest";
import { computeLoraReadiness } from "./lora-training-service";

describe("computeLoraReadiness", () => {
  it("pénalise un dataset trop portrait et trop pauvre", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a", "b", "c"],
      imageTypes: ["portrait", "portrait", "portrait"],
    });

    expect(report.score).toBeLessThan(0.6);
    expect(report.reasons).toContain("minimum_images_not_met");
  });

  it("valide un dataset plus équilibré", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a", "b", "c", "d", "e", "f"],
      imageTypes: ["portrait", "full_body_front", "pose", "closeup", "three_quarter", "outfit"],
    });

    expect(report.score).toBeGreaterThanOrEqual(0.6);
    expect(report.reasons).toHaveLength(0);
  });
});
