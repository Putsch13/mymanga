import { describe, it, expect } from "vitest";
import {
  buildNegativePromptFromStyleContract,
  resolveCanonicalStyleContract,
} from "./style-contract-resolver";

describe("resolveCanonicalStyleContract", () => {
  it("returns unresolved when no stylePack and no preset", () => {
    const c = resolveCanonicalStyleContract({ stylePack: null });
    expect(c.source).toBe("unresolved");
    expect(c.styleDriftRiskScore).toBe(1);
  });

  it("collapses a realistic stylePack anatomyBias to grounded and flags drift", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: {
        id: "sp1",
        name: "seinen_gritty",
        renderFamily: "manga",
        lineWeight: "thick",
        shadingMode: "ink_bw",
        anatomyBias: "realistic",
      },
    });
    expect(c.source).toBe("project_style_pack");
    expect(c.anatomyBias).toBe("grounded");
    expect(c.styleDriftReasons).toContain(
      "style_contract_realistic_anatomy_requested",
    );
    expect(c.styleDriftRiskScore).toBeGreaterThan(0);
  });

  it("collapses semi_realistic renderFamily to manga and flags drift", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: {
        id: "sp1",
        name: "custom",
        renderFamily: "semi_realistic",
        anatomyBias: "grounded",
      },
    });
    expect(c.renderFamily).toBe("manga");
    expect(c.styleDriftReasons).toContain(
      "style_contract_semi_realistic_render_family",
    );
  });

  it("maps legacy lineWeight thick→heavy and shadingMode screentone→ink_bw", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: {
        id: "sp1",
        name: "shonen_classic",
        lineWeight: "thick",
        shadingMode: "screentone",
        anatomyBias: "stylized",
        renderFamily: "manga",
      },
    });
    expect(c.lineWeight).toBe("heavy");
    expect(c.shadingMode).toBe("ink_bw");
  });

  it("exposes GLOBAL_MANGA_ONLY_NEGATIVE_TERMS as globalHardNegatives", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: {
        id: "sp1",
        name: "shonen_classic",
        anatomyBias: "stylized",
        renderFamily: "manga",
      },
    });
    expect(c.globalHardNegatives).toContain("photorealistic");
    expect(c.globalHardNegatives).toContain("3d render");
  });

  it("buildNegativePromptFromStyleContract dedupe + merge", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: {
        id: "sp1",
        name: "shonen_classic",
        anatomyBias: "stylized",
        renderFamily: "manga",
        negativeConstraints: ["chibi", "photorealistic"],
      },
    });
    const prompt = buildNegativePromptFromStyleContract(c, [
      "watermark",
      "chibi",
    ]);
    const parts = prompt.split(", ").map((s) => s.trim().toLowerCase());
    // Presence
    expect(parts).toContain("photorealistic");
    expect(parts).toContain("chibi");
    expect(parts).toContain("watermark");
    // Dedup (appears exactly once)
    expect(parts.filter((p) => p === "chibi")).toHaveLength(1);
    expect(parts.filter((p) => p === "photorealistic")).toHaveLength(1);
  });

  it("preset-only (no stylePack) still resolves but as preset_default", () => {
    const c = resolveCanonicalStyleContract({
      stylePack: null,
      presetSlug: "shonen_classic",
    });
    expect(c.source).toBe("preset_default");
    expect(c.styleName).toBe("shonen_classic");
    expect(c.styleDriftReasons).toContain(
      "style_contract_preset_default_fallback",
    );
  });
});
