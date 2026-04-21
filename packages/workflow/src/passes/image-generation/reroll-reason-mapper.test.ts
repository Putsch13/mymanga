import { describe, it, expect } from "vitest";
import { rerollKindToReason } from "./reroll-reason-mapper";

describe("rerollKindToReason", () => {
  it("mappe chaque rerollKind connu vers la bonne reason", () => {
    expect(rerollKindToReason("REROLL_CHARACTER_FIDELITY")).toBe("drift_character");
    expect(rerollKindToReason("REROLL_ENVIRONMENT")).toBe("drift_environment");
    expect(rerollKindToReason("REROLL_STYLE")).toBe("drift_style");
    expect(rerollKindToReason("REROLL_COMPOSITION")).toBe("wrong_framing");
    expect(rerollKindToReason("REROLL_INTERACTION")).toBe("wrong_dominant_subject");
  });

  it("retombe sur low_quality pour null/undefined/inconnu", () => {
    expect(rerollKindToReason(null)).toBe("low_quality");
    expect(rerollKindToReason(undefined)).toBe("low_quality");
  });
});
