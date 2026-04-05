/**
 * Rate limiting en mémoire (single-instance).
 * Pour multi-instances, brancher Upstash Redis (UPSTASH_REDIS_REST_URL).
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  /** Nombre max de requêtes dans la fenêtre */
  limit: number;
  /** Durée de la fenêtre en secondes */
  windowSecs: number;
}

const CONFIGS: Record<string, RateLimitConfig> = {
  pipeline:        { limit: 5,  windowSecs: 3600 },
  generate_visual: { limit: 15, windowSecs: 3600 },
  continue:        { limit: 20, windowSecs: 3600 },
  train_lora:      { limit: 2,  windowSecs: 86400 },
  tts:             { limit: 50, windowSecs: 3600 },
};

export function checkRateLimit(
  userId: string,
  action: keyof typeof CONFIGS,
): { ok: true } | { ok: false; retryAfterSecs: number; message: string } {
  const config = CONFIGS[action];
  if (!config) return { ok: true };

  const key = `${action}:${userId}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSecs * 1000 });
    return { ok: true };
  }

  if (entry.count >= config.limit) {
    const retryAfterSecs = Math.ceil((entry.resetAt - now) / 1000);
    return {
      ok: false,
      retryAfterSecs,
      message: `Limite atteinte (${config.limit} par ${config.windowSecs < 3600 ? `${config.windowSecs}s` : `${config.windowSecs / 3600}h`}). Réessaie dans ${retryAfterSecs}s.`,
    };
  }

  entry.count++;
  return { ok: true };
}
