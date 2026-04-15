import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

interface RateLimitEntry { count: number; resetAt: number; }
const memoryStore = new Map<string, RateLimitEntry>();

const CONFIGS = {
  pipeline:        { requests: 5,  window: "1 h" as const },
  generate_visual: { requests: 15, window: "1 h" as const },
  continue:        { requests: 20, window: "1 h" as const },
  train_lora:      { requests: 2,  window: "1 d" as const },
  tts:             { requests: 50, window: "1 h" as const },
};

type RateLimitAction = keyof typeof CONFIGS;

let redis: Redis | null = null;
const upstashLimiters = new Map<RateLimitAction, Ratelimit>();

function getUpstashLimiter(action: RateLimitAction): Ratelimit {
  if (!upstashLimiters.has(action)) {
    if (!redis) {
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }
    const cfg = CONFIGS[action];
    upstashLimiters.set(
      action,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
        prefix: `manga:rl:${action}`,
      })
    );
  }
  return upstashLimiters.get(action)!;
}

function checkMemoryLimit(userId: string, action: RateLimitAction): { ok: boolean; retryAfterSecs: number } {
  const cfg = CONFIGS[action];
  const windowSecs = cfg.window === "1 h" ? 3600 : 86400;
  const key = `${action}:${userId}`;
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSecs * 1000 });
    return { ok: true, retryAfterSecs: 0 };
  }
  if (entry.count >= cfg.requests) {
    return { ok: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true, retryAfterSecs: 0 };
}

export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
): Promise<{ ok: true } | { ok: false; retryAfterSecs: number; message: string }> {
  if (!hasUpstash) {
    const result = checkMemoryLimit(userId, action);
    if (!result.ok) {
      return {
        ok: false,
        retryAfterSecs: result.retryAfterSecs,
        message: `Limite atteinte pour ${action}. Réessaie dans ${Math.ceil(result.retryAfterSecs / 60)} min.`,
      };
    }
    return { ok: true };
  }

  const limiter = getUpstashLimiter(action);
  const { success, reset } = await limiter.limit(userId);

  if (!success) {
    const retryAfterSecs = Math.ceil((reset - Date.now()) / 1000);
    return {
      ok: false,
      retryAfterSecs,
      message: `Limite atteinte pour ${action}. Réessaie dans ${Math.ceil(retryAfterSecs / 60)} min.`,
    };
  }
  return { ok: true };
}
