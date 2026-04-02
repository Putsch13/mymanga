import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostics publics (sans secrets) pour debug Render/Supabase/Inngest.
 * Ne retourne que des booléens/strings non sensibles.
 */
export async function GET() {
  const env = {
    nodeEnv: process.env.NODE_ENV ?? null,
    authDisabled: process.env.AUTH_DISABLED === "true",
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasFalKey: Boolean(process.env.FAL_KEY),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasInngestEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
    hasInngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
    adminEmailsConfigured: Boolean((process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "").trim()),
  };

  return NextResponse.json({ ok: true, env });
}

