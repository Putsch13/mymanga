/**
 * Style contract resolver — Phase 2.
 *
 * Converts the raw Prisma `StylePack` row bound to a project into a
 * `CanonicalStyleContract`. Replaces the old silent
 *   `stylePacks[0]?.name ?? "shonen_classic"`
 * fallback: if no pack is bound we still return a contract, but we mark
 * it as `preset_default` or `unresolved` so downstream truth reports can
 * reason about the drift risk.
 */

import {
  GLOBAL_MANGA_ONLY_NEGATIVE_TERMS,
  type CanonicalStyleContract,
  computeStyleDriftRisk,
  createUnresolvedStyleContract,
  normaliseAnatomyBias,
  normaliseRenderFamily,
} from "@manga-ai-studio/core";

/** Minimal shape the resolver needs from a Prisma StylePack row. */
export interface RawStylePackRow {
  id?: string | null;
  name?: string | null;
  renderFamily?: string | null;
  lineWeight?: string | null;
  shadingMode?: string | null;
  anatomyBias?: string | null;
  negativeConstraints?: unknown;
  referenceTitle?: string | null;
  styleRefImageUrl?: string | null;
}

export interface StyleContractResolveInput {
  /** Usually `stylePacks[0]` from the pipeline. `null` means no pack bound. */
  stylePack: RawStylePackRow | null | undefined;
  /** Optional preset used to seed a contract when no stylePack is bound. */
  presetSlug?: string | null;
  /** Optional hard overrides (debug flows). Marks source as explicit_override. */
  override?: Partial<
    Pick<
      CanonicalStyleContract,
      "renderFamily" | "lineWeight" | "shadingMode" | "anatomyBias"
    >
  >;
}

const LINE_WEIGHTS = ["fine", "medium", "heavy"] as const;
const SHADING_MODES = ["cel_shading", "ink_bw", "hatching", "painterly"] as const;

function normaliseLineWeight(
  raw: string | null | undefined,
): CanonicalStyleContract["lineWeight"] {
  const v = (raw ?? "").toLowerCase();
  // Legacy seinen/mecha/noir values map thick→heavy, thin→fine, variable→medium.
  if (v === "thick" || v === "heavy") return "heavy";
  if (v === "thin" || v === "fine") return "fine";
  if ((LINE_WEIGHTS as readonly string[]).includes(v)) {
    return v as CanonicalStyleContract["lineWeight"];
  }
  return "medium";
}

function normaliseShadingMode(
  raw: string | null | undefined,
): CanonicalStyleContract["shadingMode"] {
  const v = (raw ?? "").toLowerCase();
  // Prisma's shadingMode has more values (screentone, grayscale, flat_color,
  // watercolor, cel_color) which we collapse onto the canonical four.
  if (v === "screentone" || v === "grayscale" || v === "ink_bw") return "ink_bw";
  if (v === "watercolor" || v === "painterly") return "painterly";
  if (v === "hatching") return "hatching";
  if (
    v === "cel_shading" ||
    v === "cel_color" ||
    v === "flat_color" ||
    v === "cel"
  ) {
    return "cel_shading";
  }
  if ((SHADING_MODES as readonly string[]).includes(v)) {
    return v as CanonicalStyleContract["shadingMode"];
  }
  return "ink_bw";
}

function presetNegativeTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/**
 * Resolves the canonical style contract for a project. Always succeeds
 * — the pipeline never refuses here; it's the caller's job to inspect
 * `contract.source === "unresolved"` or `styleDriftRiskScore >= 0.8`
 * and decide whether to continue.
 */
export function resolveCanonicalStyleContract(
  input: StyleContractResolveInput,
): CanonicalStyleContract {
  const { stylePack, presetSlug, override } = input;

  const hasExplicitStylePack = Boolean(stylePack && stylePack.id);
  const rawAnatomyBias = override?.anatomyBias ?? stylePack?.anatomyBias ?? null;
  const rawRenderFamily = override?.renderFamily ?? stylePack?.renderFamily ?? null;

  if (!hasExplicitStylePack && !presetSlug) {
    return createUnresolvedStyleContract("no_project_stylepack_and_no_preset");
  }

  const anatomy = normaliseAnatomyBias(rawAnatomyBias);
  const render = normaliseRenderFamily(rawRenderFamily);
  const lineWeight = normaliseLineWeight(override?.lineWeight ?? stylePack?.lineWeight);
  const shadingMode = normaliseShadingMode(override?.shadingMode ?? stylePack?.shadingMode);

  const source: CanonicalStyleContract["source"] = override
    ? "explicit_override"
    : hasExplicitStylePack
      ? "project_style_pack"
      : "preset_default";

  const drift = computeStyleDriftRisk({
    source,
    hasExplicitStylePack,
    rawAnatomyBias,
    rawRenderFamily,
  });

  const styleId = stylePack?.id ?? presetSlug ?? "preset_default";
  const styleName =
    stylePack?.name ?? presetSlug ?? stylePack?.id ?? "project_style_pack";

  return {
    contractVersion: "1.0.0",
    styleId,
    styleName,
    renderFamily: render.value,
    lineWeight,
    shadingMode,
    anatomyBias: anatomy.value,
    referenceMangaTitle: stylePack?.referenceTitle ?? null,
    requiredStyleTokens: [],
    presetNegativeTerms: presetNegativeTerms(stylePack?.negativeConstraints),
    globalHardNegatives: [...GLOBAL_MANGA_ONLY_NEGATIVE_TERMS],
    source,
    styleDriftRiskScore: drift.score,
    styleDriftReasons: drift.reasons,
  };
}

/**
 * Merges the preset + global negative tokens into a final negative prompt
 * string. Safe to pass the same array twice — dedupe is applied.
 */
export function buildNegativePromptFromStyleContract(
  contract: CanonicalStyleContract,
  extraNegatives: string[] = [],
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(raw.trim());
  };
  for (const x of contract.globalHardNegatives) push(x);
  for (const x of contract.presetNegativeTerms) push(x);
  for (const x of extraNegatives) push(x);
  return out.join(", ");
}
