const bucket = new Map<string, { count: number; resetAt: number }>();

export function applyRateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const existing = bucket.get(key);

  if (!existing || existing.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      ok: false as const,
      remaining: 0,
      retryAfterMs: Math.max(existing.resetAt - now, 1000),
    };
  }

  existing.count += 1;
  bucket.set(key, existing);

  return { ok: true as const, remaining: Math.max(limit - existing.count, 0) };
}
