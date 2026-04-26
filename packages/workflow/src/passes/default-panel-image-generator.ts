/**
 * default-panel-image-generator — branche le vrai adapter FAL dans le
 * render-pass v3.
 *
 * Entrée : un `PanelRenderSpec` validé + prompt minimal + route FAL
 * résolue. Sortie : `{ ok, imageUrl?, error? }`.
 *
 * Règles :
 *   - si `FAL_KEY` absent, retourne un mock (createMockImageProvider) :
 *     utile en tests / CI, jamais bloquant
 *   - utilise `createFalPanelAdapter` (le même que le legacy) pour
 *     garantir la compat des paramètres FAL (seeds, LoRAs, etc.)
 *   - la persistence `SceneImage` n'est PAS faite ici : la v3 stocke la
 *     route + l'URL image dans `outline.renderResultV2` pour audit, et
 *     la bascule finale vers le schéma `SceneImage` se fera dans un
 *     sprint dédié (évite une double écriture pendant la cohabitation)
 */

import {
  createFalPanelAdapter,
  type FalRenderRoute,
  type PanelRenderSpec,
} from "@manga-ai-studio/ai";
import { isPremiumImageMockAllowed } from "@manga-ai-studio/core";
import type { RunRenderPassInput } from "./render-pass";

export interface DefaultPanelImageGeneratorArgs {
  spec: PanelRenderSpec;
  prompt: string;
  negative: string;
  route: FalRenderRoute;
}

export interface DefaultPanelImageGeneratorResult {
  ok: boolean;
  imageUrl?: string;
  error?: string;
  provider?: string;
  model?: string;
  seed?: number | null;
}

/**
 * Construit une fonction `generatePanelImage` prête à être injectée dans
 * `runRenderPass`. Utilise `process.env.FAL_KEY` par défaut.
 *
 * ```ts
 * await runRenderPass({
 *   ...,
 *   generatePanelImage: createDefaultPanelImageGenerator(),
 * })
 * ```
 */
export function createDefaultPanelImageGenerator(
  options: { apiKey?: string; forbidMock?: boolean } = {},
): NonNullable<RunRenderPassInput["generatePanelImage"]> {
  const apiKey = options.apiKey ?? process.env.FAL_KEY;
  const forbidMock = options.forbidMock === true;
  if (!apiKey && (forbidMock || !isPremiumImageMockAllowed())) {
    throw new Error(
      "fal_key_required: génération image impossible sans FAL_KEY lorsque les mocks sont interdits (production / premium-only).",
    );
  }
  const adapter = createFalPanelAdapter(apiKey);

  return async ({ spec, prompt, negative, route }) => {
    try {
      const refs = flattenReferenceUrls(spec);
      const fromLayout = normalizeAspectRatioToSemantic(spec.layoutMeta?.targetAspectRatio);
      const dims =
        fromLayout != null
          ? resolveDimensionsFromAspectRatio(fromLayout)
          : mapSizePresetToDimensions(route.sizePreset);
      const result = await adapter.generateImage({
        mode: "PANEL_FINAL",
        positivePrompt: prompt,
        negativePrompt: negative,
        width: dims.width,
        height: dims.height,
        referenceImageUrls: refs,
        providerParams: {
          referencePolicy: route.referencePolicy,
          panelCategory: route.panelCategory,
          retryPolicy: route.retryPolicy,
          v3RenderMode: spec.renderMode,
          v3SubjectFocus: spec.subjectFocus,
          v3CutawayType: spec.cutawayType,
          // PREMIUM H16 — le prompt vient déjà de `buildMinimalPanelPromptStrict`
          // (anglais propre, court, non contradictoire). On interdit au
          // fal-adapter-shared de re-traduire le prompt par dessus.
          skipPromptTranslation: true,
        },
      });
      return {
        ok: true,
        imageUrl: result.imageUrl,
        provider: result.provider,
        model: result.model,
        seed: result.seed ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `fal_generate_failed: ${msg}` };
    }
  };
}

function flattenReferenceUrls(spec: PanelRenderSpec): string[] {
  const urls: (string | null)[] = [];
  for (const r of spec.imageReferences.characterRefs) urls.push(r.url);
  // P0.2 — environmentRefs.url peut être null pour les lieux inférés
  for (const r of spec.imageReferences.environmentRefs) urls.push(r.url);
  for (const r of spec.imageReferences.panelRefs) urls.push(r.url);
  for (const r of spec.imageReferences.styleRefs) urls.push(r.url);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const u of urls) {
    if (!u) continue; // Filtre les nulls
    if (seen.has(u)) continue;
    seen.add(u);
    deduped.push(u);
  }
  return deduped;
}

function mapSizePresetToDimensions(preset: FalRenderRoute["sizePreset"]): {
  width: number;
  height: number;
} {
  switch (preset) {
    case "portrait":
      return resolveDimensionsFromAspectRatio("portrait");
    case "landscape":
      return resolveDimensionsFromAspectRatio("landscape");
    case "square":
    default:
      return resolveDimensionsFromAspectRatio("square");
  }
}

/** Legacy `2:3` / `3:2` / `1:1` → sémantique pour FAL. */
function normalizeAspectRatioToSemantic(
  ratio?: string | null,
): "portrait" | "landscape" | "square" | null {
  if (ratio == null || ratio === "") return null;
  const n = ratio.trim().toLowerCase();
  if (n === "portrait" || n === "2:3" || n === "2/3") return "portrait";
  if (n === "landscape" || n === "3:2" || n === "3/2") return "landscape";
  if (n === "square" || n === "1:1" || n === "1/1") return "square";
  return null;
}

export function resolveDimensionsFromAspectRatio(ratio?: string | null): { width: number; height: number } {
  const semantic = normalizeAspectRatioToSemantic(ratio) ?? "square";
  switch (semantic) {
    case "portrait":
      return { width: 896, height: 1152 };
    case "landscape":
      return { width: 1152, height: 768 };
    case "square":
    default:
      return { width: 1024, height: 1024 };
  }
}
