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
  options: { apiKey?: string } = {},
): NonNullable<RunRenderPassInput["generatePanelImage"]> {
  const apiKey = options.apiKey ?? process.env.FAL_KEY;
  const adapter = createFalPanelAdapter(apiKey);

  return async ({ spec, prompt, negative, route }) => {
    try {
      const refs = flattenReferenceUrls(spec);
      const dims = mapSizePresetToDimensions(route.sizePreset);
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
  const urls: string[] = [];
  for (const r of spec.imageReferences.characterRefs) urls.push(r.url);
  for (const r of spec.imageReferences.environmentRefs) urls.push(r.url);
  for (const r of spec.imageReferences.panelRefs) urls.push(r.url);
  for (const r of spec.imageReferences.styleRefs) urls.push(r.url);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const u of urls) {
    if (!u) continue;
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
      return { width: 896, height: 1152 };
    case "landscape":
      return { width: 1152, height: 768 };
    case "square":
    default:
      return { width: 1024, height: 1024 };
  }
}
