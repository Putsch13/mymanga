/**
 * P1.1 — Tests du normaliseur d'enums shot-plan ↔ narrative-facts.
 *
 * Invariants vérifiés :
 *   - Chaque valeur canonique reste inchangée.
 *   - Chaque valeur du vocabulaire shot-plan est traduite vers la canonique.
 *   - Une valeur inconnue renvoie `null` et flag `source: "unknown"`.
 *   - Les espaces et majuscules sont tolérés.
 *   - L'alignement de type vérifie que les valeurs canoniques sont assignables
 *     aux types `SubjectFocus` / `CutawayType` de narrative-facts (compilation).
 */
import { describe, it, expect, vi } from "vitest";
import {
  normalizeSubjectFocus,
  normalizeCutawayType,
  normalizeShotType,
  normalizeCameraAngle,
  normalizeShotPlanPanelEnums,
  readShotPlanEnumsFromJson,
  CANONICAL_SUBJECT_FOCUS_VALUES,
  CANONICAL_CUTAWAY_VALUES,
  CANONICAL_SHOT_TYPE_VALUES,
  CANONICAL_CAMERA_ANGLE_VALUES,
} from "./enum-normalizer";

describe("normalizeSubjectFocus", () => {
  it.each(CANONICAL_SUBJECT_FOCUS_VALUES)("accepte la valeur canonique %s", (v) => {
    const r = normalizeSubjectFocus(v);
    expect(r.value).toBe(v);
    expect(r.source).toBeUndefined();
  });

  it("traduit le vocabulaire shot-plan vers canonique", () => {
    expect(normalizeSubjectFocus("antagonist")).toEqual({
      value: "enemy",
      source: "translated",
      raw: "antagonist",
    });
    expect(normalizeSubjectFocus("important_npc")).toEqual({
      value: "npc",
      source: "translated",
      raw: "important_npc",
    });
  });

  it("tolère majuscules et espaces", () => {
    expect(normalizeSubjectFocus("  ANTAGONIST ").value).toBe("enemy");
    expect(normalizeSubjectFocus("Hero").value).toBe("hero");
  });

  it("renvoie null pour null / undefined / vide", () => {
    expect(normalizeSubjectFocus(null)).toEqual({ value: null });
    expect(normalizeSubjectFocus(undefined)).toEqual({ value: null });
    expect(normalizeSubjectFocus("")).toEqual({ value: null });
  });

  it("flag unknown pour valeur inconnue", () => {
    const r = normalizeSubjectFocus("mecha_pilot");
    expect(r.value).toBeNull();
    expect(r.source).toBe("unknown");
    expect(r.raw).toBe("mecha_pilot");
  });
});

describe("normalizeCutawayType", () => {
  it.each(CANONICAL_CUTAWAY_VALUES)("accepte la valeur canonique %s", (v) => {
    expect(normalizeCutawayType(v).value).toBe(v);
  });

  it("traduit les cutaways shot-plan", () => {
    expect(normalizeCutawayType("hands").value).toBe("prop_insert");
    expect(normalizeCutawayType("object").value).toBe("prop_insert");
    expect(normalizeCutawayType("eyes").value).toBe("reaction");
    expect(normalizeCutawayType("landscape").value).toBe("environment");
    expect(normalizeCutawayType("crowd_reaction").value).toBe("npc_group");
  });

  it("renvoie null pour inconnu", () => {
    const r = normalizeCutawayType("zoom_blur");
    expect(r.value).toBeNull();
    expect(r.source).toBe("unknown");
  });
});

describe("normalizeShotType", () => {
  it.each(CANONICAL_SHOT_TYPE_VALUES)("accepte la valeur canonique %s", (v) => {
    expect(normalizeShotType(v).value).toBe(v);
  });

  it("traduit establishing → wide (PanelContract ne connaît pas establishing)", () => {
    const r = normalizeShotType("establishing");
    expect(r.value).toBe("wide");
    expect(r.source).toBe("translated");
  });

  it("renvoie null pour inconnu", () => {
    expect(normalizeShotType("close").value).toBeNull();
    expect(normalizeShotType("fisheye").value).toBeNull();
  });
});

