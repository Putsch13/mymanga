/**
 * Résolution unique des variables Supabase côté serveur (worker / render),
 * avec alias d'env courants (NEXT_PUBLIC_*, noms alternatifs).
 *
 * Lecture cohérente via getAppConfig() pour les vars couvertes par le
 * schéma zod (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * STORAGE_BUCKET, SUPABASE_STORAGE_BUCKET). Les autres alias (SUPABASE_BUCKET,
 * SUPABASE_SERVICE_ROLE, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY) restent lus depuis process.env pour
 * préserver la rétrocompatibilité.
 */
import { getAppConfig } from "@manga-ai-studio/core";

export interface ResolvedSupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
  /** Bucket principal pour les uploads panels (fallbacks possibles côté caller). */
  bucket: string;
  anonKey?: string;
}

export function resolveSupabaseServerConfig(): ResolvedSupabaseServerConfig | null {
  const cfg = getAppConfig();
  const url = cfg.SUPABASE_URL?.trim() || cfg.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";

  const serviceRoleKey =
    cfg.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || "";

  const bucket =
    cfg.SUPABASE_STORAGE_BUCKET?.trim()
    || process.env.SUPABASE_BUCKET?.trim()
    || cfg.STORAGE_BUCKET.trim()
    || "MyManga";

  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || undefined;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey, bucket, anonKey };
}
