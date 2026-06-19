import { describe, expect, it } from "vitest";
import {
  PREMIUM_PANEL_RANGES,
  getPremiumPanelRange,
  inferNarrativeDensity,
} from "./production-rules";

describe("inferNarrativeDensity (TODO-33)", () => {
  it("classe 'short' une histoire avec ≤4 beats et ≤5 events", () => {
    expect(inferNarrativeDensity({ beatCount: 3, eventCount: 4 })).toBe("short");
    expect(inferNarrativeDensity({ beatCount: 4, eventCount: 5 })).toBe("short");
  });

  it("classe 'dense' une histoire ≥8 beats ou ≥10 events", () => {
    expect(inferNarrativeDensity({ beatCount: 9, eventCount: 6 })).toBe("dense");
    expect(inferNarrativeDensity({ beatCount: 4, eventCount: 12 })).toBe("dense");
  });

  it("classe 'standard' tout ce qui est entre les deux", () => {
    expect(inferNarrativeDensity({ beatCount: 6, eventCount: 7 })).toBe("standard");
    expect(inferNarrativeDensity({ beatCount: 5, eventCount: 9 })).toBe("standard");
  });

  it("expose des plages cohérentes (short < standard < dense)", () => {
    const s = getPremiumPanelRange("short");
    const m = getPremiumPanelRange("standard");
    const d = getPremiumPanelRange("dense");
    expect(s.maximum).toBeLessThanOrEqual(m.minimum);
    expect(m.maximum).toBeLessThanOrEqual(d.minimum);
  });

  it("garantit que la plage 'short' n'inflate pas un mini-chapitre (≤50 panels)", () => {
    expect(PREMIUM_PANEL_RANGES.short.maximum).toBeLessThanOrEqual(50);
  });

  it("garantit que la plage 'dense' couvre les histoires épaisses (≥70 panels target)", () => {
    expect(PREMIUM_PANEL_RANGES.dense.target).toBeGreaterThanOrEqual(70);
  });
});
