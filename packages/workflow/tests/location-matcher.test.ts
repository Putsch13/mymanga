import { describe, expect, it } from "vitest";
import {
  normalizeLocationName,
  locationNamesEqual,
} from "../src/passes/narrative/location-matcher";

/**
 * P5.4 / P1.5 — Le normaliseur de noms de lieu doit être insensible aux
 * accents, à la casse et aux espaces multiples. C'est ce qui garantit
 * qu'un lieu cité "École Tōkai" dans une scène matche bien le Location
 * DB enregistré sous "ecole tokai" ou "ÉCOLE  tokai".
 */
describe("normalizeLocationName", () => {
  it("matche casse et accents", () => {
    expect(normalizeLocationName("École Tōkai")).toBe("ecole tokai");
    expect(normalizeLocationName("ecole tokai")).toBe("ecole tokai");
    expect(normalizeLocationName("ÉCOLE  tokai")).toBe("ecole tokai");
  });

  it("vide si entrée vide / null / undefined", () => {
    expect(normalizeLocationName("")).toBe("");
    expect(normalizeLocationName(null)).toBe("");
    expect(normalizeLocationName(undefined)).toBe("");
  });

  it("locationNamesEqual déduit l'équivalence via NFD + trim + casse", () => {
    expect(locationNamesEqual("Café Hōshi", "cafe hoshi")).toBe(true);
    expect(locationNamesEqual("Donjon du Roi", "  donjon du roi  ")).toBe(true);
    expect(locationNamesEqual("Bureau A", "bureau b")).toBe(false);
    expect(locationNamesEqual(null, null)).toBe(false);
  });
});
