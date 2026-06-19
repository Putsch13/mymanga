/**
 * PATCH 11 — Artefacts debug par panel (blueprint, spec, prompt, route FAL, etc.).
 *
 * Activation : définir `MYMANGA_PANEL_DEBUG_DUMP_DIR` (répertoire racine des dumps)
 * ou `MYMANGA_PANEL_DEBUG_DUMP=1` (écrit sous `var/panel-debug-dumps/` depuis cwd).
 * Sans ces variables, les appels sont des no-op (aucun I/O).
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FalRenderRoute, PanelRenderSpec } from "@manga-ai-studio/ai";
import { logPipelineInfo, logPipelineWarn, logPipelineError } from "../lib/pipeline-logger";

export type PanelDebugDumpPhase = "pre_generate" | "post_success" | "post_failure";

export interface DumpPanelDebugArtifactsInput {
  chapterId: string;
  panelId: string;
  /** Pré-FAL / succès / échec — défaut `pre_generate` si omis. */
  phase?: PanelDebugDumpPhase;
  blueprint?: unknown;
  renderSpec?: unknown;
  prompt?: { positive: string; negative: string };
  providerPayload?: unknown;
  outputUrl?: string | null;
  error?: unknown;
  /** Résumé panel (QA, retries, plan canonique) — phase 11 debug studio. */
  renderDebug?: Record<string, unknown>;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 200) || "unknown";
}

function resolveDumpBaseDir(): string | null {
  const explicit = process.env.MYMANGA_PANEL_DEBUG_DUMP_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  if (process.env.MYMANGA_PANEL_DEBUG_DUMP === "1" || process.env.MYMANGA_PANEL_DEBUG_DUMP === "true") {
    return path.resolve(process.cwd(), "var", "panel-debug-dumps");
  }
  return null;
}

function serializeErrorValue(err: unknown): unknown {
  if (err === undefined || err === null) return null;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack ?? null };
  }
  if (typeof err === "object") {
    try {
      return JSON.parse(JSON.stringify(err, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
    } catch {
      return { value: String(err) };
    }
  }
  return { value: String(err) };
}

function safeJsonStringify(payload: unknown): string {
  return JSON.stringify(
    payload,
    (_key, value) => (typeof value === "bigint" ? Number(value) : value),
    2,
  );
}

/**
 * Aperçu du payload côté provider (aligné sur {@link createDefaultPanelImageGenerator}) :
 * route FAL + `providerParams` passés à l’adapter, sans URLs binaires.
 */
export function buildProviderPayloadPreview(spec: PanelRenderSpec, route: FalRenderRoute): unknown {
  return {
    route,
    providerParams: {
      referencePolicy: route.referencePolicy,
      panelCategory: route.panelCategory,
      retryPolicy: route.retryPolicy,
      v3RenderMode: spec.renderMode,
      v3SubjectFocus: spec.subjectFocus,
      v3CutawayType: spec.cutawayType,
      skipPromptTranslation: true,
    },
    referenceCounts: {
      characterRefs: spec.imageReferences.characterRefs.length,
      environmentRefs: spec.imageReferences.environmentRefs.length,
      panelRefs: spec.imageReferences.panelRefs.length,
      styleRefs: spec.imageReferences.styleRefs.length,
    },
    layoutMeta: spec.layoutMeta ?? null,
  };
}

/**
 * Écrit un fichier JSON par invocation sous
 * `{base}/{chapterId}/{panelId}/{phase}-{timestamp}.json`.
 * Ne throw jamais : les erreurs sont loguées sur `console.warn`.
 */
export async function dumpPanelDebugArtifacts(input: DumpPanelDebugArtifactsInput): Promise<void> {
  const base = resolveDumpBaseDir();
  if (!base) return;

  const dir = path.join(base, sanitizeSegment(input.chapterId), sanitizeSegment(input.panelId));
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const phase = input.phase ?? "pre_generate";
  const file = path.join(dir, `${phase}-${ts}.json`);

  const body = {
    dumpedAt: new Date().toISOString(),
    chapterId: input.chapterId,
    panelId: input.panelId,
    phase,
    blueprint: input.blueprint ?? null,
    renderSpec: input.renderSpec ?? null,
    prompt: input.prompt ?? null,
    providerPayload: input.providerPayload ?? null,
    outputUrl: input.outputUrl ?? null,
    error: serializeErrorValue(input.error),
    renderDebug: input.renderDebug ?? null,
  };

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, safeJsonStringify(body), "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logPipelineWarn("panel.debug.dump.write_failed", { file: file, error: msg });
  }
}
