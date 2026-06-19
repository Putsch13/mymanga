/**
 * P4.1 — Logger structuré JSON pour le pipeline.
 *
 * Objectif : uniformiser les logs `[pipeline:*]` du workflow derrière une
 * seule fonction qui émet un JSON par ligne sur stdout/stderr. En prod,
 * ça rend les logs triviaux à grep / parser par les agrégateurs
 * (`grep '"event":"shot-plan"'` au lieu de regex fragiles).
 *
 * Règles :
 *   - NE PAS lever si `payload` contient des types non-sérialisables :
 *     on tombe sur un log "fallback" minimal plutôt que de crasher la pass.
 *   - Les champs de niveau 1 standardisés : `level`, `event`, `ts`, `ns`
 *     (namespace, default "pipeline"). Tout le reste va dans `payload`.
 *   - Niveau "error" va sur stderr, le reste sur stdout.
 */

export type PipelineLogLevel = "info" | "warn" | "error";

export type PipelineLogOptions = {
  ns?: string;
  jobId?: string;
  chapterId?: string;
  projectId?: string;
};

function safeSerialize(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    JSON.stringify(value);
    return value;
  } catch {
    try {
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(value, (_k, v) => {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[circular]";
            seen.add(v);
          }
          if (typeof v === "bigint") return v.toString();
          return v;
        }),
      );
    } catch {
      return "[unserializable]";
    }
  }
}

export function logPipeline(
  level: PipelineLogLevel,
  event: string,
  payload: Record<string, unknown> = {},
  opts: PipelineLogOptions = {},
): void {
  const line = {
    level,
    ns: opts.ns ?? "pipeline",
    event,
    ts: new Date().toISOString(),
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...(opts.chapterId ? { chapterId: opts.chapterId } : {}),
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    payload: safeSerialize(payload) ?? {},
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(line);
  } catch {
    serialized = JSON.stringify({
      level,
      ns: opts.ns ?? "pipeline",
      event,
      ts: new Date().toISOString(),
      payload: "[serialization_failed]",
    });
  }

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

/** Sugar helpers for common levels. */
export const logPipelineInfo = (event: string, payload: Record<string, unknown> = {}, opts: PipelineLogOptions = {}): void =>
  logPipeline("info", event, payload, opts);

export const logPipelineWarn = (event: string, payload: Record<string, unknown> = {}, opts: PipelineLogOptions = {}): void =>
  logPipeline("warn", event, payload, opts);

export const logPipelineError = (event: string, payload: Record<string, unknown> = {}, opts: PipelineLogOptions = {}): void =>
  logPipeline("error", event, payload, opts);
