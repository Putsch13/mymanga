/**
 * Mode premium strict explicite (variables d’environnement `=== "true"`).
 * Distinct de `isPipelineV3PremiumOnlyEnabled()` qui peut être vrai en production
 * sans variable explicite.
 */

export function isPremiumStrictMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.PIPELINE_V3_PREMIUM_ONLY === "true"
    || env.NEXT_PUBLIC_PIPELINE_V3_PREMIUM_ONLY === "true"
  );
}

/** En premium strict, lève si `condition` est vraie (ex. fallback interdit). */
export function assertNotPremiumSilentFallback(
  condition: boolean,
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isPremiumStrictMode(env) && condition) {
    throw new Error(code);
  }
}

/** Alias stable pour la checklist anti-dette (même comportement que `assertNotPremiumSilentFallback`). */
export const assertNotPremiumFallback = assertNotPremiumSilentFallback;
