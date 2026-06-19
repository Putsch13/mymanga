import { createDefaultChapterStyleBible } from "@manga-ai-studio/ai/contracts";
import type { ChapterStyleBible } from "@manga-ai-studio/ai";

const FULL_COLOR_STYLE_SIGNALS = [
  "full color",
  "full-color",
  "fullcolor",
  "colored",
  "colour",
  "couleur",
  "cel_color",
  "flat_color",
] as const;

const LIMITED_COLOR_STYLE_SIGNALS = [
  ...FULL_COLOR_STYLE_SIGNALS,
  "pastel",
  "aquarelle",
  "watercolor",
  "watercolour",
  "soft palette",
  "limited palette",
  "color palette",
  "palette douce",
  "palette pastel",
] as const;

function hasAnyStyleSignal(values: string[], needles: readonly string[]): boolean {
  return values.some((value) => needles.some((needle) => value.includes(needle)));
}

export function buildStyleBibleFromUserProject(input: {
  project: Record<string, unknown> | null;
  stylePacks: Array<Record<string, unknown>>;
}): ChapterStyleBible {
  const base = createDefaultChapterStyleBible();
  const sp = input.stylePacks[0] ?? null;
  const projectTone = typeof input.project?.tone === "string" ? input.project.tone : null;
  const projectGenre = typeof input.project?.primaryGenre === "string" ? input.project.primaryGenre : null;
  const projectVisualStyle = typeof input.project?.visualStyle === "string" ? input.project.visualStyle : null;

  const renderFamily = sp && typeof sp.renderFamily === "string" ? sp.renderFamily : null;
  const lineWeightRaw = sp && typeof sp.lineWeight === "string" ? sp.lineWeight : null;
  const shadingModeRaw = sp && typeof sp.shadingMode === "string" ? sp.shadingMode : null;
  const contrastRaw = sp && typeof sp.contrastProfile === "string" ? sp.contrastProfile : null;
  const bgDensityRaw = sp && typeof sp.backgroundDensity === "string" ? sp.backgroundDensity : null;
  const negativeConstraints = sp && Array.isArray(sp.negativeConstraints) ? sp.negativeConstraints : [];
  const normalizedSignals = [
    projectVisualStyle,
    renderFamily,
    lineWeightRaw,
    shadingModeRaw,
    contrastRaw,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase());

  const wantsFullColor = hasAnyStyleSignal(normalizedSignals, FULL_COLOR_STYLE_SIGNALS);
  const wantsLimitedColor = wantsFullColor || hasAnyStyleSignal(normalizedSignals, LIMITED_COLOR_STYLE_SIGNALS);
  const wantsWatercolor = hasAnyStyleSignal(normalizedSignals, ["aquarelle", "watercolor", "watercolour"]);

  const lineWeightHint: ChapterStyleBible["lineWeightHint"] =
    lineWeightRaw?.toLowerCase().includes("fine") || lineWeightRaw?.toLowerCase().includes("thin")
      ? "fine"
      : lineWeightRaw?.toLowerCase().includes("bold") || lineWeightRaw?.toLowerCase().includes("heavy")
        ? "bold"
        : lineWeightRaw?.toLowerCase().includes("medium")
          ? "medium"
          : base.lineWeightHint;

  const inking: ChapterStyleBible["inking"] =
    lineWeightRaw?.toLowerCase().includes("heavy")
      ? "heavy_ink_weight"
      : lineWeightRaw?.toLowerCase().includes("light")
        ? "light_ink_weight"
        : contrastRaw?.toLowerCase().includes("high")
          ? "mixed_contrast"
          : base.inking;

  const screentoneIntensity: ChapterStyleBible["screentoneIntensity"] =
    wantsLimitedColor && !shadingModeRaw?.toLowerCase().includes("screentone")
      ? "none"
      : shadingModeRaw?.toLowerCase().includes("none")
        ? "none"
        : shadingModeRaw?.toLowerCase().includes("heavy")
          ? "heavy"
          : shadingModeRaw?.toLowerCase().includes("light")
            ? "light"
            : base.screentoneIntensity;

  const backgroundDensity: ChapterStyleBible["backgroundDensity"] =
    bgDensityRaw?.toLowerCase().includes("minimal") || bgDensityRaw?.toLowerCase().includes("low")
      ? "minimal"
      : bgDensityRaw?.toLowerCase().includes("detailed") || bgDensityRaw?.toLowerCase().includes("high")
        ? "detailed"
        : base.backgroundDensity;

  const palette: ChapterStyleBible["palette"] =
    wantsFullColor
      ? "full_color_manga"
      : wantsLimitedColor
        ? "color_limited_palette"
        : base.palette;

  const paletteLabel =
    palette === "full_color_manga"
      ? "full-color manga"
      : palette === "color_limited_palette"
        ? "limited pastel-color manga"
        : "black and white manga with screentones";

  const artStyleParts = [renderFamily, projectVisualStyle, paletteLabel].filter(Boolean);

  return {
    ...base,
    artStyle: artStyleParts.length > 0 ? artStyleParts.join(", ") : base.artStyle,
    palette,
    inking,
    screentoneIntensity,
    lineWeightHint,
    backgroundDensity,
    toneKeywords: [
      ...(projectTone ? [projectTone.toLowerCase()] : []),
      ...(projectGenre ? [projectGenre.toLowerCase()] : []),
      ...base.toneKeywords,
    ].slice(0, 6),
    forbiddenStyleKeywords: Array.from(
      new Set([
        ...base.forbiddenStyleKeywords.filter((keyword) => {
          const normalized = keyword.toLowerCase();
          if (wantsWatercolor && normalized === "watercolor") return false;
          return true;
        }),
        ...(negativeConstraints.filter((x): x is string => typeof x === "string") as string[]),
      ]),
    ),
  };
}
