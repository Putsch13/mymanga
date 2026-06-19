/**
 * Sprint 2 — Composition des panels
 *
 * Tests des helpers géométriques du modèle de bulles.
 */

import { describe, expect, it } from "vitest";
import {
  bubbleOverlaps,
  bubbleOverlapArea,
  clampBoundsToPanel,
  computeForbiddenOverlap,
  isInsidePanel,
  reservedZoneToBounds,
} from "../components/manga/panel/bubble-layout-model";

describe("bubble-layout-model — helpers géométriques", () => {
  it("bubbleOverlaps détecte le recouvrement", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 40, y: 40, width: 30, height: 30 };
    expect(bubbleOverlaps(a, b)).toBe(true);
  });

  it("bubbleOverlaps renvoie false pour bounds disjointes", () => {
    const a = { x: 0, y: 0, width: 40, height: 40 };
    const b = { x: 50, y: 50, width: 30, height: 30 };
    expect(bubbleOverlaps(a, b)).toBe(false);
  });

  it("bubbleOverlapArea calcule la surface commune", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(bubbleOverlapArea(a, b)).toBe(25);
  });

  it("isInsidePanel refuse les bounds sortantes", () => {
    expect(isInsidePanel({ x: 50, y: 50, width: 60, height: 10 })).toBe(false);
    expect(isInsidePanel({ x: -1, y: 0, width: 10, height: 10 })).toBe(false);
    expect(isInsidePanel({ x: 20, y: 20, width: 30, height: 30 })).toBe(true);
  });

  it("clampBoundsToPanel ramène une bulle sortante à l'intérieur", () => {
    const clamped = clampBoundsToPanel({ x: 80, y: 90, width: 30, height: 20 });
    expect(isInsidePanel(clamped)).toBe(true);
  });

  it("clampBoundsToPanel respecte la marge fournie", () => {
    const clamped = clampBoundsToPanel({ x: 0, y: 0, width: 40, height: 40 }, 5);
    expect(clamped.x).toBeGreaterThanOrEqual(5);
    expect(clamped.y).toBeGreaterThanOrEqual(5);
  });

  it("reservedZoneToBounds produit des coins valides", () => {
    for (const zone of ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const) {
      const bounds = reservedZoneToBounds(zone);
      expect(isInsidePanel(bounds)).toBe(true);
    }
  });

  it("computeForbiddenOverlap pondère par weight", () => {
    const bubble = { x: 0, y: 0, width: 50, height: 50 };
    const critical = [
      {
        id: "face",
        label: "visage",
        bounds: { x: 10, y: 10, width: 20, height: 20 },
        weight: 100,
      },
      {
        id: "hand",
        label: "main",
        bounds: { x: 30, y: 30, width: 10, height: 10 },
        weight: 50,
      },
    ];
    const overlap = computeForbiddenOverlap(bubble, critical);
    // 20*20 * 1.0 (face) + 10*10 * 0.5 (hand) = 400 + 50 = 450
    expect(overlap).toBe(450);
  });

  it("computeForbiddenOverlap = 0 si aucune zone", () => {
    expect(computeForbiddenOverlap({ x: 0, y: 0, width: 10, height: 10 }, [])).toBe(0);
  });
});
