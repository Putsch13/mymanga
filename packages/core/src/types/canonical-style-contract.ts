/**
 * CanonicalStyleContract — Phase 2 source of STYLE truth.
 *
 * The pipeline currently resolves a project's style by picking
 * `stylePacks[0]?.name ?? "shonen_classic"` — a silent fallback that lets a
 * project slip into a generic or (worse) realistic style without any audit
 * trace. The CanonicalStyleContract replaces that lookup with an explicit,
 * validated resolution step: a project either has a canonical style bound
 * to it, or the pipeline refuses to continue.
 *
 * Key invariants:
 *   1. No image is ever generated from an implicit stylePack fallback.
 *   2. `anatomyBias` is normalised to a manga-safe value (we ban
 *      `realistic` at resolution time — realistic anatomy is how a shonen
 *      panel silently drifts into a stock-photo face).
 *   3. A fixed, centralised set of hard-negative terms (photoreal, 3d
 *      render, etc.) is appended to every packet, regardless of preset.
 *   4. Every resolution produces a `styleDriftRiskScore` that downstream
 *      validators can use to block or flag suspicious prompts.
 */

/**
 * Manga-safe anatomy biases. We deliberately drop `realistic` from the
 * canonical enum — callers that want realism must provide an explicit
 * override + accept the drift risk.
 */
export type CanonicalAnatomyBias = "stylized" | "grounded" | "chibi" | "dynamic";

/**
 * Canonical rendering family. `manga` is the default; `anime` is allowed for
 * projects that explicitly opt in. `semi_realistic` is intentionally out of
 * the canonical set — it's a drift vector and must be treated as a deviation.
 */
export type CanonicalRenderFamily = "manga" | "anime";

export type CanonicalShadingMode =
  | "cel_shading"
  | "ink_bw"
  | "hatching"
  | "painterly";

export type CanonicalLineWeight = "fine" | "medium" | "heavy";

export type StyleContractSource =
  /** Resolved from the project's bound stylePack row. */
  | "project_style_pack"
  /** Resolved from a preset when the project has none bound. */
  | "preset_default"
  /** Only used when a caller passed an explicit override — drift risk. */
  | "explicit_override"
  /** Resolution failed — downstream must refuse to generate. */
  | "unresolved";

export interface CanonicalStyleContract {
  contractVersion: "1.0.0";
  /** Stable id of the underlying StylePack / preset — used for cache keys. */
  styleId: string;
  /** Human-readable name shown in UI + audit panels. */
  styleName: string;
  renderFamily: CanonicalRenderFamily;
  lineWeight: CanonicalLineWeight;
  shadingMode: CanonicalShadingMode;
  anatomyBias: CanonicalAnatomyBias;
  /** Manga reference used to anchor the visual language. */
  referenceMangaTitle: string | null;
  /** Positive style tokens that must appear in every prompt. */
  requiredStyleTokens: string[];
  /** Negative tokens produced by this style. Combined with the global list. */
  presetNegativeTerms: string[];
  /** The hard-banned global tokens (photoreal, 3d render…). Always present. */
  globalHardNegatives: string[];
  source: StyleContractSource;
  /** Between 0 (no drift) and 1 (very high drift probability). */
  styleDriftRiskScore: number;
  /** Human-readable reasons for the drift risk — used in truth report. */
  styleDriftReasons: string[];
}

/**
 * Hard-banned tokens on EVERY manga prompt. These are the terms that, if
 * they ever leak into a positive prompt, cause the generator to drop the
 * manga aesthetic entirely. Kept central so the style contract owns the
 * list rather than each preset re-declaring it.
 */
export const GLOBAL_MANGA_ONLY_NEGATIVE_TERMS: string[] = [
  "photorealistic",
  "photoreal",
  "photograph",
  "photography",
  "3d render",
  "3d model",
  "unreal engine",
  "octane render",
  "cinema 4d",
  "raytracing",
  "hyperrealistic",
  "hyperreal",
  "realistic skin texture",
  "dslr",
  "bokeh photo",
  "stock photo",
  "photo background",
  "live action",
];

/**
 * Creates an "unresolved" contract used to block generation. Callers MUST NOT
 * pass this to the generator — the pipeline's image-generation-pass should
 * refuse and write a truth violation.
 */
export function createUnresolvedStyleContract(
  reason: string,
): CanonicalStyleContract {
  return {
    contractVersion: "1.0.0",
    styleId: "unresolved",
    styleName: "unresolved",
    renderFamily: "manga",
    lineWeight: "medium",
    shadingMode: "ink_bw",
    anatomyBias: "stylized",
    referenceMangaTitle: null,
    requiredStyleTokens: [],
    presetNegativeTerms: [],
    globalHardNegatives: [...GLOBAL_MANGA_ONLY_NEGATIVE_TERMS],
    source: "unresolved",
    styleDriftRiskScore: 1,
    styleDriftReasons: [reason],
  };
}

/**
 * Computes a style drift risk score from a (partially resolved) contract
 * and the raw hints it came from. This is the single place that decides
 * what "high drift" looks like.
 */
export function computeStyleDriftRisk(input: {
  rawAnatomyBias?: string | null;
  rawRenderFamily?: string | null;
  source: StyleContractSource;
  hasExplicitStylePack: boolean;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (input.source === "unresolved") {
    return { score: 1, reasons: ["style_contract_unresolved"] };
  }
  if (input.source === "preset_default") {
    score += 0.15;
    reasons.push("style_contract_preset_default_fallback");
  }
  if (input.source === "explicit_override") {
    score += 0.25;
    reasons.push("style_contract_explicit_override");
  }
  if (!input.hasExplicitStylePack) {
    score += 0.2;
    reasons.push("style_contract_no_bound_stylepack");
  }
  if (input.rawAnatomyBias === "realistic") {
    score += 0.35;
    reasons.push("style_contract_realistic_anatomy_requested");
  }
  if (input.rawRenderFamily === "semi_realistic") {
    score += 0.3;
    reasons.push("style_contract_semi_realistic_render_family");
  }
  if (
    input.rawRenderFamily &&
    input.rawRenderFamily !== "manga" &&
    input.rawRenderFamily !== "anime"
  ) {
    score += 0.2;
    reasons.push(`style_contract_unsupported_render_family:${input.rawRenderFamily}`);
  }
  return { score: Math.min(1, score), reasons };
}

/**
 * Normalises a raw anatomyBias to the canonical enum. Realistic is collapsed
 * to `grounded` (closest manga-safe neighbour); unknown values fall back to
 * `stylized`. This is the function that enforces the "no realistic" invariant.
 */
export function normaliseAnatomyBias(raw: string | null | undefined): {
  value: CanonicalAnatomyBias;
  wasCoerced: boolean;
} {
  if (raw === "stylized" || raw === "grounded" || raw === "chibi" || raw === "dynamic") {
    return { value: raw, wasCoerced: false };
  }
  if (raw === "realistic") {
    return { value: "grounded", wasCoerced: true };
  }
  return { value: "stylized", wasCoerced: true };
}

/**
 * Normalises a raw renderFamily. Non-canonical families (semi_realistic,
 * gothic, horror, western) are coerced to `manga` — their flavour must be
 * conveyed via line/shading/tokens, not by weakening the render family.
 */
export function normaliseRenderFamily(
  raw: string | null | undefined,
): { value: CanonicalRenderFamily; wasCoerced: boolean } {
  if (raw === "manga" || raw === "anime") {
    return { value: raw, wasCoerced: false };
  }
  return { value: "manga", wasCoerced: true };
}
