import { describe, it, expect } from "vitest";
import {
  GLOBAL_MANGA_ONLY_NEGATIVE_TERMS,
  computeStyleDriftRisk,
  createUnresolvedStyleContract,
  normaliseAnatomyBias,
  normaliseRenderFamily,
} from "./canonical-style-contract";

describe("CanonicalStyleContract — normalisation", () => {
  it("collapse realistic anatomy to grounded + flag coercion", () => {
    const out = normaliseAnatomyBias("realistic");
    expect(out.value).toBe("grounded");
    expect(out.wasCoerced).toBe(true);
  });

  it("preserve stylized/grounded/chibi/dynamic", () => {
    for (const bias of ["stylized", "grounded", "chibi", "dynamic"] as const) {
      const out = normaliseAnatomyBias(bias);
      expect(out.value).toBe(bias);
      expect(out.wasCoerced).toBe(false);
    }
  });

  it("fallback to stylized for null / unknown bias", () => {
    expect(normaliseAnatomyBias(null).value).toBe("stylized");
    expect(normaliseAnatomyBias("gritty").value).toBe("stylized");
  });

  it("renderFamily: semi_realistic is collapsed to manga", () => {
    const out = normaliseRenderFamily("semi_realistic");
    expect(out.value).toBe("manga");
    expect(out.wasCoerced).toBe(true);
  });

  it("renderFamily: manga / anime are preserved", () => {
    expect(normaliseRenderFamily("manga").value).toBe("manga");
    expect(normaliseRenderFamily("anime").value).toBe("anime");
  });
});

describe("CanonicalStyleContract — drift scoring", () => {
  it("unresolved source → risk 1", () => {
    const r = computeStyleDriftRisk({
      source: "unresolved",
      hasExplicitStylePack: false,
    });
    expect(r.score).toBe(1);
    expect(r.reasons).toContain("style_contract_unresolved");
  });

  it("bound stylePack + manga family → risk 0", () => {
    const r = computeStyleDriftRisk({
      source: "project_style_pack",
      hasExplicitStylePack: true,
      rawAnatomyBias: "stylized",
      rawRenderFamily: "manga",
    });
    expect(r.score).toBe(0);
  });

  it("realistic anatomy + semi_realistic family → drift > 0.6", () => {
    const r = computeStyleDriftRisk({
      source: "project_style_pack",
      hasExplicitStylePack: true,
      rawAnatomyBias: "realistic",
      rawRenderFamily: "semi_realistic",
    });
    expect(r.score).toBeGreaterThan(0.6);
    expect(r.reasons).toContain("style_contract_realistic_anatomy_requested");
    expect(r.reasons).toContain("style_contract_semi_realistic_render_family");
  });

  it("preset fallback without a bound stylePack → non-zero drift", () => {
    const r = computeStyleDriftRisk({
      source: "preset_default",
      hasExplicitStylePack: false,
      rawAnatomyBias: "stylized",
      rawRenderFamily: "manga",
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons).toContain("style_contract_preset_default_fallback");
    expect(r.reasons).toContain("style_contract_no_bound_stylepack");
  });

  it("clamps at 1", () => {
    const r = computeStyleDriftRisk({
      source: "explicit_override",
      hasExplicitStylePack: false,
      rawAnatomyBias: "realistic",
      rawRenderFamily: "western",
    });
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("CanonicalStyleContract — unresolved sentinel", () => {
  it("createUnresolvedStyleContract exposes the global hard negatives", () => {
    const c = createUnresolvedStyleContract("no_project_stylepack");
    expect(c.source).toBe("unresolved");
    expect(c.styleDriftRiskScore).toBe(1);
    expect(c.styleDriftReasons).toContain("no_project_stylepack");
    for (const token of GLOBAL_MANGA_ONLY_NEGATIVE_TERMS) {
      expect(c.globalHardNegatives).toContain(token);
    }
  });

  it("GLOBAL_MANGA_ONLY_NEGATIVE_TERMS contains the critical photoreal-family tokens", () => {
    for (const token of [
      "photorealistic",
      "photograph",
      "3d render",
      "unreal engine",
      "hyperrealistic",
      "live action",
    ]) {
      expect(GLOBAL_MANGA_ONLY_NEGATIVE_TERMS).toContain(token);
    }
  });
});
