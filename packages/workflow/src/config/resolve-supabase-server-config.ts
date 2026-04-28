/**
 * Résolution unique des variables Supabase côté serveur (worker / render),
 * avec alias d'env courants (NEXT_PUBLIC_*, noms alternatifs).
 */

export interface ResolvedSupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
  /** Bucket principal pour les uploads panels (fallbacks possibles côté caller). */
  bucket: string;
  anonKey?: string;
}

export function resolveSupabaseServerConfig(): ResolvedSupabaseServerConfig | null {
  const url =
    process.env.SUPABASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || "";

  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim()
    || process.env.SUPABASE_BUCKET?.trim()
    || process.env.STORAGE_BUCKET?.trim()
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
