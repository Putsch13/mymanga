/**
 * Logger structuré minimal : wraps console avec un préfixe normalisé et
 * une sortie JSON quand LOG_FORMAT=json. Permet d'agréger proprement
 * sur un sink (Datadog, Betterstack, Grafana Loki) sans dépendance.
 *
 * Usage :
 *   const log = createLogger("pipeline:image-gen");
 *   log.info("panel done", { panelId, driftScore });
 *   log.warn("drift detected", { characterId, severity });
 *   log.error("fal submit failed", { status, requestId });
 */
import { getAppConfig } from "./config/app-config";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(scope: string): StructuredLogger;
}

function shouldLog(level: LogLevel): boolean {
  const min = (getAppConfig().LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  return order[level] >= (order[min] ?? 20);
}

function emit(scope: string, level: LogLevel, message: string, fields?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(fields ?? {}),
  };
  const json = getAppConfig().LOG_FORMAT === "json";
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (json) {
    sink(JSON.stringify(payload));
  } else {
    const extras = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
    sink(`[${scope}] ${level.toUpperCase()} ${message}${extras}`);
  }
}

export function createLogger(scope: string): StructuredLogger {
  return {
    debug: (m, f) => emit(scope, "debug", m, f),
    info: (m, f) => emit(scope, "info", m, f),
    warn: (m, f) => emit(scope, "warn", m, f),
    error: (m, f) => emit(scope, "error", m, f),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}
