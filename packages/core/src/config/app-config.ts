/**
 * Sprint 2 — TASK-2.1
 * Singleton de configuration d'application validé via Zod.
 *
 * Stratégie sécurité (importante) :
 *   • Le projet a déjà des fallbacks gracieux pour les providers manquants
 *     (FAL absent → fallback OpenAI, Supabase absent → mode mémoire, etc.).
 *     `getAppConfig()` ne doit donc PAS faire crasher le boot pour des
 *     variables optionnelles.
 *   • Crash uniquement en production si `DATABASE_URL` est absent (vrai
 *     bloqueur, sans DB rien ne tourne).
 *   • Pour les autres clés (FAL, OpenAI, Supabase, Stripe, …) on retourne
 *     undefined et c'est au consommateur de gérer le fallback (logique déjà
 *     en place dans `stack-readiness.ts`, `premium-strict-api-guard.ts`).
 *
 * Usage :
 *   const cfg = getAppConfig();
 *   const model = cfg.OPENAI_NARRATIVE_MODEL;
 *
 * Tests :
 *   import { _resetAppConfigForTests } from "@manga-ai-studio/core";
 *   beforeEach(() => _resetAppConfigForTests());
 */
import { z } from "zod";

const NODE_ENV_VALUES = ["development", "production", "test"] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default("development"),
  // ── Database (seul vrai requis en prod) ──────────────────────────────
  DATABASE_URL: z.string().url().optional(),
  // ── Supabase ─────────────────────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STORAGE_BUCKET: z.string().default("MyManga"),
  SUPABASE_STORAGE_BUCKET: z.string().optional(),
  // ── Pipeline flags ───────────────────────────────────────────────────
  PIPELINE_V3_PREMIUM_ONLY: z.string().optional(),
  PIPELINE_V3_STORYBOARD: z.string().optional(),
  PIPELINE_V3_RENDER_FAL: z.string().optional(),
  // ── OpenAI ───────────────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Modèles STRUCTURANTS du récit (peu d'appels/chapitre) → gpt-4o par défaut
  // pour un récit fidèle et riche. Les dialogues (≈10 appels parallèles) restent
  // sur mini pour ne pas saturer le TPM. Surchargeable par env si besoin.
  OPENAI_NARRATIVE_MODEL: z.string().default("gpt-4o"),
  OPENAI_DIALOGUE_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_AUTOFILL_MODEL: z.string().optional(),
  OPENAI_MANGA_EDITOR_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_CONTINUITY_MODEL: z.string().optional(),
  STORY_ARCHITECT_MODEL: z.string().default("gpt-4o"),
  // ── Image providers (fallbacks gérés ailleurs) ───────────────────────
  FAL_KEY: z.string().min(1).optional(),
  FAL_API_KEY: z.string().min(1).optional(),
  RUNWARE_API_KEY: z.string().min(1).optional(),
  STABILITY_API_KEY: z.string().min(1).optional(),
  BFL_API_KEY: z.string().min(1).optional(),
  // ── Inngest ──────────────────────────────────────────────────────────
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  // ── Stripe ───────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // ── Image proxy ──────────────────────────────────────────────────────
  IMAGE_PROXY_BASE_URL: z.string().optional(),
  IMAGE_PROXY_HMAC_KEY: z.string().optional(),
  // ── Logger ───────────────────────────────────────────────────────────
  LOG_LEVEL: z.string().optional(),
  LOG_FORMAT: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

/**
 * Lecture validée + cachée des variables d'environnement.
 *
 * Crash hard uniquement si NODE_ENV=production ET DATABASE_URL est absent.
 * Pour le reste, on retourne `undefined` afin que les consommateurs gèrent
 * leur propre logique de fallback (déjà en place pour stack-readiness, etc.).
 */
export function getAppConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`[app-config] invalid_env: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production" && !cfg.DATABASE_URL) {
    throw new Error("[app-config] DATABASE_URL required in production");
  }
  cachedConfig = cfg;
  return cachedConfig;
}

/** À utiliser uniquement dans les tests pour reset le cache. */
export function _resetAppConfigForTests(): void {
  cachedConfig = null;
}
