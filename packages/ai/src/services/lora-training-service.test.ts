import { describe, expect, it } from "vitest";
import { computeLoraReadiness } from "./lora-training-service";

describe("computeLoraReadiness", () => {
  it("pénalise un dataset 3 portraits sans full-body (low-data unbalanced)", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a", "b", "c"],
      imageTypes: ["portrait", "portrait", "portrait"],
    });

    expect(report.score).toBeLessThan(0.6);
    expect(report.lowDataMode).toBe(true);
    expect(report.reasons).toContain("portrait_full_body_ratio_unbalanced");
    expect(report.reasons).toContain("dataset_visual_consistency_too_low");
  });

  it("valide un dataset plus équilibré", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a", "b", "c", "d", "e", "f"],
      imageTypes: ["portrait", "full_body_front", "pose", "closeup", "three_quarter", "outfit"],
    });

    expect(report.score).toBeGreaterThanOrEqual(0.6);
    expect(report.lowDataMode).toBe(false);
    expect(report.reasons).toHaveLength(0);
  });

  it("MOAT-3 — accepte un dataset minimal de 3 refs si bien équilibré (1 portrait + 2 full-body)", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a", "b", "c"],
      imageTypes: ["portrait", "full_body_front", "outfit"],
    });

    expect(report.lowDataMode).toBe(true);
    expect(report.minImagesOk).toBe(true);
    expect(report.diversityOk).toBe(true);
    expect(report.ratioOk).toBe(true);
    expect(report.consistencyOk).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(0.6);
    expect(report.reasons).toEqual(["low_data_mode_compensation_active"]);
  });

  it("MOAT-3 — refuse un dataset 1 ref (en dessous du minimum absolu)", () => {
    const report = computeLoraReadiness({
      imageUrls: ["a"],
      imageTypes: ["portrait"],
    });
    expect(report.minImagesOk).toBe(false);
    expect(report.lowDataMode).toBe(false);
    expect(report.reasons).toContain("minimum_images_not_met");
  });
});
