/**
 * AiEngineResult — Contrat de résultat pour tous les appels IA premium.
 *
 * Tous les agents LLM et services IA doivent retourner ce type.
 * En mode premium, si usedFallback = true, le pipeline doit throw.
 *
 * Règles fortes:
 *   - Aucun fallback silencieux en premium
 *   - Le résultat doit tracer le moteur utilisé
 *   - Les warnings doivent être exploitables
 */

export interface AiEngineResult<T> {
  data: T;
  engine: string;
  model?: string;
  usedFallback: boolean;
  fallbackReason?: string;
  warnings: string[];
  rawResponseId?: string;
  latencyMs?: number;
}

export function createSuccessResult<T>(
  data: T,
  engine: string,
  options?: {
    model?: string;
    warnings?: string[];
    rawResponseId?: string;
    latencyMs?: number;
  }
): AiEngineResult<T> {
  return {
    data,
    engine,
    model: options?.model,
    usedFallback: false,
    warnings: options?.warnings ?? [],
    rawResponseId: options?.rawResponseId,
    latencyMs: options?.latencyMs,
  };
}

export function createFallbackResult<T>(
  data: T,
  engine: string,
  fallbackReason: string,
  options?: {
    model?: string;
    warnings?: string[];
    latencyMs?: number;
  }
): AiEngineResult<T> {
  return {
    data,
    engine,
    model: options?.model,
    usedFallback: true,
    fallbackReason,
    warnings: options?.warnings ?? [],
    latencyMs: options?.latencyMs,
  };
}

export function assertNoPremiumFallback<T>(
  result: AiEngineResult<T>,
  context: string
): void {
  if (result.usedFallback) {
    throw new Error(
      `premium_ai_fallback_forbidden:${result.engine}:${context}:${result.fallbackReason ?? "unknown"}`
    );
  }
}

export function hasFallbackWarning(result: AiEngineResult<unknown>): boolean {
  return result.usedFallback || 
    result.warnings.some(w => /fallback|degraded|stub/i.test(w));
}

export function assertPremiumAiResult<T>(
  result: AiEngineResult<T>,
  isPremiumRun: boolean,
  context: string
): T {
  if (isPremiumRun) {
    assertNoPremiumFallback(result, context);
    if (hasFallbackWarning(result)) {
      throw new Error(
        `premium_ai_degraded_warning:${result.engine}:${context}:${result.warnings.join("|")}`
      );
    }
  }
  return result.data;
}