describe("normalizeCameraAngle", () => {
  it.each(CANONICAL_CAMERA_ANGLE_VALUES)("accepte la valeur canonique %s", (v) => {
    expect(normalizeCameraAngle(v).value).toBe(v);
  });

  it("traduit le vocabulaire shot-plan (low/high/worm/birds_eye)", () => {
    expect(normalizeCameraAngle("low").value).toBe("low_angle");
    expect(normalizeCameraAngle("high").value).toBe("high_angle");
    expect(normalizeCameraAngle("worm").value).toBe("low_angle");
    expect(normalizeCameraAngle("birds_eye").value).toBe("high_angle");
  });

  it("renvoie null pour inconnu", () => {
    expect(normalizeCameraAngle("fisheye").value).toBeNull();
  });
});

describe("normalizeShotPlanPanelEnums", () => {
  it("normalise en bloc un panel shot-plan vers canonique", () => {
    const out = normalizeShotPlanPanelEnums({
      shotType: "establishing",
      cameraAngle: "birds_eye",
      subjectFocus: "antagonist",
      cutawayType: "landscape",
    });
    expect(out).toMatchObject({
      shotType: "wide",
      cameraAngle: "high_angle",
      subjectFocus: "enemy",
      cutawayType: "environment",
      unknowns: [],
    });
  });

  it("logue un warning et peuple `unknowns` pour chaque valeur inconnue", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = normalizeShotPlanPanelEnums(
      {
        shotType: "close",
        cameraAngle: "fisheye",
        subjectFocus: "mecha_pilot",
        cutawayType: "zoom_blur",
      },
      "test-ctx",
    );
    expect(out.shotType).toBeNull();
    expect(out.cameraAngle).toBeNull();
    expect(out.subjectFocus).toBeNull();
    expect(out.cutawayType).toBeNull();
    expect(out.unknowns).toEqual([
      "shotType=close",
      "cameraAngle=fisheye",
      "subjectFocus=mecha_pilot",
      "cutawayType=zoom_blur",
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ne loggue rien si tout est canonique", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    normalizeShotPlanPanelEnums({
      shotType: "closeup",
      cameraAngle: "eye_level",
      subjectFocus: "hero",
      cutawayType: "none",
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("readShotPlanEnumsFromJson (P1.2)", () => {
  it("renvoie tout null si l'entrée est null/undefined", () => {
    const r = readShotPlanEnumsFromJson(null);
    expect(r.shotType).toBeNull();
    expect(r.subjectFocus).toBeNull();
    expect(r.cutawayType).toBeNull();
    expect(r.cameraAngle).toBeNull();
    expect(r.unknowns).toEqual([]);
  });

  it("lit uniquement les string (ignore number, bool, object, null)", () => {
    const r = readShotPlanEnumsFromJson({
      shotType: 42,
      cameraAngle: true,
      subjectFocus: { nested: "bad" },
      cutawayType: null,
    } as unknown as Record<string, unknown>);
    expect(r.shotType).toBeNull();
    expect(r.cameraAngle).toBeNull();
    expect(r.subjectFocus).toBeNull();
    expect(r.cutawayType).toBeNull();
    expect(r.unknowns).toEqual([]);
  });

  it("normalise les valeurs shot-plan depuis un JSON quelconque", () => {
    const r = readShotPlanEnumsFromJson({
      shotType: "establishing",
      cameraAngle: "low",
      subjectFocus: "antagonist",
      cutawayType: "landscape",
    });
    expect(r.shotType).toBe("wide");
    expect(r.cameraAngle).toBe("low_angle");
    expect(r.subjectFocus).toBe("enemy");
    expect(r.cutawayType).toBe("environment");
  });

  it("détecte les unknowns (drift) via `unknowns`", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = readShotPlanEnumsFromJson(
      { subjectFocus: "supervillain_spotlight" },
      "test",
    );
    expect(r.subjectFocus).toBeNull();
    expect(r.unknowns).toContain("subjectFocus=supervillain_spotlight");
    warn.mockRestore();
  });
});
