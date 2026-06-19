import { describe, it, expect } from "vitest";
import {
  DRIFT_POLICY,
  classifyDriftAxis,
  isHardDriftAxis,
  filterHardAxes,
  requiresCanonApproval,
  buildDriftHintBundle,
  overrideDriftForCharacter,
  resolveEffectiveDriftClass,
} from "@/lib/canon/drift-policy";

describe("drift-policy (P7.4)", () => {
  it("axes hard par défaut : traits identitaires durs", () => {
    expect(isHardDriftAxis("face_identity")).toBe(true);
    expect(isHardDriftAxis("hair_color")).toBe(true);
    expect(isHardDriftAxis("eye_color")).toBe(true);
    expect(isHardDriftAxis("scars")).toBe(true);
    expect(isHardDriftAxis("tattoos")).toBe(true);
    expect(isHardDriftAxis("prosthetics")).toBe(true);
    expect(isHardDriftAxis("outfit_default")).toBe(true);
  });

  it("axes free : pose / expression / lumière / angle", () => {
    expect(classifyDriftAxis("pose")).toBe("free");
    expect(classifyDriftAxis("expression")).toBe("free");
    expect(classifyDriftAxis("light")).toBe("free");
    expect(classifyDriftAxis("angle")).toBe("free");
  });

  it("axes soft : style de cheveux / tenue alt", () => {
    expect(classifyDriftAxis("hair_style")).toBe("soft");
    expect(classifyDriftAxis("outfit_alt")).toBe("soft");
  });

  it("filterHardAxes ne garde que les axes hard", () => {
    const items = [
      { axis: "hair_color" as const, label: "A" },
      { axis: "pose" as const, label: "B" },
      { axis: "scars" as const, label: "C" },
    ];
    const kept = filterHardAxes(items);
    expect(kept.map((i) => i.label).sort()).toEqual(["A", "C"]);
  });

  it("requiresCanonApproval respecte les axes hard par défaut", () => {
    expect(requiresCanonApproval("hair_color", null)).toBe(true);
    expect(requiresCanonApproval("pose", null)).toBe(false);
  });

  it("requiresCanonApproval active une soft si listée", () => {
    expect(requiresCanonApproval("hair_style", ["hair_style"])).toBe(true);
    expect(requiresCanonApproval("expression", ["*"])).toBe(true);
  });

  it("buildDriftHintBundle sépare mustKeep / canVary / free", () => {
    const b = buildDriftHintBundle([
      "hair_color",
      "eye_color",
      "hair_style",
      "pose",
      "scars",
    ]);
    expect(b.mustKeep.sort()).toEqual(["eye_color", "hair_color", "scars"]);
    expect(b.canVary).toEqual(["hair_style"]);
    expect(b.free).toEqual(["pose"]);
  });

  it("overrideDriftForCharacter transforme hard en soft selon flags", () => {
    const o = overrideDriftForCharacter({
      canChangeHair: true,
      canChangeOutfitFreely: true,
    });
    expect(o.hair_color).toBe("soft");
    expect(o.outfit_default).toBe("soft");
    expect(o.scars).toBeUndefined();
  });

  it("resolveEffectiveDriftClass préfère override, fallback policy", () => {
    const o = { hair_color: "soft" as const };
    expect(resolveEffectiveDriftClass("hair_color", o)).toBe("soft");
    expect(resolveEffectiveDriftClass("eye_color", o)).toBe("hard");
  });

  it("DRIFT_POLICY couvre tous les axes typés", () => {
    const axes: (keyof typeof DRIFT_POLICY)[] = [
      "face_identity", "hair_color", "hair_style", "eye_color", "eye_shape",
      "skin_tone", "body_build", "silhouette", "height", "scars", "tattoos",
      "prosthetics", "fixed_accessories", "outfit_default", "outfit_alt",
      "pose", "expression", "light", "angle",
    ];
    for (const a of axes) {
      expect(DRIFT_POLICY[a]).toBeDefined();
    }
  });
});
