import { describe, expect, it } from "vitest";

import {
  buildReaderPanelSlots,
  getReaderLayoutDescriptor,
  mirrorCssGridAreas,
} from "./reader-page-format";

describe("reader-page-format", () => {
  it("miroite une grille CSS pour le mode RTL", () => {
    expect(mirrorCssGridAreas(`"a b" "c d"`)).toBe(`"b a" "d c"`);
  });

  it("calcule les areas ordonnées en RTL", () => {
    const descriptor = getReaderLayoutDescriptor("grid_2x2", "rtl");
    expect(descriptor.templateId).toBe("grid_2x2_rtl");
    expect(descriptor.areas).toEqual(["b", "a", "d", "c"]);
  });

  it("construit des panelSlots alignés sur le sens de lecture", () => {
    const slots = buildReaderPanelSlots({
      template: "grid_2x2",
      readingDirection: "rtl",
      panelIds: ["p1", "p2", "p3", "p4"],
    });
    expect(slots.map((slot) => [slot.panelId, slot.area])).toEqual([
      ["p1", "b"],
      ["p2", "a"],
      ["p3", "d"],
      ["p4", "c"],
    ]);
  });
});
